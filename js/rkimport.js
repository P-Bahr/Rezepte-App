/* Import aus Recipe Keeper: Export-Datei (.zip mit recipes.html und Fotos, oder nur recipes.html).
   Liest jedes Rezept aus und gibt Entwürfe zurück; Speichern übernimmt der Sammel-Import der App. */
(function () {
  'use strict';
  const COURSES = ['Hauptgericht', 'Vorspeise', 'Beilage', 'Suppe', 'Salat', 'Dessert', 'Gebäck', 'Frühstück', 'Snack', 'Getränk', 'Sauce & Dip'];
  const METHOD_COURSE = { backen: 'Backen', braten: 'Braten', kochen: 'Kochen', grillen: 'Grillen' };

  function loadZipLib() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jszip.min.js';
      s.onload = () => res(window.JSZip);
      s.onerror = () => rej(new Error('Das Entpack-Programm konnte nicht geladen werden. Bitte mit Internet erneut versuchen.'));
      document.head.append(s);
    });
  }

  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const paras = el => (el ? [...el.querySelectorAll('p')].map(text).filter(Boolean) : []);

  // recipes.html -> Rohdaten je Rezept
  function parseHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('.recipe-details')].map(el => {
      const q = sel => el.querySelector(sel);
      const src = q('[itemprop="recipeSource"]');
      const a = src && src.querySelector('a');
      const notesEl = q('[itemprop="recipeNotes"]');
      return {
        id: (q('meta[itemprop="recipeId"]') || {}).content || '',
        name: text(q('[itemprop="name"]')),
        courses: [...el.querySelectorAll('[itemprop="recipeCourse"]')].map(text).filter(Boolean),
        categories: [...el.querySelectorAll('meta[itemprop="recipeCategory"]')].map(m => m.content).filter(Boolean),
        source: a ? a.getAttribute('href') : text(src),
        yield: text(q('[itemprop="recipeYield"]')),
        favorite: /^true$/i.test((q('meta[itemprop="recipeIsFavourite"]') || {}).content || ''),
        ingredients: paras(q('[itemprop="recipeIngredients"]')),
        directions: paras(q('[itemprop="recipeDirections"]')),
        notes: notesEl ? (paras(notesEl).join('\n') || text(notesEl)) : '',
        photos: [...el.querySelectorAll('img[itemprop^="photo"]')].map(i => i.getAttribute('src'))
          .concat([...el.querySelectorAll('img.recipe-photo')].map(i => i.getAttribute('src'))).filter(Boolean)
      };
    }).filter(r => r.name);
  }

  // Rohdaten -> Entwurf wie bei den anderen Importen (Namen aufräumen, Schritte straffen, Kategorien schätzen)
  function toDraft(raw) {
    const I = window.RecipeImporter;
    const title = I.cleanTitle(raw.name) || raw.name;
    const sv = I.servingsFrom(raw.yield ? [raw.yield] : [], title);
    const own = raw.courses.find(c => COURSES.includes(c));
    const methodFromCourse = raw.courses.map(c => METHOD_COURSE[c.toLowerCase()]).find(Boolean);
    const d = {
      title,
      // Zwischenüberschriften aus Recipe Keeper ("Für den Zitronenquark", "Dienen") sind keine Zutaten
      ingredients: raw.ingredients.filter(l => !(/^(für|zum|zur|dienen|deko|dekoration|topping|teig|boden|füllung|creme|soße|sauce|glasur)\b/i.test(l) && !/\d/.test(l))),
      steps: I.cleanSteps(raw.directions),
      notes: raw.notes,
      servings: sv.servings, servingsUnit: sv.servingsUnit, formSize: sv.formSize, servingsGuessed: !raw.yield,
      sourceUrl: /^https?:\/\//i.test(raw.source || '') ? raw.source : '',
      favorite: raw.favorite,
      course: own || '',
      method: methodFromCourse || '',
      importHow: 'app'
    };
    I.withGuesses(d, raw.categories.concat(raw.courses), raw.categories);
    if (!own) d.courseGuessed = !!d.courseGuessed;
    return d;
  }

  // Datei lesen: .zip (mit Fotos) oder recipes.html
  async function read(file) {
    const name = (file.name || '').toLowerCase();
    if (/\.html?$/.test(name) || /html/.test(file.type || '')) {
      return parseHtml(await file.text()).map(raw => ({ raw, draft: toDraft(raw), getImage: null }));
    }
    const JSZip = await loadZipLib();
    let zip;
    try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('Die Datei konnte nicht geöffnet werden. Ist es der Export aus Recipe Keeper (.zip)?'); }
    const htmlFile = Object.values(zip.files).find(f => !f.dir && /(^|\/)recipes\.html?$/i.test(f.name));
    if (!htmlFile) throw new Error('In der Datei wurde keine Rezeptliste (recipes.html) gefunden. Ist es der Export aus Recipe Keeper?');
    const base = htmlFile.name.replace(/[^/]*$/, '');
    const list = parseHtml(await htmlFile.async('string'));
    return list.map(raw => {
      const path = raw.photos[0] ? base + raw.photos[0].replace(/^\.?\//, '') : '';
      const f = path && zip.file(path);
      return { raw, draft: toDraft(raw), getImage: f ? () => f.async('blob') : null };
    });
  }

  window.RecipeKeeper = { read, parseHtml, toDraft };
})();
