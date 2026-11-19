// Supabase Edge Function "import": holt eine Rezeptseite für die App.
// Gibt die eingebetteten Rezeptangaben (schema.org/JSON-LD), Titel, Bild und
// den sichtbaren Text zurück. Das Auswerten macht die App selbst (js/importer.js),
// damit Verbesserungen ohne neues Einrichten dieser Funktion möglich sind.
// TikTok: Videobeschreibung über die offizielle oEmbed-Schnittstelle.

const MAX_BYTES = 4 * 1024 * 1024; // größere Seiten werden abgeschnitten
const TIMEOUT_MS = 15000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Nur öffentliche Internetseiten, keine internen Adressen
export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (_) { return { error: 'Das ist kein gültiger Link.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Nur Links mit http oder https werden unterstützt.' };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateHost =
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
    !host.includes('.') ||
    /^(127|10|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:');
  if (privateHost) return { error: 'Dieser Link kann nicht abgerufen werden.' };
  u.hash = '';
  return { url: u.href, host };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e] != null ? ENTITIES[e] : all;
  });
}

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + name.replace(/[:.]/g, '\\$&') + '["\'][^>]*>', 'i');
    const tag = html.match(re);
    if (tag) {
      const c = tag[0].match(/content=["']([^"']*)["']/i);
      if (c && c[1].trim()) return decodeEntities(c[1].trim());
    }
  }
  return '';
}

// Alle JSON-LD-Blöcke der Seite (fehlerhafte werden übersprungen)
export function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/^\s*\/\/.*$/gm, '');
    try { out.push(JSON.parse(raw)); }
    catch (_) {
      // häufiger Fehler: Steuerzeichen in Zeichenketten
      try { out.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' '))); } catch (_e) { /* überspringen */ }
    }
  }
  return out;
}

// Sichtbarer Text (für den Fall ohne Rezeptangaben und für eine spätere KI-Auswertung)
export function visibleText(html, max) {
  const t = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(t).replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, max || 60000);
}

export function extract(html, url) {
  const title = metaContent(html, ['og:title', 'twitter:title']) || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  return {
    url,
    title,
    description: metaContent(html, ['og:description', 'description', 'twitter:description']),
    image: metaContent(html, ['og:image', 'og:image:url', 'twitter:image']),
    siteName: metaContent(html, ['og:site_name']),
    jsonld: extractJsonLd(html),
    text: visibleText(html)
  };
}

async function fetchText(url, maxBytes) {
  const LIMIT = maxBytes || MAX_BYTES;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.7'
      }
    });
    // Auch nach Weiterleitungen nur öffentliche Adressen
    const final = checkUrl(res.url || url);
    if (final.error) throw new Error(final.error);
    const reader = res.body && res.body.getReader();
    let received = 0;
    const chunks = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        chunks.push(value);
        if (received > LIMIT) { try { await reader.cancel(); } catch (_) { /* egal */ } break; }
      }
    }
    const buf = new Uint8Array(received > LIMIT ? LIMIT : received);
    let off = 0;
    for (const c of chunks) { const part = c.subarray(0, Math.min(c.length, buf.length - off)); buf.set(part, off); off += part.length; if (off >= buf.length) break; }
    const ct = res.headers.get('content-type') || '';
    const cs = (ct.match(/charset=([\w-]+)/i) || [])[1] || 'utf-8';
    let text;
    try { text = new TextDecoder(cs).decode(buf); } catch (_) { text = new TextDecoder('utf-8').decode(buf); }
    return { status: res.status, url: res.url || url, text };
  } finally {
    clearTimeout(timer);
  }
}

// Nur angemeldete Nutzer der App dürfen das Programm benutzen (sonst wäre es ein offener Abrufdienst).
// Geprüft wird beim Anmeldedienst des eigenen Projekts.
export async function signedIn(req, projectUrl) {
  const auth = req.headers.get('authorization') || '';
  const apikey = req.headers.get('apikey') || '';
  if (!/^Bearer\s+\S+/i.test(auth) || !apikey || !projectUrl) return false;
  try {
    const r = await fetch(projectUrl.replace(/\/$/, '') + '/auth/v1/user', { headers: { Authorization: auth, apikey } });
    return r.ok;
  } catch (_) { return false; }
}

// ---------- Links prüfen: gibt es die Quelle noch? ----------
// 'gone' nur bei eindeutigen Fällen (gelöscht/privat, 404/410, Weiterleitung auf die Startseite).
// Gesperrt (403), überlastet (5xx), Zeitüberschreitung -> 'unknown' (wird nicht entfernt).
export async function checkOne(raw, fetcher) {
  const get = fetcher || fetchText;
  const c = checkUrl(raw);
  if (c.error) return 'unknown';
  try {
    if (isTikTok(c.host)) {
      const long = await tiktokResolve(c.url, get);
      if (!long) return 'unknown'; // Kurzlink nicht auflösbar -> lieber nichts entfernen
      const o = await get('https://www.tiktok.com/oembed?url=' + encodeURIComponent(long), 64 * 1024);
      if (o.status === 200) {
        try { return JSON.parse(o.text).title != null || JSON.parse(o.text).html ? 'ok' : 'unknown'; } catch (_) { return 'unknown'; }
      }
      return o.status === 400 || o.status === 404 || o.status === 410 ? 'gone' : 'unknown';
    }
    const r = await get(c.url, 64 * 1024);
    if (r.status === 404 || r.status === 410) return 'gone';
    if (r.status >= 200 && r.status < 300) {
      // Gelöschte Rezepte leiten oft auf die Startseite um
      const from = new URL(c.url), to = new URL(r.url || c.url);
      if (to.pathname.replace(/\/+$/, '') === '' && from.pathname.replace(/\/+$/, '') !== '') return 'gone';
      return 'ok';
    }
    return 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

// ---------- TikTok: Kurzlinks (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/…) auflösen ----------
export const isTikTok = host => /(^|\.)tiktok\.com$/.test(host);
export function tiktokCanonical(u) {
  const m = String(u).match(/tiktok\.com\/(@[^/?#]+)\/(video|photo)\/(\d+)/);
  return m ? 'https://www.tiktok.com/' + m[1] + '/' + m[2] + '/' + m[3] : '';
}
export async function tiktokResolve(url, fetcher) {
  const direct = tiktokCanonical(url);
  if (direct) return direct;
  const get = fetcher || fetchText;
  try {
    const r = await get(url, 64 * 1024);
    const fromUrl = tiktokCanonical(r.url || '');
    if (fromUrl) return fromUrl;
    // Manchmal steht der lange Link nur in der Seite
    const inPage = tiktokCanonical((String(r.text || '').match(/https:\\?\/\\?\/www\.tiktok\.com\\?\/@[^"'\s]+?\\?\/(?:video|photo)\\?\/\d+/) || [''])[0].replace(/\\\//g, '/'));
    if (inPage) return inPage;
  } catch (_) { /* unten */ }
  return '';
}

// Beschreibung, Konto und Vorschaubild aus der Videoseite (TikTok liefert über oEmbed seit 2026 keine Beschreibung mehr)
export function tiktokFromHtml(html) {
  const out = { desc: '', author: '', image: '' };
  const m = String(html).match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      let item = null;
      const walk = (o, depth) => {
        if (item || !o || typeof o !== 'object' || depth > 8) return;
        if (o.itemStruct && typeof o.itemStruct.desc === 'string') { item = o.itemStruct; return; }
        for (const k of Object.keys(o)) walk(o[k], depth + 1);
      };
      walk(data, 0);
      if (item) {
        out.desc = item.desc || '';
        out.author = (item.author && (item.author.uniqueId || item.author.nickname)) || '';
        out.image = (item.video && (item.video.cover || item.video.originCover)) || '';
      }
    } catch (_) { /* unten per Suche */ }
  }
  if (!out.desc) {
    for (const d of String(html).matchAll(/"desc":"((?:[^"\\]|\\.)*)"/g)) {
      let t = '';
      try { t = JSON.parse('"' + d[1] + '"'); } catch (_) { continue; }
      if (t.length > 20 && !/^\d[\d.,]*\s*(Likes|Mag ich)/i.test(t)) { out.desc = t; break; }
    }
  }
  if (!out.image) out.image = metaContent(html, ['og:image']) || '';
  return out;
}

// ---------- Pinterest: Pin -> Link zur eigentlichen Rezeptseite ----------
export const isPinterest = host => /(^|\.)pinterest\.[a-z.]+$/.test(host) || host === 'pin.it';
export function pinFromHtml(html) {
  const out = { link: '', description: '', title: '', image: '' };
  const want = s => s && /^https?:\/\//.test(s) && !/(^|\.)(pinterest\.[a-z.]+|pinimg\.com|pin\.it)(\/|$)/i.test(new URL(s).host + '/');
  for (const m of html.matchAll(/"link"\s*:\s*"(https?:[^"]+)"/g)) {
    let u = m[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    try { if (want(u)) { out.link = u; break; } } catch (_) { /* weiter */ }
  }
  if (!out.link) { const s = metaContent(html, ['og:see_also']); try { if (want(s)) out.link = s; } catch (_) { /* nichts */ } }
  out.description = metaContent(html, ['og:description', 'description']) || '';
  out.title = metaContent(html, ['og:title']) || '';
  out.image = metaContent(html, ['og:image']) || '';
  return out;
}
export async function pinterestInfo(url, fetcher) {
  const get = fetcher || fetchText;
  let pinUrl = url;
  let id = (url.match(/\/pin\/(\d+)/) || [])[1];
  let html = '';
  if (!id) {
    // Kurzlink pin.it -> Weiterleitung auf die Pin-Seite
    const r = await get(url);
    pinUrl = r.url || url;
    html = r.text || '';
    id = (pinUrl.match(/\/pin\/(\d+)/) || [])[1];
  }
  const info = { pinUrl: id ? 'https://www.pinterest.com/pin/' + id + '/' : pinUrl, link: '', description: '', title: '', image: '' };
  if (id) {
    // Öffentliche Schnittstelle der Pinterest-Widgets
    try {
      const w = await get('https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=' + id, 256 * 1024);
      const pin = JSON.parse(w.text).data[0];
      if (pin) {
        info.link = pin.link || '';
        info.description = pin.description || (pin.rich_metadata && pin.rich_metadata.description) || '';
        info.title = pin.title || (pin.rich_metadata && pin.rich_metadata.title) || '';
        const imgs = pin.images || {};
        info.image = (imgs['736x'] || imgs['564x'] || imgs.orig || imgs['237x'] || {}).url || '';
      }
    } catch (_) { /* Seite unten versuchen */ }
    if (!info.link) {
      try {
        if (!html) html = (await get(info.pinUrl)).text || '';
        const p = pinFromHtml(html);
        for (const k of ['link', 'description', 'title', 'image']) if (!info[k]) info[k] = p[k];
      } catch (_) { /* nichts gefunden */ }
    }
  } else if (html) Object.assign(info, pinFromHtml(html));
  if (info.link && (checkUrl(info.link).error || isPinterest(new URL(info.link).host))) info.link = '';
  return info;
}

export async function checkMany(urls, fetcher) {
  const list = (Array.isArray(urls) ? urls : []).slice(0, 25).map(String);
  const results = {};
  let i = 0;
  const worker = async () => { while (i < list.length) { const u = list[i++]; results[u] = await checkOne(u, fetcher); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return results;
}

export async function handle(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);
  const projectUrl = typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_URL') : '';
  if (!(await signedIn(req, projectUrl))) return json({ error: 'Bitte in der App neu anmelden.' }, 401);
  let body;
  try { body = await req.json(); } catch (_) { return json({ error: 'Ungültige Anfrage.' }, 400); }
  if (body && Array.isArray(body.check)) return json({ results: await checkMany(body.check) });
  const checked = checkUrl(body && body.url);
  if (checked.error) return json({ error: checked.error }, 400);
  try {
    // TikTok: Beschreibung über oEmbed (die Videoseite selbst enthält kein Rezept)
    if (isTikTok(checked.host)) {
      const long = (await tiktokResolve(checked.url)) || checked.url;
      let info = { desc: '', author: '', image: '' };
      try { info = tiktokFromHtml((await fetchText(long, 2 * 1024 * 1024)).text || ''); } catch (_) { /* oEmbed versuchen */ }
      if (!info.desc) {
        // Früheres Format: oEmbed mit "title" = Beschreibung
        try {
          const data = JSON.parse((await fetchText('https://www.tiktok.com/oembed?url=' + encodeURIComponent(long))).text);
          if (data && data.title) info = { desc: data.title, author: data.author_name || '', image: data.thumbnail_url || '' };
        } catch (_) { /* unten behandelt */ }
      }
      if (!info.desc) return json({ error: 'Die TikTok-Beschreibung konnte nicht geladen werden. Ist das Video öffentlich? Sonst ein Bildschirmfoto vom Rezept im Video machen.' }, 502);
      if (!info.author) info.author = (long.match(/@([^/]+)/) || [])[1] || '';
      return json({ kind: 'tiktok', url: long, title: info.desc, author: info.author, image: info.image, jsonld: [], text: info.desc, description: info.desc });
    }
    // Pinterest: dem Pin zur Rezeptseite folgen; ohne Link die Pin-Beschreibung nehmen
    if (isPinterest(checked.host)) {
      const pin = await pinterestInfo(checked.url);
      const text = [pin.title, pin.description].filter(Boolean).join('\n');
      if (pin.link) {
        try {
          const target = await fetchText(pin.link);
          if (target.status < 400) return json({ kind: 'page', status: target.status, ...extract(target.text, target.url), via: 'pinterest', pinUrl: pin.pinUrl, pinText: text, pinImage: pin.image });
        } catch (_) { /* Rezeptseite nicht erreichbar -> Beschreibung */ }
      }
      if (!text) return json({ error: 'Dieser Pin konnte nicht gelesen werden. Ist er öffentlich?' }, 502);
      return json({ kind: 'pin', url: pin.pinUrl, title: pin.title, image: pin.image, text, link: pin.link });
    }
    const page = await fetchText(checked.url);
    if (page.status >= 400) return json({ error: 'Die Seite antwortet mit Fehler ' + page.status + '.' }, 502);
    return json({ kind: 'page', status: page.status, ...extract(page.text, page.url) });
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'Die Seite hat zu lange nicht geantwortet.' : (e && e.message) || 'Die Seite konnte nicht geladen werden.';
    return json({ error: msg }, 502);
  }
}

// In Supabase starten (beim Testen mit Node wird nur exportiert)
if (typeof Deno !== 'undefined') Deno.serve(handle);
