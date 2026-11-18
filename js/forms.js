/* Einheiten und Backformen: Personen, Stück, Gläser, Blech, Springform, Kastenform.
   Springform und Blech lassen sich ineinander umrechnen (nach Bodenfläche). */
(function () {
  'use strict';

  const UNITS = ['Personen', 'Stück', 'Gläser', 'Blech', 'Springform', 'Kastenform'];
  const DEFAULTS = { Springform: { d: 26 }, Blech: { l: 30, w: 40 }, Kastenform: { len: 30 }, 'Gläser': { ml: 250 } };
  // Gängige Glasgrößen mit Beschreibung
  const GLASSES = [
    [150, 'kleines Dessertglas'], [200, 'Trinkglas'], [250, 'Marmeladenglas'], [300, 'großes Trinkglas'],
    [400, 'mittleres Schraubglas'], [500, 'großes Schraubglas'], [750, 'Einmachglas'], [1000, 'großes Einmachglas']
  ];

  // Alte oder freie Angaben auf die fünf Einheiten abbilden
  function normalizeUnit(u) {
    const s = String(u || '').trim().toLowerCase().replace(/\.$/, '');
    if (!s || /^(person|personen|pers|portion|portionen|port|auflaufform)$/.test(s)) return 'Personen';
    if (/^(stück|stk|stck)$/.test(s)) return 'Stück';
    if (/^(gläser|glas|gläschen)$/.test(s)) return 'Gläser';
    if (/^(blech|backblech|bleche)$/.test(s)) return 'Blech';
    if (/^(springform|springformen|tortenform|kuchenform)$/.test(s)) return 'Springform';
    if (/^(kastenform|kastenformen)$/.test(s)) return 'Kastenform';
    return String(u).trim(); // unbekannt: unverändert lassen
  }

  function num(s) { const v = parseFloat(String(s).replace(',', '.')); return v > 0 ? v : null; }

  // Gespeicherte Größe lesen, z. B. "Ø 26 cm", "30 × 40 cm", "Länge 30 cm"
  function parseSize(unit, text) {
    const t = String(text || '');
    if (unit === 'Springform') {
      const m = t.match(/(\d+(?:[.,]\d+)?)/);
      return { d: (m && num(m[1])) || DEFAULTS.Springform.d };
    }
    if (unit === 'Blech') {
      const m = t.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
      return m ? { l: num(m[1]) || 30, w: num(m[2]) || 40 } : { ...DEFAULTS.Blech };
    }
    if (unit === 'Gläser') {
      const m = t.match(/(\d+(?:[.,]\d+)?)\s*(ml|l)\b/i);
      if (!m) return { ...DEFAULTS['Gläser'] };
      const v = num(m[1]);
      return { ml: v ? (m[2].toLowerCase() === 'l' ? v * 1000 : v) : 250 };
    }
    if (unit === 'Kastenform') {
      const m = t.match(/(\d+(?:[.,]\d+)?)/);
      return { len: (m && num(m[1])) || DEFAULTS.Kastenform.len };
    }
    return null;
  }

  function fmt(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

  function formatSize(unit, size) {
    if (!size) return '';
    if (unit === 'Springform') return 'Ø ' + fmt(size.d) + ' cm';
    if (unit === 'Blech') return fmt(size.l) + ' × ' + fmt(size.w) + ' cm';
    if (unit === 'Kastenform') return fmt(size.len) + ' cm lang';
    if (unit === 'Gläser') return size.ml >= 1000 ? fmt(size.ml / 1000) + ' l' : fmt(size.ml) + ' ml';
    return '';
  }

  // Bodenfläche in cm²
  function area(unit, size) {
    if (unit === 'Springform') return Math.PI * (size.d / 2) * (size.d / 2);
    if (unit === 'Blech') return size.l * size.w;
    return null;
  }

  const switchable = unit => unit === 'Springform' || unit === 'Blech';

  window.RecipeForms = { UNITS, DEFAULTS, GLASSES, normalizeUnit, parseSize, formatSize, area, switchable };
})();
