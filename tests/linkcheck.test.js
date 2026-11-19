// Regeln der Link-Prüfung: node tests/linkcheck.test.js
global.window = {};
require('../js/linkcheck.js');
const L = window.RecipeLinkCheck;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER', m); } else console.log('ok  ', m); };
const H = 36e5, D = 864e5, T0 = 1e12;

let d = L.decide(null, 'gone', T0);
ok(!d.remove && d.note.fails === 1 && d.note.soon, 'Erstes „weg“: noch nicht entfernen, bald erneut prüfen');
ok(!L.decide(d.note, 'gone', T0 + 2 * H).remove, 'Zweites „weg“ nach 2 Stunden: noch nicht entfernen');
ok(L.decide(d.note, 'gone', T0 + 7 * H).remove, 'Zweites „weg“ nach 7 Stunden: entfernen');
ok(!L.decide(d.note, 'ok', T0 + 7 * H).remove && L.decide(d.note, 'ok', T0 + 7 * H).note.fails === 0, 'Zwischendurch wieder da: zurückgesetzt');
let n = null;
for (let i = 0; i < 5; i++) n = L.decide(n, 'unknown', T0 + i * D).note;
ok(!L.decide(n, 'unknown', T0 + 9 * D).remove && !n.fails, 'Nur „unklar“ (gesperrt, überlastet): nie entfernen');

const recipes = [{ sourceUrl: 'https://seite.example/a' }, { sourceUrl: 'https://www.tiktok.com/@x/video/1' }, { sourceUrl: '' }, { sourceUrl: 'https://www.tiktok.com/@x/video/1' }];
const s = { urls: { 'https://seite.example/a': { at: T0 - 8 * D }, 'https://www.tiktok.com/@x/video/1': { at: T0 - 8 * D } } };
ok(L.due(recipes, s, T0).join() === 'https://www.tiktok.com/@x/video/1', 'Nach 8 Tagen: TikTok fällig (7 Tage), Seite noch nicht (30 Tage), doppelte nur einmal');
ok(L.due(recipes, s, T0 + 23 * D).join() === 'https://www.tiktok.com/@x/video/1,https://seite.example/a', 'Nach 31 Tagen: beide fällig, TikTok zuerst');
ok(L.due(recipes, { urls: { 'https://www.tiktok.com/@x/video/1': { at: T0, soon: true } } }, T0 + 7 * H)[0] === 'https://www.tiktok.com/@x/video/1', 'Nach erstem „weg“: schon nach 6 Stunden wieder fällig');
if (fail) { console.log(fail + ' Fehler'); process.exit(1); } else console.log('Alle Link-Prüfregeln ok');
