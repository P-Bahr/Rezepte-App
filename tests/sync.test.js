// Prüft das Zusammenführen beim Online-Abgleich (ohne Netz): node tests/sync.test.js
global.window = {};
for (const f of ['search', 'scale', 'dupes', 'sync']) require('../js/' + f + '.js');
const { merge, pending } = window.RecipeSync;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER', m); } else console.log('ok  ', m); };

const R = (id, t, u, extra) => ({ id, title: t, collectionId: 'c1', updatedAt: u, ...(extra || {}) });
const row = (x, deleted) => ({ id: x.id, data: deleted ? null : x, deleted: !!deleted, updated_at: x.updatedAt });
const C1 = { id: 'c1', name: 'Alltag', updatedAt: '2026-01-01' };
const empty = { user: 'u', r: {}, c: {}, img: {} };
const titles = d => d.recipes.map(r => r.title).sort().join(',');

// 1. Erstes Gerät: Server leer -> alles hochladen
let local = { recipes: [R('a', 'A', '1')], collections: [C1] };
let m = merge(local, { recipes: [], collections: [] }, empty);
let p = pending(m.data, m.snap);
ok(p.upserts.recipes.length === 1 && p.upserts.collections.length === 1, 'Neues Gerät lädt alles hoch');

// 2. Zweites Gerät: bekommt Rezepte vom Server
m = merge({ recipes: [], collections: [] }, { recipes: [row(R('a', 'A', '1'))], collections: [row(C1)] }, empty);
ok(titles(m.data) === 'A' && pending(m.data, m.snap).upserts.recipes.length === 0, 'Rezept vom anderen Gerät erscheint, nichts doppelt hochladen');

// 3. Server neuer -> übernehmen
let snap = { user: 'u', r: { a: { u: '1', d: false } }, c: { c1: { u: '2026-01-01', d: false } }, img: {} };
m = merge({ recipes: [R('a', 'A alt', '1')], collections: [C1] }, { recipes: [row(R('a', 'A neu', '2'))], collections: [row(C1)] }, snap);
ok(titles(m.data) === 'A neu', 'Neuere Änderung vom Server gewinnt');

// 4. Lokal neuer -> behalten und hochladen
m = merge({ recipes: [R('a', 'A lokal', '3')], collections: [C1] }, { recipes: [row(R('a', 'A server', '2'))], collections: [row(C1)] }, snap);
ok(titles(m.data) === 'A lokal' && pending(m.data, m.snap).upserts.recipes.length === 1, 'Neuere lokale Änderung bleibt und wird hochgeladen');

// 5. Auf anderem Gerät gelöscht -> hier entfernen
m = merge({ recipes: [R('a', 'A', '1')], collections: [C1] }, { recipes: [{ id: 'a', data: null, deleted: true, updated_at: '2' }], collections: [row(C1)] }, snap);
ok(m.data.recipes.length === 0 && pending(m.data, m.snap).deletes.recipes.length === 0, 'Auf anderem Gerät gelöscht -> hier weg');

// 6. Hier gelöscht -> nicht wieder auftauchen, Löschung hochladen
m = merge({ recipes: [], collections: [C1] }, { recipes: [row(R('a', 'A', '1'))], collections: [row(C1)] }, snap);
p = pending(m.data, m.snap);
ok(m.data.recipes.length === 0 && p.deletes.recipes.join() === 'a', 'Hier gelöscht -> bleibt weg, Löschung wird hochgeladen');

// 7. Gelöscht auf anderem Gerät, hier aber danach noch geändert -> behalten
m = merge({ recipes: [R('a', 'A geändert', '5')], collections: [C1] }, { recipes: [{ id: 'a', data: null, deleted: true, updated_at: '4' }], collections: [row(C1)] }, snap);
ok(titles(m.data) === 'A geändert' && pending(m.data, m.snap).upserts.recipes.length === 1, 'Nach dem Löschen woanders hier geändert -> bleibt');

// 8. Gleichnamige Sammlungen werden zusammengelegt
const C2 = { id: 'c2', name: 'alltag', updatedAt: '2026-01-02' };
m = merge({ recipes: [R('b', 'B', '1', { collectionId: 'c2' })], collections: [C2] }, { recipes: [], collections: [row(C1)] }, empty, 'jetzt');
ok(m.data.collections.length === 1 && m.data.collections[0].id === 'c1' && m.data.recipes[0].collectionId === 'c1' && m.data.recipes[0].updatedAt === 'jetzt', 'Doppelte Sammlung zusammengelegt, Rezept umgehängt');

// 9. Beispielrezepte auf zwei Geräten getrennt geladen -> nur einmal
m = merge({ recipes: [R('x1', 'Tiramisu', '1', { example: true }), R('own', 'Tiramisu', '1')], collections: [C1] },
  { recipes: [row(R('x2', 'Tiramisu', '1', { example: true }))], collections: [row(C1)] }, empty);
ok(m.data.recipes.map(r => r.id).sort().join() === 'own,x2', 'Doppeltes Beispiel entfällt, eigenes Rezept gleichen Namens bleibt');

// 10. Nach dem Hochladen ist nichts mehr offen
snap = { user: 'u', r: { a: { u: '7', d: false } }, c: { c1: { u: '2026-01-01', d: false } }, img: {} };
p = pending({ recipes: [R('a', 'A', '7')], collections: [C1] }, snap);
ok(!p.upserts.recipes.length && !p.upserts.collections.length && !p.deletes.recipes.length, 'Abgeglichen: nichts offen');

// 11. Gleiches Rezept mit anderem Namen auf zwei Geräten getrennt eingegeben -> nur einmal, Favorit bleibt
const T1 = R('t1', 'Tiramisu', '1', { ingredients: ['500 g Mascarpone', '4 Eier', '80 g Zucker', '200 g Löffelbiskuits', '300 ml Espresso'], steps: ['Schichten und kühlen.'] });
const T2 = R('t2', 'Omas Tiramisu', '2', { favorite: true, ingredients: ['Mascarpone 500g', 'Eier 4', 'Zucker 80 g', 'Löffelbiskuits 200g', 'Espresso 300 ml'], steps: ['Schichten und kühlen.'] });
const B1 = R('b1', 'Bananenbrot', '1', { ingredients: ['3 Bananen', '250 g Mehl', '2 Eier', '120 g Zucker'], steps: ['Backen.'] });
m = merge({ recipes: [T2, B1], collections: [C1] }, { recipes: [row(T1)], collections: [row(C1)] }, empty, 'jetzt');
ok(m.data.recipes.map(r => r.id).sort().join() === 'b1,t1' && m.data.recipes.find(r => r.id === 't1').favorite === true, 'Gleiches Rezept mit anderem Namen nur einmal, Favorit übernommen');

if (fail) { console.log(fail + ' Fehler'); process.exit(1); } else console.log('Alle Abgleich-Regeln ok');
