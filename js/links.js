/* Findet in einer Notiz Hinweise auf andere eigene Rezepte,
   z. B. "Dazu passen die Ofenkartoffeln" -> "Knusprige Ofenkartoffeln".
   Verlinkt wird nur, wenn der Hinweis eindeutig zu genau einem Rezept passt. */
(function () {
  'use strict';
  const S = window.RecipeSearch;

  // Allgemeine Wörter, die allein nie auf ein bestimmtes Rezept zeigen
  const GENERIC = new Set([
    'mit', 'und', 'oder', 'vom', 'von', 'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'auf', 'nach', 'art', 'fur', 'aus', 'im', 'in', 'zum', 'zur',
    'knusprig', 'knusprige', 'knuspriger', 'gebraten', 'gebratene', 'gebratener', 'schnell', 'schnelle', 'einfach', 'einfache', 'omas', 'mamas',
    'klassisch', 'klassische', 'beste', 'bester', 'leicht', 'leichte', 'cremig', 'cremige', 'vegan', 'vegane', 'veganer', 'vegetarisch', 'vegetarische',
    'fruhstuck', 'vorspeise', 'suppe', 'salat', 'hauptgericht', 'beilage', 'dessert', 'geback', 'snack', 'getrank', 'sauce', 'sosse', 'dip',
    'backen', 'braten', 'kochen', 'grillen', 'dunsten', 'schmoren', 'frittieren', 'kuchen', 'torte', 'brot', 'blech', 'auflauf', 'pfanne'
  ]);

  // Wörter einer Notiz mit ihrer Position im Originaltext
  function noteWords(text) {
    const out = [];
    const re = /[\p{L}\p{N}]+/gu;
    let m;
    while ((m = re.exec(text))) {
      const n = S.normalize(m[0]);
      if (n) out.push({ n, start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function similar(a, b) {
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 5) return false;
    return Math.abs(a.length - b.length) <= 2 && (a.startsWith(b) || b.startsWith(a)); // Brownie/Brownies
  }

  /* Rückgabe: [{ start, end, id }] – Textstellen in recipe.notes, die auf ein anderes Rezept zeigen. */
  function findLinks(recipe, allRecipes) {
    const text = recipe.notes || '';
    if (!text.trim()) return [];
    const nw = noteWords(text);
    const others = allRecipes.filter(r => r.id !== recipe.id);
    const found = [];
    const used = new Set();

    const take = (from, to, id) => {
      for (let i = from; i <= to; i++) if (used.has(i)) return;
      for (let i = from; i <= to; i++) used.add(i);
      found.push({ start: nw[from].start, end: nw[to].end, id });
    };

    // 1. Ganzer Rezeptname steht in der Notiz (längste Namen zuerst)
    const byLength = others.map(r => ({ r, tw: S.words(r.title) })).filter(x => x.tw.length).sort((a, b) => b.tw.length - a.tw.length);
    for (const { r, tw } of byLength) {
      for (let i = 0; i + tw.length <= nw.length; i++) {
        let ok = true;
        for (let k = 0; k < tw.length; k++) if (!similar(nw[i + k].n, tw[k])) { ok = false; break; }
        if (ok) { take(i, i + tw.length - 1, r.id); break; }
      }
    }

    // 2. Ein besonderes Wort aus genau einem Rezeptnamen (z. B. "Ofenkartoffeln")
    const ingredientWords = new Set();
    for (const r of allRecipes) {
      S.words((r.ingredients || []).join(' ') + ' ' + (r.mainIngredient || '')).forEach(w => ingredientWords.add(w));
    }
    const owners = new Map(); // Wort -> Rezept-IDs, in deren Namen es vorkommt
    for (const r of allRecipes) {
      for (const w of new Set(S.words(r.title))) {
        if (w.length < 5 || GENERIC.has(w) || ingredientWords.has(w)) continue;
        if (!owners.has(w)) owners.set(w, new Set());
        owners.get(w).add(r.id);
      }
    }
    nw.forEach((word, i) => {
      if (used.has(i) || word.n.length < 5) return;
      const hits = new Set();
      for (const [w, ids] of owners) if (similar(word.n, w)) ids.forEach(id => hits.add(id));
      if (hits.size === 1) {
        const id = [...hits][0];
        if (id !== recipe.id) take(i, i, id);
      }
    });

    return found.sort((a, b) => a.start - b.start);
  }

  window.RecipeLinks = { findLinks };
})();
