/* "Passt dazu": Ergänzungen, die zum Rezept passen (Beilage, Fleisch für vegetarische Gerichte, Brot zur Suppe …).
   Feste Regeln, keine KI: Was schon im Rezept steckt, wird nicht vorgeschlagen. */
(function () {
  'use strict';
  const MEAT = /hähnchen|hühnchen|huhn|hühner(?!ei)|chicken|pute|rind|kalb|schwein|hack|speck|schinken|bacon|wurst|würstchen|würste|wiener|salami|chorizo|lamm|gyros|kassler|kasseler|frikadell|steak|schnitzel|geflügel|leberkäse|pancetta|guanciale|prosciutto|mortadella|lyoner|fleischwurst|leberwurst|krakauer|cabanossi|hackbällchen|kıyma|döner|pulled/i;
  const FISH = /lachs|thunfisch|fisch|garnele|shrimp|scampi|forelle|kabeljau|seelachs|muschel|krabbe|sardelle/i;
  const STARCH = /nudel|pasta|spaghetti|penne|fusilli|tagliatelle|lasagne|makkaroni|gnocchi|spätzle|knödel|klöße|reis\b|reisnudel|risotto|kartoffel|pommes|couscous|bulgur|quinoa|polenta|tortilla|wraps?\b|brot\b|brötchen|baguette|pizzateig|blätterteig|hefeteig|toast|mehl\b|teig\b|quiche|flammkuchen|pizza|tarte|pfannkuchen|waffel/i;
  const ASIAN = /sojasauce|sojasoße|kokosmilch|curry|ingwer|sesamöl|teriyaki|wok|reisnudel|mie-?nudel|erdnuss/i;
  const SAUCY = /soße|sauce|sahne|schmand|brühe|fond|rahm|gulasch|geschnetzeltes|ragout|schmor/i;
  const SWEET = /zucker|honig|ahornsirup|agavendicksaft|zimt|vanille|schoko|kakao|banane|apfel|äpfel|beere|datteln|marmelade|pudding/i;
  const SAVORY = /zwiebel|knoblauch|brühe|pfeffer|paprikapulver|senf|sojasauce|käse|schinken|speck|tomate|avocado|lauch|spinat/i;
  const CRUMB = /schnitzel|frikadell|bulette|cordon|nuggets|paniert/i;

  // Vorschlag nur, wenn er nicht schon im Rezept steckt
  const pick = (have, list, n) => [...new Set(list.filter(([re]) => !re.test(have)).map(x => x[1]))].slice(0, n || 3);
  const BREAKFAST_SWEET = [[/beere|erdbeer|himbeer|heidelbeer|blaubeer/i, 'frische Beeren'], [/nuss|nüsse|mandel/i, 'gehackte Nüsse'], [/joghurt|skyr|quark/i, 'Joghurt']];
  const BREAKFAST_SAVORY = [[/quark|frischkäse/i, 'Kräuterquark'], [/tomate/i, 'Tomaten'], [/schinken/i, 'Schinken'], [/ei\b|eier/i, 'Spiegelei']];

  function suggest(r) {
    const title = String(r.title || '');
    const ing = (r.ingredients || []).join(' ');
    const all = title + ' ' + ing + ' ' + (r.steps || []).join(' ');
    const have = title + ' ' + ing;
    let course = r.course || '';
    // Haferflocken-Gerichte und süße "Hauptgerichte" (z. B. süßer Auflauf) bekommen Frühstücks-Ideen
    if (/porridge|oats|müsli|granola|haferbrei|chiapudding/i.test(title)) course = 'Frühstück';
    else if (course === 'Hauptgericht' && SWEET.test(have) && !SAVORY.test(have) && !MEAT.test(have)) course = 'Frühstück';
    const meat = MEAT.test(have), fish = FISH.test(have), starch = STARCH.test(have);
    if (course === 'Suppe' || /suppe|eintopf/i.test(title)) {
      return pick(have, [[/brot|baguette|brötchen/i, 'frisches Brot']].concat(meat || fish ? [[/crouton/i, 'Croutons']] : [[/wiener|würstchen/i, 'Wiener Würstchen'], [/speck|schinken/i, 'Speckwürfel']]).concat([[/crouton/i, 'Croutons']]));
    }
    if (course === 'Salat' || /salat/i.test(title)) {
      if (/kartoffelsalat|nudelsalat|reissalat/i.test(title)) return pick(have, [[/wiener|würstchen/i, 'Wiener Würstchen'], [/frikadell/i, 'Frikadellen'], [/schnitzel/i, 'Schnitzel']]);
      return meat || fish ? pick(have, [[/baguette|brot/i, 'Baguette'], [/feta/i, 'Feta']], 2)
        : pick(have, [[/hähnchen/i, 'gebratene Hähnchenstreifen'], [/feta|käse/i, 'Feta'], [/crouton|brot/i, 'Croutons']]);
    }
    if (course === 'Beilage') return pick(have, [[/frikadell/i, 'Frikadellen'], [/schnitzel/i, 'Schnitzel'], [/wiener|würstchen|bratwurst/i, 'Bratwurst']]);
    if (course === 'Frühstück') return pick(have, SWEET.test(have) && !SAVORY.test(have) ? BREAKFAST_SWEET : SAVORY.test(have) ? BREAKFAST_SAVORY : BREAKFAST_SWEET);
    if (course === 'Dessert') return pick(have, [[/eis\b|vanilleeis/i, 'Vanilleeis'], [/sahne/i, 'geschlagene Sahne'], [/beere/i, 'frische Beeren']]);
    if (course === 'Gebäck') return /brot|brötchen|baguette|focaccia|ciabatta|stangen|brezel|laugen|zopf/i.test(title)
      ? pick(have, [[/butter/i, 'Butter'], [/quark|frischkäse/i, 'Kräuterquark']], 2)
      : /keks|plätzchen|cookie|crossies|makronen|taler|lebkuchen/i.test(title) ? ['Kaffee', 'Kakao']
      : pick(have, [[/sahne/i, 'Schlagsahne'], [/eis\b/i, 'Vanilleeis']], 2);
    if (course === 'Sauce & Dip') {
      if (SWEET.test(have) && !SAVORY.test(have)) return ['Rote Grütze', 'Apfelstrudel', 'Dampfnudeln'];
      if (/dip|hummus|guacamole|tzatziki|aioli|salsa|aufstrich|creme/i.test(title)) return pick(have, [[/karotte|gurke|paprika/i, 'Gemüsesticks'], [/nachos|chips/i, 'Nachos'], [/baguette|brot/i, 'Baguette']]);
      if (/pesto/i.test(title)) return ['Nudeln', 'Bruschetta'];
      return ['Kartoffeln', 'Knödel', 'Nudeln'];
    }
    if (course === 'Getränk' || course === 'Snack') return [];
    // Hauptgerichte (und alles andere)
    const out = [];
    // Vegetarisch: etwas Herzhaftes zum Dazugeben
    if (!meat && !fish) out.push(...pick(have, ASIAN.test(all)
      ? [[/hähnchen/i, 'Hähnchenstreifen'], [/garnele/i, 'Garnelen'], [/ei\b|eier/i, 'Spiegelei']]
      : [[/schinken|speck/i, 'Schinkenwürfel'], [/wiener|würstchen/i, 'angebratene Wiener'], [/hähnchen/i, 'Hähnchenstreifen']]));
    // Ohne Sättigungsbeilage: passende Beilage
    if (!starch) {
      const sides = ASIAN.test(all) ? [[/reis/i, 'Reis'], [/naan|fladenbrot/i, 'Naan-Brot']]
        : CRUMB.test(all) ? [[/kartoffelsalat/i, 'Kartoffelsalat'], [/bratkartoffel/i, 'Bratkartoffeln'], [/pommes/i, 'Pommes']]
        : /gulasch|rouladen?|schmor/i.test(all) || /braten\b/i.test(title) ? [[/spätzle/i, 'Spätzle'], [/knödel|klöße/i, 'Knödel'], [/kartoffel/i, 'Salzkartoffeln']]
        : fish ? [[/kartoffel/i, 'Salzkartoffeln'], [/reis/i, 'Reis']]
        : SAUCY.test(all) ? [[/nudel|pasta/i, 'Nudeln'], [/reis/i, 'Reis'], [/kartoffel/i, 'Kartoffeln']]
        : [[/kartoffel/i, 'Kartoffeln'], [/reis/i, 'Reis'], [/brot|baguette/i, 'Baguette']];
      out.push(...pick(have, sides, out.length ? 2 : 3));
    }
    // Etwas Frisches, wenn noch Platz ist
    if (out.length < 3 && !/salat/i.test(have)) out.push('grüner Salat');
    return out.slice(0, 3);
  }

  window.RecipePairings = { suggest };
})();
