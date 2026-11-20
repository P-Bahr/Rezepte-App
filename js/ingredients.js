/* Zutaten-Filter: aus jeder Zutatenzeile ein Begriff ("2 rote Paprikaschoten, gewürfelt" -> Paprika).
   Varianten werden zusammengefasst; Gewürze/Pulver bleiben eigene Begriffe ("Paprikapulver" ≠ "Paprika"). */
(function () {
  'use strict';
  const Sc = () => window.RecipeScale;
  const SUFFIX = /(schoten?|zehen?|stangen?|knollen?|würfel|scheiben|stücke?|streifen|filets?|blätter|röschen)$/i;
  const SKIP = /^(etwas|prise|salz|pfeffer|wasser|nach|optional|frische?r?|tk|bio)$/i;
  const ALIAS = [
    [/spaghetti|penne|fusilli|farfalle|rigatoni|tagliatelle|linguine|makkaroni|maccaroni|bandnudel|spätzle|tortellini|orzo|lasagneplatten/i, 'nudel'],
    [/tomate/i, 'tomat'],
    [/hack/i, 'hackfleisch'],
    [/hähnchen|hühnchen|hühnerbrust|chicken/i, 'hahnchen'],
    [/kartoffel/i, 'kartoffel']
  ];
  const ALIAS_LABEL = { nudel: 'Nudeln', tomat: 'Tomaten', hackfleisch: 'Hackfleisch', hahnchen: 'Hähnchen', kartoffel: 'Kartoffeln' };
  const deUml = s => s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');

  // Grundform für den Vergleich: klein, ohne Umlaute, ohne Mehrzahl-Endung
  function stem(word) {
    let w = deUml(String(word).toLowerCase());
    if (w === 'eier' || w === 'ei') return 'ei';
    if (w.length > 4) w = w.replace(/(innen|nen|en|n|e|s)$/, '');
    return w;
  }

  const cache = new Map();
  // Zeile -> { key, label } oder null
  function keyOf(line) {
    if (cache.has(line)) return cache.get(line);
    let res = null;
    try {
      const p = Sc().parseIngredient(Sc().normalizeIngredient(line));
      const name = String(p.name || line).replace(/\([^)]*\)/g, ' ').split(/[,(]|\s(?:oder|und|für|zum|zur|nach)\s/)[0].trim();
      const words = name.split(/\s+/).filter(w => /^\p{Lu}/u.test(w) && !SKIP.test(w));
      let label = words[words.length - 1] || '';
      if (label.length > 5 && SUFFIX.test(label)) {
        const base = label.replace(SUFFIX, '').replace(/-$/, '');
        if (base.length >= 3) label = base.charAt(0).toUpperCase() + base.slice(1);
      }
      label = label.replace(/[^\p{L}-]/gu, '');
      if (label.length >= 2) {
        res = { key: stem(label), label, also: [] };
        // Oberbegriffe: "Spaghetti" auch unter Nudeln, "Kirschtomaten" unter Tomaten, "Rinderhack" unter Hackfleisch
        for (const [re, k] of ALIAS) if (re.test(label) && k !== res.key) res.also.push(k);
      }
    } catch (e) { res = null; }
    cache.set(line, res);
    return res;
  }

  const recipeCache = new Map();
  // Begriffe eines Rezepts (Set von Schlüsseln)
  function keysOf(r) {
    const k = r.id + '|' + r.updatedAt;
    const c = recipeCache.get(r.id);
    if (c && c.k === k) return c.keys;
    const keys = new Set();
    for (const x of (r.ingredients || []).map(keyOf).filter(Boolean)) { keys.add(x.key); x.also.forEach(k => keys.add(k)); }
    recipeCache.set(r.id, { k, keys });
    return keys;
  }

  // Vorschläge für die Eingabe: alle Begriffe aus den Rezepten mit Häufigkeit und schönster Schreibweise
  function vocabulary(recipes) {
    const map = new Map();
    for (const r of recipes) {
      const seen = new Set();
      for (const line of r.ingredients || []) {
        const x = keyOf(line);
        if (!x || seen.has(x.key)) continue;
        seen.add(x.key);
        const e = map.get(x.key) || { key: x.key, labels: new Map(), count: 0 };
        e.count++;
        e.labels.set(x.label, (e.labels.get(x.label) || 0) + 1);
        map.set(x.key, e);
        for (const k of x.also) {
          if (seen.has(k)) continue;
          seen.add(k);
          const a = map.get(k) || { key: k, labels: new Map(), count: 0 };
          a.count++;
          if (!a.labels.size) a.labels.set(ALIAS_LABEL[k] || k, 0);
          map.set(k, a);
        }
      }
    }
    return [...map.values()].map(e => ({ key: e.key, count: e.count, label: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0][0] }));
  }

  window.RecipeIngredients = { keyOf, keysOf, vocabulary, stem };
})();
