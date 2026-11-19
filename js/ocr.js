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
        let lo = 255, hi = 0;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], gr = px[i + 1], bl = px[i + 2];
          const mx = Math.max(r, gr, bl), mn = Math.min(r, gr, bl);
          const white = mn > 200 && mx - mn < 40;
          const v = white ? 0 : 255;
          q[i] = q[i + 1] = q[i + 2] = v; q[i + 3] = 255;
          const g = 0.299 * r + 0.587 * gr + 0.114 * bl;
          px[i] = g;
          if (g < lo) lo = g; if (g > hi) hi = g;
        }
        ctx2.putImageData(d2, 0, 0);
        const range = Math.max(1, hi - lo);
        for (let i = 0; i < px.length; i += 4) { const v = (px[i] - lo) * 255 / range; px[i] = px[i + 1] = px[i + 2] = v; }
        ctx.putImageData(d, 0, 0);
        resolve({ gray: c, white: c2 });
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
      let best = (await w.recognize(v.gray)).data;
      // Unsicher? Dann die Variante für weiße Schrift probieren und die sicherere nehmen
      if ((best.confidence || 0) < 80) {
        const alt = (await w.recognize(v.white)).data;
        if ((alt.confidence || 0) > (best.confidence || 0)) best = alt;
      }
      texts.push(cleanOcr(best.text || ''));
    }
    progressCb = null;
    return texts.join('\n');
  }

  // Erkennungsreste und Bedienelemente der Apps entfernen
  const UI = /^(@\S+|folgen|follow|abonnieren|gefolgt|teilen|share|kommentare?|comments?|für dich|for you|following|live|suche|search|originalton|original sound|mehr|more|antworten|reply|gefällt mir|likes?|\d+([.,]\d+)?\s*[km]?\s*(likes?|views?|aufrufe)?)$/i;
  // Typische Verwechsler direkt nach einer Zahl: "250 mi" -> "250 ml", "200 9 Mehl" -> "200 g Mehl"
  function fixUnits(l) {
    return l
      .replace(/(\d)\s*(?:mi|mI|m1|rnl|mL)\b/g, '$1 ml')
      .replace(/(\d)\s+[9q]\s+(?=\p{Lu})/gu, '$1 g ')
      .replace(/(\d)\s*(?:E1|EI)\b/g, '$1 EL')
      .replace(/(\d)\s*(?:T1|TI)\b/g, '$1 TL')
      .replace(/^[lI|](?=\s*(?:EL|TL|Prise|Pck|g\b|kg|ml|l\b))/u, '1');
  }
  const UI_WORD = /\b(folgen|follow|abonnieren|subscribe|kommentieren|gefällt|originalton|original sound)\b/i;
  function cleanOcr(text) {
    return String(text).split(/\r?\n/).map(l => fixUnits(l.replace(/[|_~^`´¦]+/g, ' ').replace(/\s+/g, ' ').trim())).filter(l => {
      if (!l || UI.test(l) || UI_WORD.test(l)) return false;
      const letters = (l.match(/\p{L}/gu) || []).length;
      // mindestens ein Wort mit 3 Buchstaben und überwiegend Buchstaben/Zahlen
      // Zeilen mit Menge vorn dürfen kurze Wörter haben ("1 Ei", "2 EL Öl")
      const amountLine = /^[\d½¼¾⅓⅔]/.test(l) && /\p{L}{2}/u.test(l);
      return (/\p{L}{3}/u.test(l) || amountLine) && letters / l.replace(/\s/g, '').length >= (amountLine ? 0.3 : 0.5);
    }).join('\n');
  }

  window.RecipeOCR = { recognize, prepare, cleanOcr };
})();
