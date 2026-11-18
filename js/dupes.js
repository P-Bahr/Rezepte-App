/* Erkennt doppelte Rezepte – auch mit anderem Namen oder für andere Personenzahl.
   Verglichen werden die Zutaten (ohne Mengen) und die Wörter der Zubereitungsschritte. */
(function () {
  'use strict';
  const S = window.RecipeSearch;
  const Sc = window.RecipeScale;

  // Kleine Wörter, die nichts über das Rezept aussagen
  const STOP = new Set(['und', 'oder', 'mit', 'in', 'im', 'den', 'die', 'der', 'das', 'dem', 'ein', 'eine', 'einen', 'auf', 'bei', 'bis', 'zu', 'zum', 'zur', 'von', 'vom', 'fur', 'etwas', 'dann', 'danach', 'kurz', 'alles', 'sehr', 'gut', 'grob', 'fein', 'ca', 'min', 'minuten', 'stunde', 'stunden']);

  function ingredientKeys(recipe) {
    const keys = new Set();
    for (const line of recipe.ingredients || []) {
      const name = Sc.parseIngredient(Sc.normalizeIngredient(line)).name.replace(/\(.*?\)/g, '');
      const w = S.words(name).filter(x => !STOP.has(x) && !/^\d/.test(x) && x.length > 1);
      if (w.length) keys.add(w[w.length - 1]); // Hauptwort ("rote Zwiebeln" -> "zwiebeln")
    }
    return keys;
  }
  function stepWords(recipe) {
    return new Set(S.words((recipe.steps || []).join(' ')).filter(x => x.length > 3 && !STOP.has(x) && !/^\d/.test(x)));
  }
  function jaccard(a, b) {
    if (!a.size && !b.size) return 1;
    let inter = 0;
    a.forEach(x => { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
  }

  // Zwei Zutatenwörter gelten als gleich bei kleinem Unterschied ("kakao"/"kakaopulver", "ei"/"eier")
  function sameIngredient(x, y) {
    if (x === y) return true;
    const [s1, s2] = x.length <= y.length ? [x, y] : [y, x];
    if (s2.startsWith(s1) && s2.length - s1.length <= 2) return true;       // Einzahl/Mehrzahl: ei/eier, zwiebel/zwiebeln
    if (s1.length >= 4 && (s2.startsWith(s1) || s2.endsWith(s1))) return true;
    return s1.length >= 6 && S.editDistance(s1, s2, 2) <= 2;
  }
  // Anteil gemeinsamer Zutaten (tolerant)
  function ingredientOverlap(ia, ib) {
    const A = [...ia], B = [...ib];
    const used = new Set();
    let hits = 0;
    for (const x of A) {
      const j = B.findIndex((y, k) => !used.has(k) && sameIngredient(x, y));
      if (j >= 0) { used.add(j); hits++; }
    }
    return hits / (A.length + B.length - hits);
  }

  // Wie ähnlich sind zwei Rezepte? 0 bis 1 (Zutaten zählen mehr als die Formulierung der Schritte)
  function similarity(a, b) {
    const ia = ingredientKeys(a), ib = ingredientKeys(b);
    if (ia.size < 3 || ib.size < 3) return 0; // zu wenig Zutaten für eine sichere Aussage
    const ing = ingredientOverlap(ia, ib);
    const sa = stepWords(a), sb = stepWords(b);
    const st = (sa.size && sb.size) ? jaccard(sa, sb) : ing;
    return ing * 0.8 + st * 0.2;
  }

  function isDuplicate(a, b) {
    const ia = ingredientKeys(a), ib = ingredientKeys(b);
    return ia.size >= 3 && ib.size >= 3 && ingredientOverlap(ia, ib) >= 0.8 && similarity(a, b) >= 0.7;
  }

  // Ähnlichstes vorhandenes Rezept (oder null)
  function findDuplicate(recipe, all) {
    let best = null, bestScore = 0;
    for (const r of all) {
      if (r.id === recipe.id) continue;
      if (!isDuplicate(recipe, r)) continue;
      const sc = similarity(recipe, r);
      if (sc > bestScore) { best = r; bestScore = sc; }
    }
    return best;
  }

  window.RecipeDupes = { similarity, isDuplicate, findDuplicate };
})();
