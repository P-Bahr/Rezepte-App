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
  // Eier irgendwo in der Zutat ("4 Eier", "4 sehr frische Eier", "2 Eier (Größe M)"), aber nicht "Ei-Nudeln"
  // Eier, auch als Wortende ("Freilandeier", "Wachteleier"), Eigelb, Eiweiß
  const EGG = /(?:(?<![\p{L}])|(?<=\p{L}{3}))(eier|ei|eigelbe|eigelb|eiweiße|eiweiß|eiweisse|eiweiss)(?![\p{L}-])/iu;
  const PIECE = /^(stück|stk|st)$/i;

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
    let eggTail = null;

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
        // Eier immer ganz (mindestens 1)
        const egg = (!unitWord || PIECE.test(unitClean)) && (b == null || isNaN(b)) && EGG.test(text.slice(consumed));
        if (egg) {
          const n = Math.max(1, Math.round(a));
          amountText = String(n);
          // Einzahl/Mehrzahl: "1 Ei", "2 Eier"
          let tail = text.slice(consumed);
          tail = n === 1 ? tail.replace(/(\p{L}*?)([Ee])ier(?!\p{L})/u, '$1$2i').replace(/\b([Ee])igelbe\b/u, '$1igelb').replace(/\b([Ee])iweiße\b/u, '$1iweiß')
            : tail.replace(/(^|\s)(\p{L}*?)([Ee])i(?![\p{L}-])/u, '$1$2$3ier');
          eggTail = tail;
        }
        // Winzige Mengen nie als "0": "etwas Salz" statt "0 Prise Salz"
        else if (a > 0 && a < 0.125 && (b == null || isNaN(b) || b < 0.125)) { amountText = 'etwas'; unitWord && (unitOut = ''); }
      }
      // Packungen: Einzahl/Mehrzahl passend ("1 Dose", "2 Dosen")
      const PACK_SG = { dosen: 'Dose', flaschen: 'Flasche', packungen: 'Packung', gläser: 'Glas', tüten: 'Tüte', beutel: 'Beutel', becher: 'Becher', kartons: 'Karton', schalen: 'Schale', päckchen: 'Päckchen' };
      const PACK_PL = { dose: 'Dosen', flasche: 'Flaschen', packung: 'Packungen', glas: 'Gläser', tüte: 'Tüten', karton: 'Kartons', schale: 'Schalen' };
      const lowU = unitOut.toLowerCase();
      const maxAmount = b != null && !isNaN(b) ? b : a;
      if (!isMetric && maxAmount <= 1 && PACK_SG[lowU]) unitOut = PACK_SG[lowU];
      else if (!isMetric && maxAmount > 1 && PACK_PL[lowU]) unitOut = PACK_PL[lowU];
      const amount = unitOut ? amountText + gap + unitOut : amountText;
      if (m[1]) parts.push({ t: m[1], amount: false });
      parts.push({ t: factor === 1 ? text.slice(m[1].length, consumed) : amount, amount: true });
      rest = factor !== 1 && eggTail != null ? eggTail : text.slice(consumed);
    }

    // Gewichte/Volumen in Klammern mit umrechnen ("½ Dose (200 g)" = so viel braucht man);
    // "je 400 ml" ist die Größe einer Packung und bleibt gleich
    if (factor !== 1) {
      rest = rest.replace(PAREN, (all, open, before, num, unit) => {
        if (/\bje\b/i.test(before)) return all;
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

  const SINGULAR = { 'Gläser': 'Glas' };
  const PLURAL = { 'Blech': 'Bleche', 'Springform': 'Springformen', 'Kastenform': 'Kastenformen' };
  function servingsLabel(n, unit) {
    const num = formatCount(n);
    if (isPersons(unit)) return num + ' ' + (n === 1 ? 'Person' : 'Personen');
    if (n === 1 && SINGULAR[unit]) return num + ' ' + SINGULAR[unit];
    if (n !== 1 && PLURAL[unit]) return num + ' ' + PLURAL[unit];
    return num + ' ' + unit;
  }

  // Einheiten für die Auswahl im Formular ('' = Stück, ohne Einheit)
  const FORM_UNITS = ['', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Msp.', 'Pck.', 'Dose', 'Becher', 'Bund', 'Zehe', 'Scheibe', 'Stange', 'Glas', 'Tasse', 'Handvoll'];

  // "200 g Mehl" -> { amount: '200', unit: 'g', name: 'Mehl' }; ohne Menge: { amount: '', unit: '', name: Zeile }
  function parseIngredient(line) {
    const text = String(line || '').trim();
    const m = text.match(LEAD);
    if (!m || isNaN(parseNum(m[2]))) return { amount: '', unit: '', name: text };
    const known = m[5] && KNOWN_UNITS.has(m[5].replace(/\.$/, '').toLowerCase());
    const consumed = known ? m[0].length : m[0].length - (m[5] || '').length - m[4].length;
    let unit = known ? m[5] : '';
    // Schreibweise an die Auswahl anpassen (el -> EL, pck -> Pck.)
    const hit = FORM_UNITS.find(u => u && u.replace(/\.$/, '').toLowerCase() === unit.replace(/\.$/, '').toLowerCase());
    if (hit) unit = hit;
    return { amount: m[2].trim() + (m[3] ? '–' + m[3].trim() : ''), unit, name: text.slice(consumed).trim() };
  }

  // Ist die Mengenangabe gültig? Leer, Zahl, Bruch oder Bereich ("2–3")
  function validAmount(a) {
    a = String(a || '').trim();
    if (!a) return true;
    const parts = a.split(/\s*[-–]\s*/);
    return parts.length <= 2 && parts.every(p => p && !isNaN(parseNum(p)));
  }

  /* ---------- Zutatenzeile in einheitliche Form bringen ----------
     Erkennt Menge und Einheit an beliebiger Stelle:
     "Mehl 200g" -> "200 g Mehl", "Zucker: 100 g" -> "100 g Zucker", "Eier 4" -> "4 Eier",
     "eine Prise Salz" -> "1 Prise Salz", "Butter (125 g, weich)" -> "125 g Butter (weich)".
     Zahlen, die zum Namen gehören ("Mehl Type 405", "Joghurt 3,5 %", "26er Form"), bleiben im Namen. */
  const NUM_WORDS = { ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, 'zwölf': 12, anderthalb: '1½', eineinhalb: '1½' };
  const UNIT_CASE = { el: 'EL', tl: 'TL', msp: 'Msp.', pck: 'Pck.', g: 'g', kg: 'kg', mg: 'mg', ml: 'ml', l: 'l', cl: 'cl', dl: 'dl' };
  const ANY_AMOUNT = new RegExp('(?<![\\p{L}\\d,./])(' + NUM + ')(?:\\s*[-–]\\s*(' + NUM + '))?(?![\\d/])(\\s*)([A-Za-zÄÖÜäöüß]+\\.?)?', 'giu');

  function unitCase(u) {
    const k = u.replace(/\.$/, '').toLowerCase();
    return UNIT_CASE[k] || u;
  }

  function normalizeIngredient(line) {
    let t = String(line || '').replace(/^[\s\-–•*·]+/, '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    // "200g" -> "200 g", "1EL" -> "1 EL"
    t = t.replace(/(\d)(?=(?:g|kg|mg|ml|l|cl|dl|el|tl|msp|pck)\b)/gi, '$1 ');
    // Zahlwort am Anfang: "eine Prise" -> "1 Prise", "ein halber TL" -> "½ TL", "zwei Eier" -> "2 Eier"
    t = t.replace(/^(?:(ein|eine|einen|einem|einer)\s+)?(halbe[nrs]?|halb)\s+/i, (all, a, b) => '½ ');
    t = t.replace(/^([A-Za-zäöüß]+)\s+/, (all, w) => {
      const v = NUM_WORDS[w.toLowerCase()];
      return v != null ? v + ' ' : all;
    });

    // Steht die Menge schon vorn, nur Einheit vereinheitlichen
    const lead = t.match(LEAD);
    if (lead && !isNaN(parseNum(lead[2]))) {
      if (lead[5] && KNOWN_UNITS.has(lead[5].replace(/\.$/, '').toLowerCase())) {
        const start = lead[0].length - lead[5].length;
        t = t.slice(0, start) + unitCase(lead[5]) + t.slice(lead[0].length);
      }
      return t;
    }

    // Menge irgendwo im Text suchen
    ANY_AMOUNT.lastIndex = 0;
    let m;
    while ((m = ANY_AMOUNT.exec(t))) {
      const before = t.slice(0, m.index);
      const word = m[4] || '';
      const num = m[1];
      const amountEnd = m.index + m[0].length - word.length - m[3].length;
      if (/(typ|type)\s*$/i.test(before)) continue;              // Mehl Type 405
      if (/^\s*[%°]/.test(t.slice(amountEnd))) continue;         // 3,5 % Fett, 200 °C
      if (/^(prozent|cm|mm|grad|er)$/i.test(word)) continue;      // 26er Form
      if (isNaN(parseNum(num))) continue;
      const known = word && KNOWN_UNITS.has(word.replace(/\.$/, '').toLowerCase());
      const amount = num.trim() + (m[2] ? '–' + m[2].trim() : '');
      const cutEnd = m.index + (known ? m[0].length : m[0].length - word.length - m[3].length);
      let name = (t.slice(0, m.index) + ' ' + t.slice(cutEnd))
        .replace(/\(\s*[,;]\s*/g, '(').replace(/\s*[,;]\s*\)/g, ')').replace(/\(\s*\)/g, '')
        .replace(/\s*[:]\s*/g, ' ').replace(/\s+([,;])/g, '$1')
        .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
      if (!name) return t;
      return [amount, known ? unitCase(word) : '', name].filter(Boolean).join(' ');
    }
    return t;
  }

  window.RecipeScale = { normalizeIngredient, FORM_UNITS, parseIngredient, validAmount, parseNum, scaleIngredient, scaleText, parseServings, isPersons, servingsLabel, formatCount };
})();
