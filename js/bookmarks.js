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

  async function read(file) {
    const name = String(file && file.name || '');
    if (/\.zip$/i.test(name) || /zip/.test(file.type || '')) {
      const JSZip = await loadZipLib();
      let zip;
      try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('Die ZIP-Datei konnte nicht geöffnet werden.'); }
      const files = Object.values(zip.files).filter(f => !f.dir && /\.html?$/i.test(f.name));
      const pick = files.find(f => /bookmarks|lesezeichen/i.test(f.name)) || files.find(f => /chrome/i.test(f.name));
      if (!pick) throw new Error('In der ZIP-Datei sind keine Lesezeichen. Bei Takeout bitte „Chrome“ anhaken.');
      return parseHtml(await pick.async('string'));
    }
    return parseHtml(await file.text());
  }

  window.RecipeBookmarks = { read, parseHtml };
})();
