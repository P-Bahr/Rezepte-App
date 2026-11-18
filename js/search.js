/* Suche: tolerant gegenüber Groß-/Kleinschreibung, Umlauten (ä = ae = a),
   Wortteilen ("brust" findet "Hähnchenbrust") und einem Tippfehler pro Wort. */
(function () {
  'use strict';

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // ä -> a, é -> e
      .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u') // "Kaese" = "Käse"
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function words(text) {
    const n = normalize(text);
    return n ? n.split(' ') : [];
  }

  // Abstand zweier Wörter (Anzahl Tippfehler), bricht früh ab, wenn > max.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function allowedTypos(token) {
    if (token.length >= 8) return 2;
    if (token.length >= 4) return 1;
    return 0;
  }

  // Wie gut passt ein Suchwort zu einer Liste von Wörtern? 0 = gar nicht.
  // fuzzy = Tippfehler erlauben (nur, wenn das Wort sonst nirgends vorkommt).
  function tokenMatch(token, fieldWords, fuzzy) {
    let best = 0;
    const typos = fuzzy ? allowedTypos(token) : 0;
    for (const w of fieldWords) {
      if (w === token) return 1;
      if (w.startsWith(token)) best = Math.max(best, 0.9);
      else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 0.7);
      else if (typos > 0 && w[0] === token[0]) {
        // Tippfehler im ganzen Wort oder im Wortanfang gleicher Länge
        const d = Math.min(
          editDistance(token, w, typos),
          w.length > token.length ? editDistance(token, w.slice(0, token.length), typos) : typos + 1
        );
        if (d <= typos) best = Math.max(best, 0.5);
      }
    }
    return best;
  }

  const WEIGHTS = { title: 10, mainIngredient: 6, ingredients: 4, collection: 3, course: 3, method: 3, notes: 1, steps: 1 };

  // Baut einmal pro Rezept die durchsuchbaren Wortlisten.
  function index(recipe, collectionName) {
    return {
      title: words(recipe.title),
      mainIngredient: words(recipe.mainIngredient),
      ingredients: words((recipe.ingredients || []).join(' ')),
      collection: words(collectionName),
      course: words(recipe.course),
      method: words(recipe.method),
      notes: words(recipe.notes),
      steps: words((recipe.steps || []).join(' '))
    };
  }

  function tokenScore(idx, t, fuzzy) {
    let best = 0;
    for (const field in WEIGHTS) {
      const m = tokenMatch(t, idx[field], fuzzy);
      if (m) best = Math.max(best, m * WEIGHTS[field]);
    }
    return best;
  }

  // Durchsucht eine Liste von Suchindizes. Jedes Suchwort muss irgendwo vorkommen.
  // Rückgabe: Punktzahl je Eintrag (0 = kein Treffer).
  function search(indexes, query) {
    const tokens = words(query);
    if (!tokens.length) return indexes.map(() => 1);
    const totals = indexes.map(() => 0);
    for (const t of tokens) {
      let per = indexes.map(idx => tokenScore(idx, t, false));
      if (!per.some(Boolean)) per = indexes.map(idx => tokenScore(idx, t, true)); // Tippfehler-Suche
      per.forEach((v, i) => { totals[i] = (v && totals[i] >= 0) ? totals[i] + v : -1; });
    }
    return totals.map(v => Math.max(v, 0));
  }

  window.RecipeSearch = { normalize, words, index, search, editDistance };
})();
