/* Texterkennung aus Bildschirmfotos – kostenlos und direkt auf dem Gerät (Tesseract).
   Die Fotos verlassen das Gerät nicht. Das Erkennungsprogramm (~3 MB) wird erst beim
   ersten Gebrauch geladen und danach vom Browser zwischengespeichert. */
(function () {
  'use strict';
  const BASE = new URL('js/vendor/tesseract/', document.baseURI).href;
  let workerPromise = null;
  let progressCb = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('Die Texterkennung konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
      document.head.appendChild(s);
    });
  }

  async function worker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        if (!window.Tesseract) await loadScript(BASE + 'tesseract.min.js');
        return window.Tesseract.createWorker('deu', 1, {
          workerPath: BASE + 'worker.min.js',
          corePath: BASE,
          langPath: BASE + 'lang',
          gzip: true,
          logger: m => { if (progressCb) progressCb(m); }
        });
      })();
      workerPromise.catch(() => { workerPromise = null; });
    }
    return workerPromise;
  }

  /* Foto vorbereiten. Liefert zwei Varianten:
     gray: Graustufen mit gestrecktem Kontrast (für normale Bildschirmfotos)
     white: nur helle, farblose Pixel als schwarze Schrift auf weißem Grund (für weiße
            TikTok-/Instagram-Schrift mit Umrandung auf buntem Video) */
  function prepare(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w0 = img.naturalWidth, h0 = img.naturalHeight;
        const scale = Math.max(Math.min(2, 1400 / Math.min(w0, h0)), Math.min(1, 3000 / Math.max(w0, h0)));
        const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const d = ctx.getImageData(0, 0, w, h);
        const px = d.data;
        // Variante "weiße Schrift"
        const c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        const ctx2 = c2.getContext('2d');
        const d2 = ctx2.createImageData(w, h);
        const q = d2.data;
        const c3 = document.createElement('canvas');
        c3.width = w; c3.height = h;
        const ctx3 = c3.getContext('2d');
        const d3 = ctx3.createImageData(w, h);
        const q3 = d3.data;
        let lo = 255, hi = 0;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], gr = px[i + 1], bl = px[i + 2];
          const mx = Math.max(r, gr, bl), mn = Math.min(r, gr, bl);
          const white = mn > 200 && mx - mn < 40;
          const v = white ? 0 : 255;
          q[i] = q[i + 1] = q[i + 2] = v; q[i + 3] = 255;
          const light = mn > 160 && mx - mn < 45;
          const v3 = light ? 0 : 255;
          q3[i] = q3[i + 1] = q3[i + 2] = v3; q3[i + 3] = 255;
          const g = 0.299 * r + 0.587 * gr + 0.114 * bl;
          px[i] = g;
          if (g < lo) lo = g; if (g > hi) hi = g;
        }
        ctx2.putImageData(d2, 0, 0);
        ctx3.putImageData(d3, 0, 0);
        const range = Math.max(1, hi - lo);
        for (let i = 0; i < px.length; i += 4) { const v = (px[i] - lo) * 255 / range; px[i] = px[i + 1] = px[i + 2] = v; }
        ctx.putImageData(d, 0, 0);
        resolve({ gray: c, white: c2, light: c3 });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ein Foto konnte nicht geöffnet werden.')); };
      img.src = url;
    });
  }

  /* Erkennt den Text aus mehreren Fotos (in der gewählten Reihenfolge).
     onStatus(text) meldet den Fortschritt verständlich. */
  async function recognize(files, onStatus) {
    const say = t => { if (onStatus) onStatus(t); };
    say('Texterkennung wird vorbereitet …');
    let current = 0;
    progressCb = m => {
      if (m.status === 'recognizing text') say('Text wird erkannt' + (files.length > 1 ? ' (Foto ' + (current + 1) + ' von ' + files.length + ')' : '') + ' … ' + Math.round((m.progress || 0) * 100) + ' %');
      else if (/loading|initializ/i.test(m.status || '')) say('Texterkennung wird geladen (nur beim ersten Mal) …');
    };
    const w = await worker();
    const texts = [];
    for (current = 0; current < files.length; current++) {
      const v = await prepare(files[current]);
      // Jede Aufbereitung lesen und Zeile für Zeile die sicherste nehmen
      const all = [];
      for (const variant of [v.gray, v.white, v.light]) {
        const data = (await w.recognize(variant, {}, { blocks: true })).data;
        const W = variant.width;
        for (const bl of data.blocks || []) for (const pa of bl.paragraphs || []) for (const li of pa.lines || []) {
          // Rechter Rand: Zähler und Symbole der App (Likes, Kommentare, Lesezeichen) weglassen
          const words = (li.words || []).filter(wd => !(wd.bbox && wd.bbox.x0 > W * 0.8 && !/\p{L}{3}/u.test(wd.text || '') && !/^(°C|°|C|g|ml|l|kg|EL|TL|cm)\.?$/.test(wd.text || '')));
          const t = (words.length ? words.map(wd => wd.text).join(' ') : String(li.text || '')).replace(/\s+/g, ' ').trim();
          if (t) all.push({ t, c: li.confidence || 0, b: li.bbox });
        }
      }
      texts.push(cleanOcr(mergeLines(all)));
    }
    progressCb = null;
    return texts.join('\n');
  }

  /* Zeilen aus mehreren Aufbereitungen zusammenführen: Für jede Stelle im Bild gewinnt die
     Zeile mit der höchsten Sicherheit; sehr unsichere Zeilen (meist Bildrauschen) fallen weg. */
  function mergeLines(lines, minConf) {
    const min = minConf == null ? 55 : minConf;
    // Gleiche Bildzeile, wenn die Mitten dicht beieinander liegen. (Nicht über die Höhe: Symbole am
    // Rand – Herz, Sprechblase – machen manche Zeilen doppelt so hoch und würden Nachbarzeilen verdecken.)
    const overlap = (a, b) => {
      const ca = (a.y0 + a.y1) / 2, cb = (b.y0 + b.y1) / 2;
      const hgt = Math.min(a.y1 - a.y0, b.y1 - b.y0);
      const x = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const wid = Math.min(a.x1 - a.x0, b.x1 - b.x0);
      return Math.abs(ca - cb) < hgt * 0.4 && x > wid * 0.3;
    };
    const keep = [];
    for (const l of lines.filter(x => x.c >= min && x.b).sort((a, b) => b.c - a.c)) {
      if (!keep.some(k => overlap(k.b, l.b))) keep.push(l);
    }
    return keep.sort((a, b) => (a.b.y0 - b.b.y0) || (a.b.x0 - b.b.x0)).map(l => l.t).join('\n');
  }

  // Erkennungsreste und Bedienelemente der Apps entfernen
  const UI = /^(@\S+|folgen|follow|abonnieren|gefolgt|teilen|share|kommentare?|comments?|für dich|for you|following|live|suche|search|originalton|original sound|mehr|more|antworten|reply|gefällt mir|likes?|\d+([.,]\d+)?\s*[km]?\s*(likes?|views?|aufrufe)?)$/i;
  // Typische Verwechsler direkt nach einer Zahl: "250 mi" -> "250 ml", "200 9 Mehl" -> "200 g Mehl"
  function fixUnits(l) {
    return l
      .replace(/(^|\s)Ol(?=$|[\s,])/g, '$1Öl')
      .replace(/\b(1[2-9]0|2[0-5]0)\s*(?:°|"|″|º)?\s*(?=Ober|Umluft|Unterhitze|Grad\b|$)/g, (m, t) => t + ' °C ')
      .replace(/\s+$/, '')
      .replace(/(\d)\s*(?:mi|mI|m1|rnl|mL)\b/g, '$1 ml')
      .replace(/(\d)\s+[9q]\s+(?=\p{Lu})/gu, '$1 g ')
      .replace(/(\d)\s*(?:E1|EI)\b/g, '$1 EL')
      .replace(/(\d)\s*(?:T1|TI)\b/g, '$1 TL')
      .replace(/^[lI|](?=\s*(?:EL|TL|Prise|Pck|g\b|kg|ml|l\b))/u, '1');
  }
  const UI_WORD = /\b(folgen|follow|abonnieren|subscribe|kommentieren|gefällt|originalton|original sound)\b/i;
  // Leisten von TikTok/Instagram ("LIVE Entdecken Gefolgt Für dich", "Home Freund*innen Posteingang Profil")
  const NAV = /(entdecken|gefolgt|für dich|for you|\bshop\b|\blive\b|wiedergabeliste|als nächstes|abspielen|\bhome\b|freund\*?innen|posteingang|\bprofil\b|startseite|\breels\b|explore|\bweniger\b|mehr anzeigen)/gi;
  const UNITS_END = /\s(?:EL|TL|g|kg|ml|l|Pck\.?|Msp\.?)$/;

  function cleanOcr(text) {
    const out = [];
    for (const raw of String(text).split(/\r?\n/)) {
      let l = raw.trim();
      if (!l) continue;
      // Nutzername (kochen_mit_k, lea.kocht)
      if (/^[\p{Ll}\d._]{3,30}$/u.test(l) && /[\p{Ll}\d][._][\p{Ll}\d]/u.test(l)) continue;
      // Kopfzeile der App mit Zurück-Pfeil ("< Fitmitkev - Abnehmen … Beitr...")
      if (/^[<‹←]\s/.test(l)) continue;
      // Aufzählungszeichen, die als ‚ . - gelesen werden; "½" wird oft als "%" gelesen
      l = l.replace(/^[‚,.\-–—•·*»]+\s*(?=[\d%½¼¾⅓⅔\p{L}])/u, '').replace(/^%\s*(?=(?:TL|EL|Tasse|Pck|Prise|l\b|kg\b))/u, '½ ').replace(/^(\d)\s*%(?=\s)/, '$1½');
      l = l.replace(/[|_~^`´¦]+/g, ' ').replace(/\s+/g, ' ').trim();
      // Statusleiste mit Uhrzeit
      if (/^\W{0,3}\d{1,2}:\d{2}\b/.test(l)) continue;
      // App-Leisten: mehrere Bedienwörter oder ein Bedienwort in sehr kurzer Zeile
      const nav = (l.match(NAV) || []).length;
      if (nav >= 2 || (nav >= 1 && l.split(' ').length <= 3)) continue;
      // Reste am Zeilenende: Symbole, einzelne Groß-/Kleinbuchstaben (nicht Einheiten wie EL/TL)
      for (let k = 0; k < 3; k++) {
        if (UNITS_END.test(l)) break;
        l = l.replace(/\s+(?:[^\p{L}\d\s.,!?:)]+|\p{Lu}{1,2}|\p{Ll})$/u, '').trim();
      }
      l = fixUnits(l);
      if (!l || UI.test(l) || UI_WORD.test(l)) continue;
      const letters = (l.match(/\p{L}/gu) || []).length;
      // Zeilen mit Menge vorn dürfen kurze Wörter haben ("1 Ei", "2 EL Öl"), ebenso ein einzelnes Wort ("Öl")
      const amountLine = /^[\d½¼¾⅓⅔]/.test(l) && /\p{L}{2}/u.test(l);
      const singleWord = /^\p{Lu}\p{Ll}+$/u.test(l);
      if ((/\p{L}{3}/u.test(l) || amountLine || singleWord) && letters / l.replace(/\s/g, '').length >= (amountLine ? 0.3 : 0.5)) out.push(l);
    }
    return restoreUmlauts(out).join('\n');
  }

  // Fehlende Umlaute ergänzen, wenn dasselbe Wort an anderer Stelle mit Umlaut erkannt wurde
  // ("Kartoffelplatzchen" + "Plätzchen" -> "Kartoffelplätzchen")
  function restoreUmlauts(lines) {
    const plain = w => w.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/Ä/g, 'A').replace(/Ö/g, 'O').replace(/Ü/g, 'U');
    const withUml = new Map();
    for (const l of lines) for (const w of l.match(/\p{L}{4,}/gu) || []) if (/[äöüÄÖÜ]/.test(w)) withUml.set(plain(w).toLowerCase(), w);
    if (!withUml.size) return lines;
    return lines.map(l => l.replace(/\p{L}{4,}/gu, w => {
      if (/[äöüÄÖÜ]/.test(w)) return w;
      const lw = w.toLowerCase();
      for (const [p, u] of withUml) {
        if (lw === p) return w[0] === w[0].toUpperCase() ? u[0].toUpperCase() + u.slice(1) : u.toLowerCase();
        if (p.length >= 5 && lw.endsWith(p)) return w.slice(0, w.length - p.length) + u.toLowerCase();
      }
      return w;
    }));
  }

  window.RecipeOCR = { recognize, prepare, cleanOcr, mergeLines, _worker: worker };
})();
