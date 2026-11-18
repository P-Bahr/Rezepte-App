/* Schätzt die Gesamtzeit eines Rezepts aus den Zubereitungsschritten:
   - Zeitangaben im Text ("30 Minuten backen", "1 Std. ruhen") werden addiert
   - Arbeitsschritte ohne Zeitangabe (schneiden, anbraten, rühren …) werden geschätzt
   Ergebnis ist auf 5 Minuten aufgerundet. */
(function () {
  'use strict';
  const S = window.RecipeSearch;
  const Sc = window.RecipeScale;

  const NUM = '(\\d+(?:[.,]\\d+)?(?:\\s?[½¼¾])?|[½¼¾]|ein(?:e|en)?|eine?r?\\s+halbe?n?)';
  const DURATION = new RegExp('(?<![\\p{L}\\d])' + NUM + '(?:\\s*[-–]\\s*' + NUM + ')?\\s*(stunden|stunde|std\\.?|h|minuten|minute|min\\.?)(?![\\p{L}])', 'giu');

  function num(s) {
    s = String(s).toLowerCase().trim();
    if (/^ein(e|en)?$/.test(s)) return 1;
    if (/halbe?n?$/.test(s)) return 0.5;
    const v = Sc.parseNum(s);
    return isNaN(v) ? 0 : v;
  }

  // Ausdrückliche Zeitangaben in einem Schritt (bei "20-25 Minuten" zählt der höhere Wert)
  function explicitMinutes(step) {
    let total = 0;
    let m;
    DURATION.lastIndex = 0;
    while ((m = DURATION.exec(step))) {
      const v = Math.max(num(m[1]), m[2] ? num(m[2]) : 0);
      total += /^(st|h)/i.test(m[3]) ? v * 60 : v;
    }
    return total;
  }

  const CUT = /(schneid|würfel|hack|schäl|reib|raspel|hobel|putz|entkern|zerklein|zupf|in\s+(scheiben|streifen|stücke|ringe|spalten))/i;
  const MELT = /(schmelz|schaumig|knet|aufschlag|steif\s+schlag)/i;
  const FRY = /(anbrat|brat|röst|andünst|dünst|anschwitz|frittier|grill)/i;
  const BOIL = /(koch|köchel|garen|blanchier)/i;
  const MIX = /(rühr|misch|verquirl|unterheb|pürier|mix|knet|verteil|abschmeck|würz|anricht|servier|bestreu|bestreich|füll|leg|geben)/i;
  const PARALLEL = /(vorheiz)/i;
  const GENERIC_PRODUCE = /(gemüse|obst|kräuter|zutaten|früchte)/i;

  // Hauptwort einer Zutat: "2 rote Zwiebeln" -> "zwiebeln"
  function ingredientNoun(line) {
    const w = S.words(line.replace(/\(.*?\)/g, '')).filter(x => !/^\d/.test(x));
    return w.length ? w[w.length - 1] : '';
  }
  // Zutaten, die man meist schneidet: als Stück angegeben (nicht in g, ml, EL …)
  function isCountable(line) {
    return /^\s*\d/.test(line) && !/^\s*[\d.,\/½¼¾\s-–]+\s*(g|kg|ml|l|cl|dl|el|tl|msp|prise|pck|päckchen|packung|dose|becher|tasse|glas)\b/i.test(line);
  }

  // Schneidezeit für eine Zutat je nach Menge: 1 Zwiebel ~3 Min., 1 kg Äpfel ~9 Min.
  // Flüssigkeiten und Löffelmengen (ml, l, EL, TL …) werden nicht geschnitten. Höchstens 15 Min. je Zutat.
  function cutMinutes(line) {
    const m = String(line).match(/^\s*([\d.,\/½¼¾ ]+)\s*([A-Za-zÄÖÜäöüß]+\.?)?/);
    if (!m) return 3;
    const v = Sc.parseNum(m[1].trim());
    if (isNaN(v)) return 3;
    const unit = (m[2] || '').toLowerCase().replace(/\.$/, '');
    if (/^(ml|l|cl|dl|el|tl|msp|prise|prisen|pck|päckchen|tasse|tassen|becher|glas|dose)$/.test(unit)) return 0;
    let min;
    if (unit === 'g' || unit === 'kg') {
      const grams = unit === 'kg' ? v * 1000 : v;
      min = 3 + Math.max(0, Math.round((grams - 250) / 250 * 2));
    } else {
      min = 3 + Math.max(0, Math.round(v) - 2);
    }
    return Math.min(15, min);
  }

  function estimateMinutes(recipe) {
    const steps = recipe.steps || [];
    const ingredients = recipe.ingredients || [];
    if (!steps.length) return null;
    const items = ingredients.map(line => ({ line, noun: ingredientNoun(line) })).filter(x => x.noun.length >= 3);
    let total = Math.ceil(ingredients.length / 4); // Zutaten bereitstellen
    let overnight = false;

    for (const step of steps) {
      if (/über\s+nacht/i.test(step)) overnight = true;
      const explicit = explicitMinutes(step);
      let est = 0;
      if (CUT.test(step)) {
        const words = S.words(step);
        const hit = items.filter(({ noun }) => words.some(w => w === noun || (noun.length >= 5 && (w.startsWith(noun.slice(0, -1)) || noun.startsWith(w) && w.length >= 4))));
        if (hit.length) est += hit.reduce((sum, x) => sum + cutMinutes(x.line), 0);
        else if (GENERIC_PRODUCE.test(step)) est += ingredients.filter(isCountable).reduce((sum, l) => sum + cutMinutes(l), 0) || 6;
        else est += 3;
      }
      if (!explicit) {
        if (MELT.test(step)) est += 5;
        else if (FRY.test(step)) est += 8;
        else if (BOIL.test(step)) est += 10;
        else if (PARALLEL.test(step) && est === 0) est += 0;
        else if (MIX.test(step) || est === 0) est += 2;
      }
      total += explicit + est;
    }
    return { minutes: Math.max(5, Math.ceil(total / 5) * 5), overnight };
  }

  function format(result) {
    if (!result) return '';
    const m = result.minutes;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    let text = 'ca. ' + (h ? h + ' Std.' + (rest ? ' ' + rest + ' Min.' : '') : rest + ' Min.');
    if (result.overnight) text += ' + über Nacht';
    return text;
  }

  window.RecipeTime = { estimateMinutes, explicitMinutes, format, label: r => format(estimateMinutes(r)) };
})();
