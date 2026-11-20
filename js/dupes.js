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

  // ---------- Dasselbe Gericht mehrfach gespeichert (auch Varianten mit anderem Namenszusatz) ----------
  const FLUFF = new Set(['einfach', 'einfache', 'einfacher', 'schnell', 'schnelle', 'schneller', 'lecker', 'leckere', 'leckerer', 'beste', 'bester', 'bestes', 'rezept', 'omas', 'mamas', 'klassisch', 'klassische', 'klassischer', 'cremig', 'cremige', 'cremiger', 'saftig', 'saftige', 'saftiger', 'super', 'mega', 'perfekt', 'perfekte', 'low', 'carb', 'lowcarb', 'high', 'protein', 'vegan', 'vegane', 'veganer', 'vegetarisch', 'vegetarische', 'gesund', 'gesunde', 'gesunder', 'fitness', 'familie', 'kinder', 'blitz', 'genial', 'geniale', 'selbstgemacht', 'selbstgemachte', 'hausgemacht', 'hausgemachte', 'original', 'xxl', 'mini']);
  const cache = new Map();
  function info(r) {
    const key = r.id + '|' + (r.updatedAt || '');
    let c = cache.get(r.id);
    if (c && c.key === key) return c;
    const words = S.words(r.title || '').filter(w => !STOP.has(w) && !FLUFF.has(w) && !/^\d/.test(w));
    c = { key, title: words.join(''), ing: ingredientKeys(r), steps: stepWords(r) };
    cache.set(r.id, c);
    return c;
  }
  // Gleiches Gericht: Name steckt im anderen ("Cheeseburger-Auflauf" / "Low Carb Cheeseburger Auflauf")
  // und die Zutaten sind zur Hälfte gleich – oder die Rezepte sind ohnehin fast gleich
  function sameDish(a, b) {
    const A = info(a), B = info(b);
    const [s, l] = A.title.length <= B.title.length ? [A.title, B.title] : [B.title, A.title];
    // Andere Zubereitung = anderes Gericht ("Pfannkuchen" aus der Pfanne, "Ofen-Pfannkuchen" aus dem Ofen)
    if (a.method && b.method && a.method !== b.method) return false;
    if (s.length >= 6 && l.includes(s) && A.ing.size >= 2 && B.ing.size >= 2 && ingredientOverlap(A.ing, B.ing) >= 0.4) return true;
    return isDuplicate(a, b);
  }
  // Gruppen gleicher Gerichte; Gruppen, in denen alle bewusst behalten wurden, nicht mehr melden
  let memo = { sig: '', groups: [] };
  function groups(all) {
    const list = (all || []).filter(r => !r.example);
    const sig = list.map(r => r.id + (r.updatedAt || '') + (r.dupOk ? 1 : 0)).join(',');
    if (sig === memo.sig) return memo.groups;
    const parent = list.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (find(i) !== find(j) && sameDish(list[i], list[j])) parent[find(i)] = find(j);
    }
    const by = new Map();
    list.forEach((r, i) => { const k = find(i); if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    const out = [...by.values()].filter(g => g.length >= 2 && g.some(r => !r.dupOk));
    memo = { sig, groups: out };
    return out;
  }
  function groupOf(recipe, all) { return groups(all).find(g => g.some(r => r.id === recipe.id)) || null; }

  // Wie vollständig und klar ist ein Rezept? (Geschmack kann die App nicht beurteilen)
  function quality(r) {
    const ing = r.ingredients || [], st = r.steps || [];
    const withAmount = ing.filter(l => /^\s*(\d|[½¼¾⅓⅔⅛]|eine?\b|etwas\b|prise\b)/i.test(l)).length;
    const avg = st.length ? st.join(' ').length / st.length : 0;
    const f = {
      amounts: ing.length > 0 && withAmount === ing.length,
      enoughIng: ing.length >= 4,
      steps: st.length >= 3,
      clearSteps: st.length > 0 && avg >= 25 && avg <= 260,
      photo: !!(r.imageId || r.imageUrl),
      time: !!r.totalTime,
      servings: !!r.servings && !(r.importInfo && r.importInfo.servingsGuessed),
      checked: !r.review,
      favorite: !!r.favorite
    };
    const hints = window.RecipeImporter && window.RecipeImporter.reviewHints ? window.RecipeImporter.reviewHints(r).length : 0;
    const points = (ing.length ? withAmount / ing.length : 0) * 30 + (f.enoughIng ? 5 : 0) + (f.steps ? 10 : 0) + (f.clearSteps ? 6 : 0)
      + (f.photo ? 5 : 0) + (f.time ? 3 : 0) + (f.servings ? 4 : 0) + (f.checked ? 5 : 0) + (f.favorite ? 40 : 0) - hints * 4;
    return { points, f, nIng: ing.length, withAmount, nSteps: st.length };
  }
  const LABEL = { favorite: 'ist dein Favorit', amounts: 'alle Zutaten mit Mengen', steps: 'Schritt für Schritt erklärt', clearSteps: 'klar formulierte Schritte', photo: 'mit Foto', time: 'mit Zeitangabe', servings: 'mit Portionsangabe', checked: 'schon von dir geprüft', enoughIng: 'vollständige Zutatenliste' };
  // Bestes Rezept der Gruppe + Gründe (nur was die anderen nicht alle auch haben)
  function recommend(group) {
    const q = group.map(r => ({ r, q: quality(r) })).sort((a, b) => b.q.points - a.q.points);
    const best = q[0];
    const reasons = Object.keys(LABEL).filter(k => best.q.f[k] && q.slice(1).some(x => !x.q.f[k])).map(k => LABEL[k]);
    if (!reasons.length) reasons.push('am vollständigsten');
    return { best: best.r, reasons, ranked: q };
  }
  // Zutaten, die nur in diesem Rezept der Gruppe vorkommen ("nur hier: Gurken, Senf")
  function onlyHere(recipe, group) {
    const others = group.filter(r => r.id !== recipe.id).map(r => [...info(r).ing]);
    const out = [];
    // Schreibweise aus dem Rezept übernehmen ("Kartoffeln", nicht "kartoffeln")
    for (const line of recipe.ingredients || []) {
      const name = Sc.parseIngredient(Sc.normalizeIngredient(line)).name.replace(/\(.*?\)/g, '');
      const w = S.words(name).filter(x => !STOP.has(x) && !/^\d/.test(x) && x.length > 1);
      if (!w.length) continue;
      const key = w[w.length - 1];
      if (others.some(o => o.some(y => sameIngredient(key, y)))) continue;
      const shown = (name.trim().split(/\s+/).pop() || key).replace(/[,.;:]+$/, '');
      const nice = shown.charAt(0).toUpperCase() + shown.slice(1);
      if (!out.includes(nice)) out.push(nice);
    }
    return out;
  }

  // ---------- Unterschiede auf einen Blick ----------
  // Zutaten eines Rezepts: Schlüssel (Hauptwort) -> Zeile, Menge pro Person, schöner Name
  function ingList(r) {
    const per = r.servings > 0 ? r.servings : 4; // ohne Angabe gilt wie überall: 4 Personen
    const out = [];
    for (const line of r.ingredients || []) {
      const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
      const name = p.name.replace(/\(.*?\)/g, '');
      const w = S.words(name).filter(x => !STOP.has(x) && !/^\d/.test(x) && x.length > 1);
      if (!w.length) continue;
      const v = Sc.parseNum(String(p.amount || '').split(/[–-]/)[0]);
      const shown = (name.trim().split(/\s+/).pop() || w[w.length - 1]).replace(/[,.;:]+$/, '');
      out.push({ key: w[w.length - 1], line, unit: (p.unit || '').toLowerCase(), amount: isNaN(v) ? null : (per ? v / per : v), perPerson: !!per, nice: shown.charAt(0).toUpperCase() + shown.slice(1) });
    }
    return out;
  }
  // Ofen und Zeit aus den Schritten ("bei 200 °C 30 Minuten backen")
  function oven(r) {
    const t = (r.steps || []).join(' ');
    const temp = (t.match(/(\d{2,3})\s*°\s*C?/i) || [])[1];
    const time = (t.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|bis)?\s*(?:\d+\s*)?(min(?:uten|\.)?|std\.?|stunden?)\b[^.]*\b(backen|garen|überbacken|im ofen)/i) || t.match(/(?:backen|garen|überbacken|im ofen)[^.]*?\b(\d+(?:[.,]\d+)?)\s*(min(?:uten|\.)?|std\.?|stunden?)\b/i));
    return { temp: temp ? temp + ' °C' : '', time: time ? time[1] + ' ' + (/^std|^stunde/i.test(time[2]) ? 'Std.' : 'Min.') : '' };
  }
  /* Für jedes Rezept der Gruppe: was nur hier vorkommt, was mit anderer Menge, und was alle gemeinsam haben */
  function differences(group) {
    const lists = group.map(ingList);
    const has = (list, key) => list.find(x => sameIngredient(key, x.key));
    const first = lists[0] || [];
    const common = first.filter(x => lists.every(l => has(l, x.key))).map(x => x.nice);
    const ovens = group.map(oven);
    const ovenDiff = new Set(ovens.map(o => o.temp + '|' + o.time)).size > 1;
    const per = new Map();
    group.forEach((r, i) => {
      const marks = [];
      for (const x of lists[i]) {
        const others = lists.filter((_, j) => j !== i).map(l => has(l, x.key));
        if (others.every(o => !o)) { marks.push({ kind: 'only', line: x.line }); continue; }
        // gleiche Zutat, aber deutlich andere Menge (pro Person verglichen, wenn Portionen bekannt)
        const diff = others.some(o => o && o.unit === x.unit && x.amount != null && o.amount != null && x.perPerson === o.perPerson && Math.abs(o.amount - x.amount) / Math.max(o.amount, x.amount) > 0.15);
        if (diff) marks.push({ kind: 'amount', line: x.line });
      }
      per.set(r.id, { marks, oven: ovenDiff ? ovens[i] : null });
    });
    return { common, per };
  }

  window.RecipeDupes = { similarity, isDuplicate, findDuplicate, sameDish, groups, groupOf, quality, recommend, onlyHere, differences, oven };
})();
