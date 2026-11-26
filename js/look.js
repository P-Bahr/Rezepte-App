/* Aussehen: gewählte Akzentfarbe (wird ganz am Anfang gesetzt, damit nichts aufblitzt)
   und Essens-Symbole für Rezepte ohne Foto. */
(function () {
  'use strict';
  const KEY = 'rezepte.farbe';
  const COLORS = [
    { id: 'grau', name: 'Schwarz' },
    { id: 'lila', name: 'Lila' },
    { id: 'blau', name: 'Blau' },
    { id: 'beere', name: 'Beere' },
    { id: 'petrol', name: 'Petrol' }
  ];
  const get = () => { try { const v = localStorage.getItem(KEY); return COLORS.some(c => c.id === v) ? v : 'grau'; } catch (e) { return 'grau'; } };
  const apply = id => { document.documentElement.dataset.accent = id; };
  const set = id => { try { localStorage.setItem(KEY, id); } catch (e) { /* egal */ } apply(id); };
  apply(get());

  // Passendes Essens-Symbol: zuerst nach dem Namen, dann nach Hauptzutat und Rezeptart
  const MAP = [
    [/suppe|eintopf|brühe|chili con/, '🍲'], [/salat/, '🥗'], [/pizza|flammkuchen/, '🍕'], [/burger/, '🍔'], [/wrap|burrito|taco/, '🌯'],
    [/lasagne|nudel|pasta|spaghetti|spätzle|maultasche|gnocchi/, '🍝'], [/sushi/, '🍣'], [/curry|reis|risotto|bowl/, '🍛'],
    [/muffin|cupcake/, '🧁'], [/keks|plätzchen|cookie|kipferl|makrone/, '🍪'], [/torte|kuchen|strudel|brownie|schnecke/, '🍰'],
    [/brot|brötchen|baguette|zopf|brezel/, '🍞'], [/pfannkuchen|pancake|waffel|crêpe|kaiserschmarrn/, '🥞'], [/croissant/, '🥐'],
    [/smoothie|lassi|shake|getränk|drink|limonade|cocktail|punsch|kakao|tee\b|kaffee/, '🥤'],
    [/eis\b|pudding|creme|mousse|dessert|tiramisu|panna/, '🍨'], [/oats|porridge|müsli|granola|frühstück/, '🥣'],
    [/ei\b|eier|omelett|rührei|shakshuka/, '🍳'], [/hähnchen|huhn|pute|geflügel|chicken|nuggets/, '🍗'],
    [/fisch|lachs|thunfisch|garnele|shrimp|meeresfrücht/, '🐟'], [/schnitzel|steak|rind|schwein|hack|fleisch|braten|gulasch|wurst|frikadelle/, '🥩'],
    [/pommes|kartoffel|gratin/, '🥔'], [/dip|soße|sauce|pesto|aufstrich|hummus/, '🥫'], [/käse|raclette|fondue/, '🧀'],
    [/pilz|champignon/, '🍄'], [/gemüse|zucchini|paprika|brokkoli|blumenkohl|aubergine|bohne|linse|kichererbse|tofu|vegan|vegetarisch/, '🥦'],
    [/apfel|beere|obst|frucht|banane|mango/, '🍓'], [/brei|baby/, '🥣']
  ];
  function emoji(r) {
    const tests = [String(r && r.title || ''), String(r && r.mainIngredient || ''), String(r && r.course || '')].map(x => x.toLowerCase());
    for (const t of tests) for (const [re, e] of MAP) if (re.test(t)) return e;
    return '🍽️';
  }
  // Zarte Hintergrundfarbe je Rezept (5 Abstufungen der Akzentfarbe, immer gleich für dasselbe Rezept)
  function tint(r) {
    const s = String(r && (r.id || r.title) || '');
    let n = 0;
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return n % 5;
  }

  window.RecipeLook = { COLORS, get, set, emoji, tint };
})();
