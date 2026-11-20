/* Feste Sammlungen, automatisch aus der Zubereitung:
   Ofen, Pfanne, Topf, Grill, Kalt. Feste Kennungen, damit alle Geräte beim
   Einsortieren genau dasselbe Ergebnis haben (keine Abgleich-Konflikte). */
(function () {
  'use strict';
  const FIXED_STAMP = '2000-01-01T00:00:00.000Z';
  const AUTO = [
    { id: 'col-ofen', name: 'Ofen', re: /back|ofen|gratin|überback|auflauf|heißluft|air\s?fryer/i },
    { id: 'col-pfanne', name: 'Pfanne', re: /brat|pfanne|frittier|wok/i },
    { id: 'col-topf', name: 'Topf', re: /koch|schmor|dünst|dämpf|sied|topf|pochier|blanchier|slow\s?cooker|einkoch/i },
    { id: 'col-grill', name: 'Grill', re: /grill/i },
    { id: 'col-kalt', name: 'Kalt', re: /kalt|roh|ohne\s+(kochen|backen|herd|ofen)|no\s?bake/i }
  ];
  // Reihenfolge der Prüfung: "Kalt" und "Grill" zuerst (sonst passt z. B. "ohne Backen" zu "Ofen")
  const CHECK = ['col-kalt', 'col-grill', 'col-ofen', 'col-pfanne', 'col-topf'].map(id => AUTO.find(a => a.id === id));

  function fromMethod(method) {
    const m = String(method || '').trim();
    if (!m) return null;
    const hit = CHECK.find(a => a.re.test(m));
    return hit || null;
  }

  /* Sammlung und (falls leer) Zubereitung für ein Rezept bestimmen.
     Rückgabe: { id, name, method } */
  function forRecipe(r) {
    let method = String(r.method || '').trim();
    let col = fromMethod(method);
    if (!col) {
      const I = window.RecipeImporter;
      const guess = I && I.guessMethod ? I.guessMethod(r.steps || [], r.title || '') : 'Kochen';
      if (!method) method = guess;
      col = fromMethod(guess) || AUTO[2];
    }
    return { id: col.id, name: col.name, method };
  }

  const list = () => AUTO.map(a => ({ id: a.id, name: a.name, updatedAt: FIXED_STAMP }));
  const order = id => { const i = AUTO.findIndex(a => a.id === id); return i < 0 ? 99 : i; };
  const isAuto = id => AUTO.some(a => a.id === id);

  // "One Pot": alles in einem Topf, einer Pfanne oder auf einem Blech (zusätzlich zur normalen Sammlung)
  const ONE_POT = /one[\s-]?pot|one[\s-]?pan|sheet[\s-]?pan|eintopf|ein[\s-]topf|(?:alles|alle zutaten)\s+(?:zusammen\s+)?(?:in|im)\s+(?:einem|einen|einer|den|die|dem)\s+(?:großen\s+)?(?:topf|pfanne|bräter|wok|kochtopf)|in\s+nur\s+einem\s+topf|aus\s+(?:einem|einer)\s+(?:topf|pfanne)|vom\s+blech|blechgericht|ofengericht vom blech/i;
  // Kuchen & Co. sind nie "One Pot", auch "vom Blech"
  const NOT_ONE_POT = /kuchen|torte|brownie|plätzchen|kekse|cookies|muffins|schnitten|waffeln|brot\b|brötchen|pizza/i;
  const isOnePot = r => !/^(Gebäck|Dessert|Snack|Getränk)$/.test(r.course || '') && !NOT_ONE_POT.test(r.title || '')
    && ONE_POT.test([r.title || '', (r.steps || []).join(' '), r.notes || ''].join(' '));
  window.RecipeCollections = { isOnePot, fromMethod, forRecipe, list, order, isAuto, FIXED_STAMP };
})();
