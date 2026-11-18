/* Mengen umrechnen: "200 g Mehl" für 2 Personen -> "400 g Mehl" für 4 Personen.
   Umgerechnet wird die Menge am Zeilenanfang (auch "1 1/2", "½", "2-3", "ca. 200 g")
   und Gewichte/Volumen in Klammern wie "1 Dose (400 g) Tomaten".
   Zahlen mitten im Text (z. B. "Mehl Type 405") bleiben unverändert. */
(function () {
  'use strict';

  const GLYPHS = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };
  const G = '[½¼¾⅓⅔⅛]';
  const NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?(?:\\s?' + G + ')?|' + G + ')';
  const METRIC = ['g', 'kg', 'mg', 'ml', 'l', 'cl', 'dl'];
  const UNIT = '(g|kg|mg|ml|l|cl|dl)';

  // Maßeinheiten, die zusammen mit der Zahl hervorgehoben werden
  const KNOWN_UNITS = new Set(['g', 'kg', 'mg', 'ml', 'l', 'cl', 'dl', 'el', 'tl', 'msp', 'pck', 'päckchen', 'packung', 'prise', 'prisen',
    'dose', 'dosen', 'bund', 'becher', 'tasse', 'tassen', 'glas', 'gläser', 'stück', 'stk', 'scheibe', 'scheiben', 'zehe', 'zehen',
    'handvoll', 'spritzer', 'schuss', 'zweig', 'zweige', 'blatt', 'blätter', 'tropfen', 'würfel', 'liter', 'gramm', 'kilogramm', 'tüte', 'beutel', 'flasche', 'stange', 'stangen', 'knolle', 'kopf']);
  // Menge am Anfang: optional "ca."/"etwa", Zahl oder Bereich, optional Einheit
  const LEAD = new RegExp('^(\\s*(?:ca\\.?\\s*|etwa\\s+|circa\\s+)?)(' + NUM + ')(?:\\s*[-–]\\s*(' + NUM + '))?(\\s*)([A-Za-zÄÖÜäöüß]+\\.?(?=\\s|,|$))?', 'i');
  const PAREN = new RegExp('(\\()([^)]*?)(' + NUM + ')\\s*' + UNIT + '\\b', 'gi');

  function parseNum(s) {
    s = String(s).trim();
    let m;
    if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[2] > 0 ? m[1] / m[2] : NaN;
    if ((m = s.match(new RegExp('^(\\d+(?:[.,]\\d+)?)?\\s?(' + G + ')?$')))) {
      if (!m[1] && !m[2]) return NaN;
      return (m[1] ? parseFloat(m[1].replace(',', '.')) : 0) + (m[2] ? GLYPHS[m[2]] : 0);
    }
    return NaN;
  }

  function decimal(v, digits) {
    return (Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits)).toString().replace('.', ',');
  }

  // Für Stück, EL, TL usw.: Brüche wie ½, ¼, ⅓
  function formatCount(v) {
    const whole = Math.floor(v + 1e-9);
    const frac = v - whole;
    const options = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
    let best = null;
    for (const [val, glyph] of options) {
      if (Math.abs(frac - val) <= 0.04) { best = [val, glyph]; break; }
    }
    if (best) {
      const w = whole + (best[0] === 1 ? 1 : 0);
      if (!best[1]) return String(w);
      return (w ? w : '') + best[1];
    }
    return decimal(v, v < 10 ? 1 : 0);
  }

  const TO_BASE = { mg: 0.001, g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, l: 1000 };

  // Für g/ml: sinnvoll runden und ggf. in kg/l bzw. g/ml umwandeln.
  // forceUnit: in genau diese Einheit umrechnen (für Bereiche wie "300–600 g").
  function formatMetric(v, unit, forceUnit) {
    const u = unit.toLowerCase();
    if (forceUnit) {
      v = v * TO_BASE[u] / TO_BASE[forceUnit.toLowerCase()];
      unit = forceUnit;
    } else if (u === 'kg' && v < 1) { v *= 1000; unit = 'g'; }
    else if (u === 'l' && v < 1) { v *= 1000; unit = 'ml'; }
    else if (u === 'g' && v >= 1000) { v /= 1000; unit = 'kg'; }
    else if (u === 'ml' && v >= 1000) { v /= 1000; unit = 'l'; }
    const lu = unit.toLowerCase();
    let text;
    if (lu === 'g' || lu === 'ml' || lu === 'mg') {
      if (v >= 100) text = String(Math.round(v / 5) * 5);
      else if (v >= 10) text = String(Math.round(v));
      else text = decimal(Math.round(v * 2) / 2 || 0.5, 1);
    } else {
      text = decimal(v, v < 10 ? 2 : 1);
    }
    return { text, unit };
  }

  /* Gibt Teile zurück: [{ t: 'Text', amount: true/false }].
     So kann die Anzeige die Menge fett darstellen. */
  function scaleIngredient(line, factor) {
    const text = String(line);
    const m = text.match(LEAD);
    let parts = [];
    let rest = text;

    if (m && !isNaN(parseNum(m[2]))) {
      // Nur echte Maßeinheiten gehören zur Menge, "Eier" oder "Bio-" nicht
      const known = m[5] && KNOWN_UNITS.has(m[5].replace(/\.$/, '').toLowerCase());
      const unitWord = known ? m[5] : '';
      const consumed = known ? m[0].length : m[0].length - (m[5] || '').length - m[4].length;
      const gap = known ? m[4] : '';
      const unitClean = unitWord.replace(/\.$/, '');
      const isMetric = METRIC.includes(unitClean.toLowerCase());
      const a = parseNum(m[2]) * factor;
      const b = m[3] != null ? parseNum(m[3]) * factor : null;
      let amountText;
      let unitOut = unitWord;
      if (isMetric) {
        if (b != null && !isNaN(b)) {
          const fb = formatMetric(b, unitClean);
          amountText = formatMetric(a, unitClean, fb.unit).text + '–' + fb.text;
          unitOut = fb.unit;
        } else {
          const fa = formatMetric(a, unitClean);
          amountText = fa.text; unitOut = fa.unit;
        }
      } else {
        amountText = formatCount(a) + (b != null && !isNaN(b) ? '–' + formatCount(b) : '');
      }
      const amount = amountText + gap + unitOut;
      if (m[1]) parts.push({ t: m[1], amount: false });
      parts.push({ t: factor === 1 ? text.slice(m[1].length, consumed) : amount, amount: true });
      rest = text.slice(consumed);
    }

    // Gewichte/Volumen in Klammern
    if (factor !== 1) {
      rest = rest.replace(PAREN, (all, open, before, num, unit) => {
        const v = parseNum(num);
        if (isNaN(v)) return all;
        const f = formatMetric(v * factor, unit);
        return open + before + f.text + ' ' + f.unit;
      });
    }
    if (rest) parts.push({ t: rest, amount: false });
    return parts;
  }

  function scaleText(line, factor) {
    return scaleIngredient(line, factor).map(p => p.t).join('');
  }

  const PERSON_UNITS = ['', 'person', 'personen', 'pers', 'portion', 'portionen', 'port'];
  function isPersons(unit) {
    return PERSON_UNITS.includes(String(unit || '').toLowerCase().replace(/\.$/, '').trim());
  }

  // Wandelt alte Texteingaben wie "4", "12 Stück", "1 Blech" in Zahl + Einheit um.
  function parseServings(value) {
    if (typeof value === 'number') return { servings: value > 0 ? value : null, unit: '' };
    const s = String(value || '').trim();
    const m = s.match(new RegExp('^(?:für\\s+)?(' + NUM + ')\\s*(.*)$', 'i'));
    if (!m) return { servings: null, unit: s };
    const n = parseNum(m[1]);
    return { servings: n > 0 ? n : null, unit: m[2].trim() };
  }

  function servingsLabel(n, unit) {
    const num = formatCount(n);
    if (isPersons(unit)) return num + ' ' + (n === 1 ? 'Person' : 'Personen');
    return num + ' ' + unit;
  }

  window.RecipeScale = { parseNum, scaleIngredient, scaleText, parseServings, isPersons, servingsLabel, formatCount };
})();
