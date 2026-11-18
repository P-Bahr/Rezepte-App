// Prüft die Mengen-Umrechnung ohne Browser: node tests/scale.test.js
global.window = {};
require('../js/scale.js');
const S = window.RecipeScale;
let fail = 0;
const cases = [
  ['200 g Mehl', 2, '400 g Mehl'], ['200 g Mehl', 0.5, '100 g Mehl'], ['1 kg Äpfel', 0.5, '500 g Äpfel'],
  ['600 g Kartoffeln', 2, '1,2 kg Kartoffeln'], ['250 ml Sahne', 0.5, '125 ml Sahne'], ['1 l Gemüsebrühe', 0.5, '500 ml Gemüsebrühe'],
  ['3 Eier', 0.5, '1½ Eier'], ['1/2 TL Salz', 0.5, '¼ TL Salz'], ['1 1/2 EL Zucker', 2, '3 EL Zucker'], ['1½ EL Öl', 0.5, '¾ EL Öl'],
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
