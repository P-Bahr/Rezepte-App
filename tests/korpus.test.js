// Einordnung messen: node tests/korpus.test.js [--alle]
// Prüft Rezeptart, Zubereitung und Hauptzutat-Gruppe für jedes Rezept in tests/fixtures/korpus.txt.
global.window = {};
for (const f of ['search', 'scale', 'forms', 'importer', 'maingroups']) require('../js/' + f + '.js');
const I = window.RecipeImporter, G = window.RecipeGroups;
const fs = require('fs');
const lines = fs.readFileSync(__dirname + '/fixtures/korpus.txt', 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
const fields = { course: 0, method: 0, group: 0 };
const fails = [];
for (const l of lines) {
  const [title, course, method, group, ing, st] = l.split('|').map(x => x.trim());
  const d = I.withGuesses({ title, ingredients: ing.split(';').map(x => x.trim()).filter(Boolean), steps: st.split(';').map(x => x.trim()).filter(Boolean) }, [], []);
  const got = { course: d.course, method: d.method, group: d.mainIngredient ? G.groupOf(d.mainIngredient) : '' };
  const want = { course, method, group };
  for (const k in fields) {
    if (got[k] === want[k]) fields[k]++;
    else fails.push(k.padEnd(6) + ' ' + title.padEnd(34) + ' erwartet ' + JSON.stringify(want[k]).padEnd(20) + ' erhalten ' + JSON.stringify(got[k]) + (k === 'group' ? ' (' + d.mainIngredient + ')' : ''));
  }
}
const n = lines.length;
console.log('Rezepte:', n);
for (const k in fields) console.log(k.padEnd(7), (100 * fields[k] / n).toFixed(1) + ' %', '(' + (n - fields[k]) + ' falsch)');
if (process.argv.includes('--alle') || fails.length) console.log(fails.join('\n'));
// Mindestquote, damit spätere Änderungen nichts verschlechtern
const MIN = { course: 1, method: 1, group: 1 }; // jeder Fehler in der Sammlung bricht ab
const bad = Object.keys(MIN).filter(k => fields[k] / n < MIN[k]);
if (bad.length) { console.log('FEHLER Trefferquote zu niedrig: ' + bad.join(', ')); process.exit(1); }
console.log('Einordnung ok');
