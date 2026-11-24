/* Lesezeichen einlesen: Chrome-Export (Lesezeichen.html) oder Google-Takeout-ZIP.
   Liefert alle Links mit Namen und Ordner; markiert, welche nach Rezept aussehen. */
(function () {
  'use strict';
  function loadZipLib() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jszip.min.js';
      s.onload = () => res(window.JSZip);
      s.onerror = () => rej(new Error('Die ZIP-Datei konnte nicht geöffnet werden. Bitte mit Internet noch einmal versuchen.'));
      document.head.append(s);
    });
  }
  const RECIPE_HOST = /(chefkoch|lecker|essen-und-trinken|kitchenstories|eatsmarter|springlane|gutekueche|einfachbacken|oetker|lidl-kochen|rewe|kuechengoetter|kochbar|daskochrezept|ichkoche|kochkarussell|emmikochteinfach|zuckerzimtundliebe|backenmachtgluecklich|sallys-?blog|thermomix|cookidoo|allrecipes|bbcgoodfood|tasty|kochenmituns|hellofresh|marleyspoon|foodboom|chefkoch|tiktok|pinterest|instagram|recipe|rezept|koch|back|food|kitchen|cook)/i;
  const RECIPE_WORD = /(rezept|recipe|kochen|backen|kuchen|torte|auflauf|suppe|salat|nudel|pasta|pizza|brot|brötchen|muffin|plätzchen|kekse|dessert|soße|sauce|dip|curry|eintopf|gratin|lasagne|frühstück|smoothie|bowl|airfryer|thermomix)/i;

  function parseHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const out = [], seen = new Set();
    for (const a of doc.querySelectorAll('a[href]')) {
      const url = a.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(url)) continue;
      const key = url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Ordnername: die nächste Überschrift <h3> über der Liste, in der der Link steht
      let folder = '';
      const dl = a.closest('dl');
      const head = dl && dl.previousElementSibling;
      if (head && /^h3$/i.test(head.tagName)) folder = head.textContent.trim();
      const title = (a.textContent || '').trim() || url;
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { continue; }
      const recipe = RECIPE_HOST.test(host) || RECIPE_WORD.test(title + ' ' + url) || RECIPE_WORD.test(folder);
      out.push({ url, title, folder, host, recipe });
    }
    return out;
  }

  // Google "Gespeichert" (Sammlungen): je Sammlung eine CSV-Datei (Titel, Notiz, URL, Kommentar)
  function csvRows(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function parseCsv(text, folder) {
    const html = csvRows(String(text || '').replace(/^\uFEFF/, '')).map(r => {
      const url = r.find(x => /^https?:\/\//i.test(x.trim()));
      if (!url) return '';
      const title = r.find(x => x.trim() && !/^https?:\/\//i.test(x.trim())) || url;
      const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return '<dt><a href="' + esc(url.trim()) + '">' + esc(title.trim()) + '</a>';
    }).join('');
    return '<h3>' + String(folder || '').replace(/</g, '') + '</h3><dl>' + html + '</dl>';
  }
  async function read(file) {
    const name = String(file && file.name || '');
    if (/\.zip$/i.test(name) || /zip/.test(file.type || '')) {
      const JSZip = await loadZipLib();
      let zip;
      try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('Die ZIP-Datei konnte nicht geöffnet werden.'); }
      const all = Object.values(zip.files).filter(f => !f.dir);
      const files = all.filter(f => /\.html?$/i.test(f.name));
      const pick = files.find(f => /bookmarks|lesezeichen/i.test(f.name)) || files.find(f => /chrome/i.test(f.name));
      // Google "Gespeichert"/"Saved": CSV-Dateien (eine je Sammlung)
      const saved = all.filter(f => /\.csv$/i.test(f.name) && /(gespeichert|saved|sammlung|collection)/i.test(f.name));
      let html = pick ? await pick.async('string') : '';
      for (const f of saved) html += parseCsv(await f.async('string'), f.name.split('/').pop().replace(/\.csv$/i, ''));
      if (!html) throw new Error('In der ZIP-Datei sind keine Lesezeichen. Bei Takeout bitte „Chrome“ und „Gespeichert“ anhaken.');
      return parseHtml(html);
    }
    return parseHtml(await file.text());
  }

  window.RecipeBookmarks = { read, parseHtml, parseCsv };
})();
