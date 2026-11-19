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

async function fetchText(url) {
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
        if (received > MAX_BYTES) { try { await reader.cancel(); } catch (_) { /* egal */ } break; }
      }
    }
    const buf = new Uint8Array(received > MAX_BYTES ? MAX_BYTES : received);
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

export async function handle(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);
  let body;
  try { body = await req.json(); } catch (_) { return json({ error: 'Ungültige Anfrage.' }, 400); }
  const checked = checkUrl(body && body.url);
  if (checked.error) return json({ error: checked.error }, 400);
  try {
    // TikTok: Beschreibung über oEmbed (die Videoseite selbst enthält kein Rezept)
    if (/(^|\.)tiktok\.com$/.test(checked.host)) {
      const o = await fetchText('https://www.tiktok.com/oembed?url=' + encodeURIComponent(checked.url));
      let data = null;
      try { data = JSON.parse(o.text); } catch (_) { /* unten behandelt */ }
      if (!data || !data.title) return json({ error: 'Die TikTok-Beschreibung konnte nicht geladen werden. Ist das Video öffentlich?' }, 502);
      return json({ kind: 'tiktok', url: checked.url, title: data.title, author: data.author_name || '', image: data.thumbnail_url || '', jsonld: [], text: data.title, description: data.title });
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
