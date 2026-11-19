// Import-Tests ohne Netz: node --experimental-strip-types tests/import.test.js
// Prüft das Server-Programm (Seite auslesen, Link-Prüfung) und das Umwandeln in der App.
global.window = {};
for (const f of ['search', 'scale', 'forms', 'importer']) require('../js/' + f + '.js');
const I = window.RecipeImporter;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER', m); } else console.log('ok  ', m); };

(async () => {
  const fn = await import('../supabase/functions/import/index.ts');

  // ---------- Link-Prüfung ----------
  ok(fn.checkUrl('https://www.chefkoch.de/rezepte/123/x.html').url, 'Normaler Link erlaubt');
  for (const bad of ['ftp://x.de/a', 'http://localhost/a', 'http://127.0.0.1/', 'http://192.168.1.10/', 'http://10.0.0.1', 'http://intranet/', 'http://[::1]/', 'kein link', 'http://169.254.169.254/latest'])
    ok(fn.checkUrl(bad).error, 'Gesperrt: ' + bad);

  // ---------- Seite 1: wie Chefkoch (Anleitung als ein Text, Portionen als Zahl) ----------
  const chefkoch = `<html><head><title>Käsespätzle | Chefkoch</title>
  <meta property="og:image" content="https://img.example/kaese.jpg">
  <script type="application/ld+json">{"@context":"http://schema.org","@type":"Recipe","name":"Allgäuer Käsespätzle",
  "recipeYield":"4 Portion(en)","recipeIngredient":["500 g Mehl","5 Eier","1 TL Salz","300 g Bergkäse, gerieben","3 Zwiebeln","2 EL Butter"],
  "recipeInstructions":"Mehl, Eier und Salz zu einem zähen Teig verrühren und 10 Minuten ruhen lassen.\\nTeig portionsweise in kochendes Salzwasser schaben.\\nZwiebeln in Ringe schneiden und in Butter goldbraun braten.\\nSpätzle und Käse abwechselnd schichten, mit Zwiebeln bestreuen.",
  "recipeCategory":"Hauptspeise","description":"Klassiker aus dem Allgäu &amp; Schwaben.","image":["https://img.example/kaese-gross.jpg"]}</script>
  </head><body><h1>Käsespätzle</h1></body></html>`;
  let page = fn.extract(chefkoch, 'https://www.chefkoch.de/rezepte/1/kaese.html');
  ok(page.jsonld.length === 1 && page.image === 'https://img.example/kaese.jpg', 'Server: Rezeptangaben und Bild gefunden');
  let r = I.toDraft({ kind: 'page', ...page });
  ok(r && r.how === 'page', 'App: Rezept erkannt');
  let d = r.draft;
  ok(d.title === 'Allgäuer Käsespätzle', 'Name: ' + d.title);
  ok(d.ingredients.length === 6 && d.ingredients[3] === '300 g Bergkäse, gerieben', 'Zutaten: ' + d.ingredients.join(' | '));
  ok(d.steps.length === 4 && d.steps[0].startsWith('Mehl, Eier'), 'Schritte aus einem Text getrennt: ' + d.steps.length);
  ok(d.servings === 4 && d.servingsUnit === 'Personen', 'Portionen: ' + d.servings + ' ' + d.servingsUnit);
  ok(d.course === 'Hauptgericht' && d.method === 'Kochen', 'Kategorien: ' + d.course + ' / ' + d.method);
  ok(d.mainIngredient === 'Bergkäse', 'Hauptzutat: Bergkäse (Mehl, Eier, Salz zählen als Grundzutaten): ' + d.mainIngredient);
  ok(d.notes === '' && d.imageUrl === 'https://img.example/kaese-gross.jpg', 'Bild übernommen, Werbebeschreibung nicht in den Notizen');

  // ---------- Seite 2: wie WordPress-Blogs (@graph, Abschnitte, Springform) ----------
  const blog = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"Blog"},
  {"@type":"Article","headline":"Mein bester Käsekuchen"},
  {"@type":["Recipe"],"name":"Käsekuchen ohne Boden","recipeYield":["1","1 Springform (26 cm)"],
   "recipeIngredient":["1 kg Magerquark","200 g Zucker","4 Eier","1 Päckchen Vanillepuddingpulver"],
   "recipeInstructions":[{"@type":"HowToSection","name":"Vorbereitung","itemListElement":[{"@type":"HowToStep","text":"Ofen auf 175 °C vorheizen."}]},
     {"@type":"HowToSection","name":"Teig","itemListElement":[{"@type":"HowToStep","text":"Alle Zutaten glatt rühren."},{"@type":"HowToStep","text":"60 Minuten backen."}]}],
   "recipeCategory":["Kuchen"],"image":{"@type":"ImageObject","url":"https://img.example/kk.jpg"}}]}</script>`;
  d = I.toDraft({ kind: 'page', ...fn.extract(blog, 'https://blog.example/kk') }).draft;
  ok(d.title === 'Käsekuchen ohne Boden' && d.ingredients.length === 4, 'Blog: Rezept im @graph gefunden');
  ok(d.steps.join(' | ') === 'Vorbereitung: Ofen auf 175 °C vorheizen. | Teig: Alle Zutaten glatt rühren. | 60 Minuten backen.', 'Abschnitte übernommen: ' + d.steps.join(' | '));
  ok(d.servings === 1 && d.servingsUnit === 'Springform' && d.formSize === 'Ø 26 cm', 'Springform Ø 26 erkannt: ' + d.servings + ' ' + d.servingsUnit + ' ' + d.formSize);
  ok(d.course === 'Gebäck' && d.method === 'Backen' && d.mainIngredient === 'Quark', 'Kategorien: ' + d.course + ' / ' + d.method + ' / ' + d.mainIngredient);
  ok(d.imageUrl === 'https://img.example/kk.jpg', 'Bild aus ImageObject');

  // ---------- Seite 3: englische Angaben, Schritte als Liste ----------
  const en = `<script type="application/ld+json">[{"@type":"Recipe","name":"Banana Bread","recipeYield":"8 servings",
  "recipeIngredient":["3 ripe bananas","250 g flour","2 eggs"],"recipeInstructions":[{"@type":"HowToStep","name":"Mix","text":"Mash bananas and mix everything."},{"@type":"HowToStep","text":"Bake for 55 minutes."}],"keywords":"bread, baking"}]</script>`;
  d = I.toDraft({ kind: 'page', ...fn.extract(en, 'https://en.example/bb') }).draft;
  ok(d.servings === 8 && d.servingsUnit === 'Personen' && d.steps.length === 2 && d.course === 'Gebäck', 'Englisch: 8 servings, 2 Schritte, Gebäck');

  // ---------- Seite 4: kaputtes JSON wird übersprungen, zweites gefunden ----------
  const broken = `<script type="application/ld+json">{ kaputt </script><script type='application/ld+json'>{"@type":"Recipe","name":"Linsensuppe","recipeIngredient":["250 g Linsen","1 l Brühe"],"recipeInstructions":"Alles 30 Minuten kochen."}</script>`;
  d = I.toDraft({ kind: 'page', ...fn.extract(broken, 'https://x.example/') });
  ok(d && d.draft.title === 'Linsensuppe' && d.draft.course === 'Suppe', 'Kaputter Block übersprungen, Suppe erkannt');

  // ---------- Seite 5: kein Rezept ----------
  const none = `<html><head><title>Impressum</title></head><body><p>Kontakt: info@example.de</p></body></html>`;
  ok(I.toDraft({ kind: 'page', ...fn.extract(none, 'https://x.example/impressum') }) === null, 'Seite ohne Rezept: kein Entwurf');

  // ---------- Seite 6: kein JSON-LD, aber Rezept als Text auf der Seite ----------
  const plain = `<html><head><title>Omas Pfannkuchen</title></head><body><h1>Omas Pfannkuchen</h1><h2>Zutaten</h2><ul><li>250 g Mehl</li><li>500 ml Milch</li><li>3 Eier</li><li>1 Prise Salz</li></ul><h2>Zubereitung</h2><p>Alles zu einem glatten Teig verrühren und 10 Minuten quellen lassen.</p><p>In einer Pfanne mit etwas Butter dünne Pfannkuchen ausbacken.</p></body></html>`;
  r = I.toDraft({ kind: 'page', ...fn.extract(plain, 'https://x.example/pk') });
  ok(r && r.how === 'text' && r.draft.ingredients.length === 4 && r.draft.steps.length === 2 && r.draft.title === 'Omas Pfannkuchen', 'Ohne Rezeptangaben: aus dem Seitentext gelesen (' + (r && r.draft.ingredients.join(' | ')) + ')');

  // ---------- TikTok-Beschreibung ----------
  const tt = I.toDraft({ kind: 'tiktok', url: 'https://www.tiktok.com/@koch/video/1', author: 'koch', image: 'https://img.example/t.jpg',
    text: '🔥 Cremige One-Pot-Pasta in 15 Minuten! 🍝\nZutaten:\n- 250g Spaghetti\n- Cherrytomaten 200 g\n- 2 Knoblauchzehen\n- 500 ml Gemüsebrühe\n- Parmesan 50g\nZubereitung:\n1. Alles in einen Topf geben und aufkochen.\n2. 10 Minuten köcheln lassen, bis die Nudeln gar sind.\n3. Mit Parmesan servieren.\n#pasta #onepot #rezept' });
  d = tt.draft;
  ok(tt.how === 'tiktok' && d.ingredients.join(' | ') === '250 g Spaghetti | 200 g Cherrytomaten | 2 Knoblauchzehen | 500 ml Gemüsebrühe | 50 g Parmesan', 'TikTok: Zutaten erkannt und geordnet: ' + d.ingredients.join(' | '));
  ok(d.steps.length === 3 && d.steps[0] === 'Alles in einen Topf geben und aufkochen.', 'TikTok: Schritte ohne Nummern');
  ok(d.title === 'Cremige One-Pot-Pasta' && !/#/.test(JSON.stringify(d)), 'TikTok: Titel ohne „in 15 Minuten“, Emojis und Hashtags entfernt: ' + d.title);
  ok(d.mainIngredient === 'Nudeln' && d.notes.includes('@koch'), 'TikTok: Hauptzutat Nudeln, Urheber vermerkt');

  // Alles in einer Zeile
  d = I.fromText('Schnelles Bananenbrot 🍌 Zutaten: 3 Bananen, 250 g Mehl, 2 Eier, 100 g Zucker. Zubereitung: Alles verrühren und 50 Minuten backen.');
  ok(d.ingredients.length >= 4, 'Einzeilige Beschreibung: Zutaten getrennt (' + d.ingredients.join(' | ') + ')');

  // TikTok ohne Rezept
  ok(I.toDraft({ kind: 'tiktok', url: 'x', text: 'Heute gibt es was Leckeres 😍 #food' }).how === 'tiktok-empty', 'TikTok ohne Rezept wird erkannt');

  // ---------- Werbesprüche herausfiltern (Blog im Stil des gemeldeten Beispiels) ----------
  const blogFluff = `<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Recipe","name":"Ofenpfannkuchen – das einfachste Rezept",
  "description":"Das einfachste Rezept für Ofenpfannkuchen: super fluffig und in 5 Minuten vorbereitet!","recipeYield":["4","4 Portionen"],
  "recipeIngredient":["4 Eier","250 ml Milch","125 g Mehl*","1 Prise Salz","2 EL Butter (*Affiliate-Link)"],
  "recipeInstructions":[{"@type":"HowToStep","text":"Ofen auf 220 °C vorheizen."},{"@type":"HowToStep","text":"Alle Zutaten glatt rühren und in die heiße Form gießen."},{"@type":"HowToStep","text":"20 Minuten backen."},{"@type":"HowToStep","text":"Guten Appetit! 😊"}]}</script>`;
  d = I.toDraft({ kind: 'page', ...fn.extract(blogFluff, 'https://blog.example/ofen-pfannkuchen/') }).draft;
  ok(d.title === 'Ofenpfannkuchen', 'Werbung im Namen entfernt: ' + d.title);
  ok(d.notes === '', 'Werbebeschreibung nicht übernommen');
  ok(d.steps.length === 3 && !d.steps.some(x => /appetit/i.test(x)), '„Guten Appetit!“ aus den Schritten entfernt');
  ok(d.ingredients.join(' | ') === '4 Eier | 250 ml Milch | 125 g Mehl | 1 Prise Salz | 2 EL Butter', 'Sternchen und Affiliate-Hinweise aus Zutaten entfernt: ' + d.ingredients.join(' | '));
  const titles = [['Das einfachste Rezept: Ofenpfannkuchen', 'Ofenpfannkuchen'], ['Super leckere schnelle Pfannkuchen in 10 Minuten', 'Pfannkuchen'], ['Spaghetti Carbonara Rezept', 'Spaghetti Carbonara'], ['Der beste Käsekuchen der Welt', 'Käsekuchen'], ['Omas Apfelkuchen | Gaumenfreundin', 'Omas Apfelkuchen'], ['Einfacher Hefezopf – gelingsicher & fluffig', 'Hefezopf'], ['Schnelles Abendessen: Gnocchi-Pfanne mit Spinat', 'Gnocchi-Pfanne mit Spinat'], ['Pfannkuchen (Grundrezept)', 'Pfannkuchen'], ['Vegan: Linsen-Dal', 'Linsen-Dal'], ['Kartoffelsalat ohne Mayo', 'Kartoffelsalat ohne Mayo'], ['Hähnchenbrust in Zitronen-Sahne', 'Hähnchenbrust in Zitronen-Sahne']];
  const badT = titles.filter(([a, e]) => I.cleanTitle(a) !== e);
  ok(!badT.length, 'Titel bereinigt (' + titles.length + ' Fälle)' + (badT.length ? ': ' + badT.map(([a]) => a + ' → ' + I.cleanTitle(a)).join('; ') : ''));
  d = I.fromText('Die BESTEN Brownies ever 🤤\nZutaten:\n200g Schokolade\n150 g Butter\n3 Eier\nZubereitung:\n1. Schmelzen.\n2. 25 Minuten backen.\nLasst es euch schmecken! 💕\nFolge mir für mehr Rezepte');
  ok(d.title === 'Brownies' && d.steps.length === 2 && d.notes === '', 'TikTok-Text: Lob im Titel und Schlusssätze entfernt (' + d.title + ' / ' + d.steps.length + ' Schritte / Notizen: ' + JSON.stringify(d.notes) + ')');

  // ---------- Texterkennung: Aufräumen der erkannten Zeilen ----------
  global.document = { baseURI: 'http://x/' };
  require('../js/ocr.js');
  const O = window.RecipeOCR;
  const cleaned = O.cleanOcr('Fluffige Pancakes\n200g Mehl\n250 mi Milch\n200 9 Zucker\n1EL Öl\n1 Ei\nl TL Salz\n12,3K v Folgen\n@kochmitlea\nXS\n0 A6\nOriginalton - kochmitlea\n1234\nSchmelzen.');
  ok(cleaned === 'Fluffige Pancakes\n200g Mehl\n250 ml Milch\n200 g Zucker\n1EL Öl\n1 Ei\n1 TL Salz\nSchmelzen.', 'Erkannter Text: Verwechsler korrigiert (mi→ml, 9→g, l→1), App-Oberfläche und Reste entfernt, kurze Zutaten bleiben: ' + JSON.stringify(cleaned));

  // ---------- Links prüfen (nachgebaute Antworten, kein Netz) ----------
  const fake = map => async (url) => {
    const k = Object.keys(map).find(x => url.startsWith(x));
    const r = map[k];
    if (r instanceof Error) throw r;
    return r || { status: 500, url, text: '' };
  };
  const oe = 'https://www.tiktok.com/oembed?url=';
  const answers = fake({
    [oe + encodeURIComponent('https://www.tiktok.com/@a/video/1')]: { status: 200, text: '{"title":"Pasta","html":"<blockquote>"}' },
    [oe + encodeURIComponent('https://www.tiktok.com/@a/video/2')]: { status: 400, text: '{"code":400,"message":"Something went wrong"}' },
    [oe + encodeURIComponent('https://www.tiktok.com/@a/video/3')]: { status: 429, text: '' },
    'https://seite.example/rezept-da': { status: 200, url: 'https://seite.example/rezept-da', text: '<html>' },
    'https://seite.example/rezept-weg': { status: 404, url: 'https://seite.example/rezept-weg', text: '' },
    'https://seite.example/umgeleitet': { status: 200, url: 'https://seite.example/', text: '<html>' },
    'https://gesperrt.example/x': { status: 403, url: 'https://gesperrt.example/x', text: '' },
    'https://langsam.example/x': new Error('AbortError')
  });
  const res = await fn.checkMany(['https://www.tiktok.com/@a/video/1', 'https://www.tiktok.com/@a/video/2', 'https://www.tiktok.com/@a/video/3', 'https://seite.example/rezept-da', 'https://seite.example/rezept-weg', 'https://seite.example/umgeleitet', 'https://gesperrt.example/x', 'https://langsam.example/x', 'http://localhost/x'], answers);
  ok(res['https://www.tiktok.com/@a/video/1'] === 'ok' && res['https://www.tiktok.com/@a/video/2'] === 'gone', 'TikTok: vorhandenes ok, gelöschtes/privates „gone“');
  ok(res['https://www.tiktok.com/@a/video/3'] === 'unknown', 'TikTok überlastet (429): unklar, wird nicht entfernt');
  ok(res['https://seite.example/rezept-da'] === 'ok' && res['https://seite.example/rezept-weg'] === 'gone' && res['https://seite.example/umgeleitet'] === 'gone', 'Seiten: vorhanden ok, 404 und Umleitung auf Startseite „gone“');
  ok(res['https://gesperrt.example/x'] === 'unknown' && res['https://langsam.example/x'] === 'unknown' && res['http://localhost/x'] === 'unknown', 'Gesperrt, Zeitüberschreitung, interne Adresse: unklar');

  if (fail) { console.log(fail + ' Fehler'); process.exit(1); } else console.log('Alle Import-Prüfungen ok');
})();
