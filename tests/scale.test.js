// Prüft die Mengen-Umrechnung ohne Browser: node tests/scale.test.js
global.window = {};
require('../js/scale.js');
const S = window.RecipeScale;
let fail = 0;
const cases = [
  ['200 g Mehl', 2, '400 g Mehl'], ['200 g Mehl', 0.5, '100 g Mehl'], ['1 kg Äpfel', 0.5, '500 g Äpfel'],
  ['600 g Kartoffeln', 2, '1,2 kg Kartoffeln'], ['250 ml Sahne', 0.5, '125 ml Sahne'], ['1 l Gemüsebrühe', 0.5, '500 ml Gemüsebrühe'],
  ['3 Eier', 0.5, '2 Eier'], ['1/2 TL Salz', 0.5, '¼ TL Salz'], ['1 1/2 EL Zucker', 2, '3 EL Zucker'], ['1½ EL Öl', 0.5, '¾ EL Öl'],
  ['2-3 EL Essig', 2, '4–6 EL Essig'], ['ca. 200 g Feta', 2, 'ca. 400 g Feta'], ['1 Dose (400 g) Tomaten', 0.5, '½ Dose (200 g) Tomaten'],
  ['Mehl Type 405', 2, 'Mehl Type 405'], ['Salz, Pfeffer', 3, 'Salz, Pfeffer'], ['500-600 g Hack', 2, '1–1,2 kg Hack'], ['5 g Hefe', 0.5, '2,5 g Hefe'],
  ['250 g Tellerlinsen', 1 / 3, '83 g Tellerlinsen'], ['1 Zitrone', 1, '1 Zitrone'], ['2,5 kg Mehl', 1, '2,5 kg Mehl'], ['1 Bio-Zitrone', 2, '2 Bio-Zitrone']
];
for (const [line, f, exp] of cases) {
  const got = S.scaleText(line, f);
  if (got !== exp) { fail++; console.log('FEHLER', line, '×', f, '→', got, '(erwartet', exp + ')'); }
  else console.log('ok  ', line, '×', +f.toFixed(2), '→', got);
}
for (const [v, n, u] of [['4', 4, ''], ['12 Stück', 12, 'Stück'], ['für 6 Personen', 6, 'Personen'], ['', null, '']]) {
  const p = S.parseServings(v);
  if (p.servings !== n || p.unit !== u) { fail++; console.log('FEHLER parseServings', v, JSON.stringify(p)); }
}
if (fail) { console.log(fail + ' Fehler'); process.exit(1); } else console.log('Alle Umrechnungen ok');
// Hervorhebung: nur Zahl und echte Einheit
const bold = (l, f) => S.scaleIngredient(l, f).filter(p => p.amount).map(p => p.t).join('');
for (const [l, f, exp] of [['1 Bio-Zitrone', 1, '1'], ['4 Eier', 0.5, '2'], ['200 g Mehl', 2, '400 g'], ['1 Pck. Backpulver', 1, '1 Pck.'], ['2 EL Öl', 1.5, '3 EL'], ['1 kg Äpfel', 0.5, '500 g']]) {
  if (bold(l, f) !== exp) { console.log('FEHLER fett', l, '→', JSON.stringify(bold(l, f))); process.exitCode = 1; }
  else console.log('ok   fett', l, '→', bold(l, f));
}

// Eier: immer ganze Zahlen
for (const [l, f, exp] of [['4 Eier', 0.4793, '2 Eier'], ['3 Eier', 0.5, '2 Eier'], ['4 Eier', 2.2602, '9 Eier'], ['2 Eigelb', 0.75, '2 Eigelb'], ['1 Ei', 0.25, '1 Ei'], ['4 Eier', 1, '4 Eier'], ['2 Eier', 2, '4 Eier']]) {
  const got = S.scaleText(l, f);
  if (got !== exp) { console.log('FEHLER Ei', l, f, '→', got); process.exitCode = 1; } else console.log('ok   Ei', l, '×', f, '→', got);
}
// Flächen: Springform und Blech
require('../js/search.js'); require('../js/forms.js');
const F = window.RecipeForms;
const near = (a, b) => Math.abs(a - b) < 0.01;
const checks = [
  [F.area('Springform', { d: 26 }), Math.PI * 169, 'Fläche Ø 26'],
  [F.area('Blech', { l: 30, w: 40 }), 1200, 'Fläche Blech'],
  [F.area('Springform', { d: 18 }) / F.area('Springform', { d: 26 }), 324 / 676, 'Faktor Ø 26 → Ø 18 = (18/26)²']
];
for (const [got, exp, name] of checks) {
  if (!near(got, exp)) { console.log('FEHLER', name, got, exp); process.exitCode = 1; } else console.log('ok  ', name, got.toFixed(4));
}
// Alternativen
global.window.RecipeSearch = window.RecipeSearch; require('../js/substitutes.js');
const A = window.RecipeSubstitutes.alternativeFor;
for (const [l, exp] of [['2 EL Dijon-Senf', 'mittelscharfer Senf, gleiche Menge'], ['1 EL Sesamöl', 'Rapsöl mit etwas geröstetem Sesam'], ['200 g Crème fraîche', 'Schmand oder saure Sahne'], ['1 TL Koriandersamen', null], ['1 Bund Koriander', 'glatte Petersilie'], ['2 Schalotten', 'eine kleine, milde Zwiebel'], ['200 g Mehl', null], ['1 Prise Kardamom', 'eine Prise Zimt oder weglassen']]) {
  if (A(l) !== exp) { console.log('FEHLER Alternative', l, '→', A(l)); process.exitCode = 1; } else console.log('ok   Alternative', l, '→', A(l));
}

// Gläser
const G = F.parseSize('Gläser', '300 ml');
if (G.ml !== 300 || F.formatSize('Gläser', { ml: 1000 }) !== '1 l' || F.parseSize('Gläser', '0,5 l').ml !== 500) { console.log('FEHLER Glasgröße'); process.exitCode = 1; } else console.log('ok   Glasgrößen');

// Zeitschätzung: Flüssigkeiten werden nicht "geschnitten"
require('../js/time.js');
const T = window.RecipeTime;
const vs = T.estimateMinutes({ ingredients: ['500 ml Milch', '1 Vanilleschote', '4 Eigelb'], steps: ['Vanilleschote aufschneiden und mit der Milch aufkochen.', 'Eigelb unterrühren.'] }).minutes;
if (vs > 30) { console.log('FEHLER Zeit Vanillesoße', vs); process.exitCode = 1; } else console.log('ok   Zeit Vanillesoße', vs, 'Min.');
