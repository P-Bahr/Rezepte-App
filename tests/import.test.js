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
  ok(d.mainIngredient === 'Nudeln' && !d.notes.includes('@koch'), 'TikTok: Hauptzutat Nudeln, kein Konto-Hinweis in den Notizen');

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

  // ---------- TikTok-Kurzlinks ----------
  const ttAnswers = {
    'https://vm.tiktok.com/ZGdXpYwVd/': { status: 200, url: 'https://www.tiktok.com/@koch.max/video/7312345678901234567?_r=1&lang=de', text: '' },
    'https://vm.tiktok.com/ZZseite/': { status: 200, url: 'https://www.tiktok.com/', text: '<a href="https:\/\/www.tiktok.com\/@oma\/video\/7111111111111111111">' },
    'https://vm.tiktok.com/kaputt/': { status: 404, url: 'https://vm.tiktok.com/kaputt/', text: '' },
    ['https://www.tiktok.com/oembed?url=' + encodeURIComponent('https://www.tiktok.com/@koch.max/video/7312345678901234567')]: { status: 200, text: '{"title":"Rezept"}' }
  };
  const ttGet = async u => { const a = ttAnswers[u]; if (!a) throw new Error('unerwartet ' + u); return { url: u, ...a }; };
  ok(await fn.tiktokResolve('https://vm.tiktok.com/ZGdXpYwVd/', ttGet) === 'https://www.tiktok.com/@koch.max/video/7312345678901234567', 'TikTok-Kurzlink wird zum langen Link aufgelöst (ohne Zusätze)');
  ok(await fn.tiktokResolve('https://vm.tiktok.com/ZZseite/', ttGet) === 'https://www.tiktok.com/@oma/video/7111111111111111111', 'TikTok-Kurzlink: langer Link aus der Seite');
  ok(await fn.tiktokResolve('https://www.tiktok.com/@a/video/123?x=1', ttGet) === 'https://www.tiktok.com/@a/video/123', 'Langer TikTok-Link bleibt (ohne Zusätze)');
  ok(await fn.checkOne('https://vm.tiktok.com/ZGdXpYwVd/', ttGet) === 'ok', 'Link-Prüfung: Kurzlink eines vorhandenen Videos ist „ok“');
  ok(await fn.checkOne('https://vm.tiktok.com/kaputt/', ttGet) === 'unknown', 'Link-Prüfung: nicht auflösbarer Kurzlink wird nicht entfernt');

  // TikTok-Seite im neuen Format (oEmbed ohne Beschreibung)
  const ttPage = require('fs').readFileSync(__dirname + '/fixtures/tiktok-seite.html', 'utf8');
  let tp = fn.tiktokFromHtml(ttPage);
  ok(/^Granola selbst gemacht/.test(tp.desc) && tp.author === 'test.koch' && tp.image === 'https://p16.example/cover.jpg', 'TikTok-Seite: Beschreibung, Konto und Bild aus den Seitendaten');
  tp = fn.tiktokFromHtml('<script>{"x":{"desc":"8215 Likes, 3 Kommentare"},"y":{"desc":"Pizza Zutaten: 500 g Mehl, 1 Würfel Hefe"}}</script>');
  ok(tp.desc === 'Pizza Zutaten: 500 g Mehl, 1 Würfel Hefe', 'TikTok-Seite: Notlösung per Suche, „Likes“-Zeile übersprungen');
  d = I.toDraft({ kind: 'tiktok', url: 'u', text: fn.tiktokFromHtml(ttPage).desc, author: 'test.koch' }).draft;
  ok(d.ingredients.length === 3 && d.steps.length === 1, 'TikTok neues Format: Zutaten und Schritt erkannt (' + d.ingredients.join(' | ') + ')');

  d = I.toDraft({ kind: 'tiktok', url: 'u', text: 'Brezeln auf ein Backblech legen, Schokolade darauf verteilen und kurz bei 70 °C in den Ofen geben. Danach abkühlen lassen. #snack' }).draft;
  ok(!d.ingredients.length && d.steps.length >= 1 && /Brezeln auf ein Backblech legen/.test(d.steps[0]), 'TikTok nur mit Schritten: Schritte übernommen statt Fehlermeldung');

  d = I.fromText('Kuchen\nZutaten:\n200 g Mehl\nHaltbarkeit:\n' + 'Luftdicht verschlossen hält er sich lange. '.repeat(20) + 'Ende der Haltbarkeit.');
  ok(/Ende der Haltbarkeit\.$/.test(d.notes), 'Lange Notizen (z. B. Haltbarkeit) werden vollständig übernommen');

  // ---------- Facebook ----------
  const fbHtml = '<meta property="og:title" content="Cremige Nudeln 🍝\nTeil 5 | Kinderrezepte\nAnzeige - eigene Gewürze\n\nZutaten\n\n✳️1 Zwiebel\n✳️1–2 Kohlrabi (ich hatte einen großen)\n✳️4 Karotten\n✳️etwas Öl\n✳️200 ml Sahne\n✳️etwas Salz\n\nZubereitung\n\nZuerst nehmen wir uns eine Zwiebel und schneiden sie klein.\n\nZum Schluss nur noch anrichten und genießen! 😋\n\n#nudeln #kinderrezepte | Testküche | Facebook"><meta property="og:description" content="Cremige Nudeln...">';
  const fbr = fn.facebookFromHtml(fbHtml);
  ok(fn.isFacebook('www.facebook.com') && fn.isFacebook('m.facebook.com') && !fn.isFacebook('facebook.com.example'), 'Facebook-Adressen erkannt');
  ok(fbr.author === 'Testküche' && !/Facebook$/.test(fbr.text) && /Zutaten/.test(fbr.text), 'Facebook: ganzer Beitragstext, „| Seite | Facebook“ entfernt');
  d = I.toDraft({ kind: 'social', url: 'u', text: fbr.text }).draft;
  ok(d.title === 'Cremige Nudeln', 'Facebook: Name ohne „Teil 5 | Kinderrezepte“: ' + d.title);
  ok(JSON.stringify(d.ingredients) === JSON.stringify(['1 Zwiebel', '1–2 Kohlrabi', '4 Karotten', 'etwas Öl', '200 ml Sahne', 'etwas Salz']), 'Facebook: Zutaten einzeln, „(ich hatte …)“ entfernt: ' + JSON.stringify(d.ingredients));
  ok(d.mainIngredient !== 'Kinderrezepte' && !/Kinderrezepte|Anzeige/.test(d.notes), 'Facebook: keine Kategorie als Hauptzutat, keine Werbung in den Notizen');
  ok(d.steps[0] === 'Zwiebel klein schneiden.' && d.steps[1] === 'Anrichten.', 'Schritte gestrafft: „Zuerst nehmen wir …“, „nur noch“, „und genießen“ entfernt: ' + JSON.stringify(d.steps));
  // Erzählstil -> kurze Anweisung (Beispiele aus einem echten Facebook-Rezept)
  const kurz = [
    ['Zuerst nehmen wir uns eine Zwiebel, schälen und schneiden sie klein.', 'Zwiebel schälen und klein schneiden.'],
    ['Nun nehmen wir uns eine Pfanne, geben etwas Öl und einen Klecks Butter hinein und schwitzen die Zwiebeln darin an.', 'Etwas Öl und einen Klecks Butter in die Pfanne geben und die Zwiebeln darin anschwitzen.'],
    ['Wenn das Gemüse schön angeschwitzt ist, füllen wir alles mit Gemüsebrühe auf.', 'Wenn das Gemüse angeschwitzt ist, alles mit Gemüsebrühe auffüllen.'],
    ['Das Gemüse stellen wir zunächst beiseite.', 'Gemüse beiseitestellen.'],
    ['Die vier Karotten schälen und schneiden sie auch in kleine Stücke.', 'Die vier Karotten schälen und in kleine Stücke schneiden.'],
    ['Jetzt geben wir die Nudeln direkt in die Pfanne und fügen 200 ml Sahne hinzu.', 'Nudeln in die Pfanne geben und 200 ml Sahne hinzufügen.'],
    ['Die Pfanne mit einem Deckel verschließen und das Ganze bei mittlerer Hitze köcheln lassen.', 'Die Pfanne mit einem Deckel verschließen und bei mittlerer Hitze köcheln lassen.'],
    ['Mehl, Eier und Milch zu einem glatten Teig verrühren.', 'Mehl, Eier und Milch zu einem glatten Teig verrühren.'],
    ['Wir lassen den Teig 30 Minuten ruhen.', 'Teig 30 Minuten ruhen lassen.'],
    ['Ich gebe dann noch etwas Pfeffer dazu.', 'Noch etwas Pfeffer dazugeben.'],
    ['Danach nehmen wir uns eine Schüssel und vermischen Mehl und Backpulver.', 'In einer Schüssel Mehl und Backpulver vermischen.'],
    ['Jetzt verrühren wir Eier, Zucker und Butter schön schaumig.', 'Eier, Zucker und Butter schaumig verrühren.'],
    ['Als Erstes heizen wir den Ofen auf 180 Grad vor.', 'Ofen auf 180 Grad vorheizen.']
  ];
  for (const [a, b] of kurz) {
    const got = I.fromText('Test\nZutaten:\n1 Ei\n2 EL Mehl\nZubereitung:\n' + a).steps.join(' ');
    ok(got === b, 'Kürzen: „' + a.slice(0, 40) + '…“ -> ' + got);
  }

  // Hauptzutat: Rezeptname hat Vorrang vor der Menge
  for (const [t, ing, want] of [
    ['Cremige Kohlrabi-Karotten-Nudeln', ['1 Zwiebel', '1–2 Kohlrabi', '4 Karotten', '360 g Nudeln nach Wahl', '200 ml Sahne'], 'Nudeln'],
    ['Hähnchen mit Reis', ['500 g Hähnchenbrustfilet', '250 g Reis'], 'Hähnchen'],
    ['Lachs auf Spinat', ['2 Lachsfilets', '500 g Blattspinat'], 'Lachs'],
    ['Kartoffelplätzchen', ['1 kg Kartoffeln', '3 Eigelb'], 'Kartoffeln']
  ]) ok(I.guessMain(ing, t) === want, 'Hauptzutat aus dem Namen: ' + t + ' -> ' + I.guessMain(ing, t));

  // Microdata (wie bei Kaufland) statt JSON-LD
  const md = '<div itemscope itemtype="http://schema.org/Recipe"><h1 itemprop="name" content="Caipirinha-Bowle mit Melonen">Caipirinha-Bowle</h1><span itemprop="recipeYield" content="10 Gläser"></span>'
    + '<span itemprop="recipeIngredient" content="4 unbehandelte Limetten"></span><span itemprop="recipeIngredient" content="1 Flasche gut gekühlter Sekt (= 750 ml)"></span><span itemprop="recipeIngredient" content="100 g brauner Zucker"></span>'
    + '<span itemprop="recipeInstructions" content="1. Melone halbieren und würfeln. Limetten vierteln."></span><span itemprop="recipeInstructions" content="2. Mit Sekt aufgießen."></span></div><p>Grill-Rezepte Pizza-Rezepte</p>';
  d = I.toDraft({ kind: 'page', ...fn.extract(md, 'https://filiale.kaufland.de/x') }).draft;
  ok(d.title === 'Caipirinha-Bowle mit Melonen' && d.ingredients.length === 3 && d.steps.length === 3 && d.servings === 10, 'Microdata (Kaufland): Name, 3 Zutaten, 3 Schritte, 10 Gläser');
  ok(d.course === 'Getränk' && d.method === 'Kalt zubereitet', 'Bowle ist ein Getränk, kalt zubereitet (nicht Hauptgericht/Grillen)');
  // Schritte in Python-Schreibweise (wie bei mombanana.com)
  const py = '<script type="application/ld+json">{"@type":"Recipe","name":"Eintopf mit Kartoffeln & Rinderwürstchen","recipeIngredient":["450 g Kartoffeln","4 Rinderwürstchen","3 Möhren"],"recipeInstructions":["{\'@type\': \'HowToStep\', \'name\': \'Vorbereitung\', \'text\': \'Kartoffeln schälen. Würstchen in Scheiben schneiden.\'}","{\'@type\': \'HowToStep\', \'name\': \'Kochen\', \'text\': \'Alles 20 Minuten köcheln lassen.\'}"]}</script>';
  d = I.toDraft({ kind: 'page', ...fn.extract(py, 'https://mombanana.com/x') }).draft;
  ok(JSON.stringify(d.steps) === JSON.stringify(['Kartoffeln schälen.', 'Würstchen in Scheiben schneiden.', 'Alles 20 Minuten köcheln lassen.']), 'Kaputte Schritte ({\'@type\': …}) werden sauber gelesen: ' + JSON.stringify(d.steps));
  ok(d.mainIngredient === 'Kartoffeln', 'Hauptzutat: zuerst genannte Zutat nach „mit“ (' + d.mainIngredient + ')');

  // Packungsgröße beim Speichern in Klammern hinter die Packung
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  require('../js/collections.js'); require('../js/store.js');
  for (const [a, b] of [['1 Flasche gut gekühlter Sekt (= 750 ml)', '1 Flasche (750 ml) gut gekühlter Sekt'], ['1 Dose 400 g Tomaten', '1 Dose (400 g) Tomaten'], ['2 Dosen Kokosmilch (à 400 ml)', '2 Dosen (je 400 ml) Kokosmilch'], ['1 Bund Petersilie (ca. 30 g)', '1 Bund (ca. 30 g) Petersilie'], ['250 g dicke Bohnen (Dose)', '250 g dicke Bohnen (Dose)']]) {
    const got = window.Store.saveRecipe({ title: 'T', ingredients: [a], steps: ['x'] }).ingredients[0];
    ok(got === b, 'Packungsgröße: „' + a + '“ -> „' + got + '“');
  }

  // Vanillekipferl: "nach Omas bestem Rezept" weg, "96 Vanillekipferl" = Stück (nicht Personen), Gebäck
  for (const [a, b] of [['Vanillekipferl nach Omas bestem Rezept', 'Vanillekipferl'], ['Apfelkuchen wie bei Oma', 'Apfelkuchen'], ['Rinderrouladen nach Mamas Art', 'Rinderrouladen'], ['Schnitzel nach Wiener Art', 'Schnitzel nach Wiener Art'], ['Kartoffelwaffeln für Kinder und Familie', 'Kartoffelwaffeln'], ['Gemüsenudeln für die ganze Familie', 'Gemüsenudeln'], ['Brokkoli-Muffins (kindgerecht)', 'Brokkoli-Muffins'], ['Pizzaschnecken für Kids', 'Pizzaschnecken'], ['Kinder-Pizza', 'Kinder-Pizza'], ['Kinder Nudelsalat mit Frischkäse', 'Nudelsalat mit Frischkäse'], ['Kräuterbutter selber machen', 'Kräuterbutter'], ['Reis mit Gemüse und Frischkäsesauce einfach zubereiten', 'Reis mit Gemüse und Frischkäsesauce'], ['Brot selbst backen', 'Brot'], ['Hähnchen für Groß und Klein', 'Hähnchen']])
    ok(I.cleanTitle(a) === b, 'Name: „' + a + '“ -> „' + I.cleanTitle(a) + '“');
  let yv = I.servingsFrom(['96', '96 Vanillekipferl'], 'Vanillekipferl');
  ok(yv.servings === 96 && yv.servingsUnit === 'Stück', 'Ergibt „96 Vanillekipferl“ -> 96 Stück');
  ok(I.servingsFrom(['4 Portionen'], 'x').servingsUnit === 'Personen' && I.servingsFrom(['4'], 'x').servingsUnit === 'Personen', '„4 Portionen“ und „4“ bleiben Personen');
  ok(I.guessCourse('Vanillekipferl', ['Nachspeise'], []) === 'Gebäck', 'Kipferl sind Gebäck, auch wenn die Seite „Nachspeise“ sagt');
  // Doppelpunkte hinter Zutaten
  for (const [a, b] of [['Reis: 200 g', '200 g Reis'], ['200 g Reis:', '200 g Reis'], ['Frischkäse: 150 g', '150 g Frischkäse'], ['100 g Käse ((gerieben))', '100 g Käse (gerieben)'], ['1 Ei (Größe M) (verquirlt)', '1 Ei (Größe M, verquirlt)'], ['1 Dose Mais (285 g) (abgetropft)', '1 Dose (285 g) Mais (abgetropft)'], ['750 ml Sekt (= )', '750 ml Sekt']]) {
    const got = window.Store.saveRecipe({ title: 'T', ingredients: [a], steps: ['x'] }).ingredients[0];
    ok(got === b, 'Aufgeräumt: „' + a + '“ -> „' + got + '“');
  }

  for (const [v, want] of [['Minuten', ''], ['1050', ''], ['63 g', ''], ['Kartoffeln', 'Kartoffeln'], ['Rote Linsen', 'Rote Linsen'], ['Kinderrezepte', '']])
    ok(I.validMain(v) === want, 'Hauptzutat gültig? „' + v + '“ -> „' + I.validMain(v) + '“');

  // Seite ohne Rezeptangaben (wie leckeregerichte.com): Tippfehler-Zwischenüberschrift, Werbung mitten drin, Fußbereich
  const plainPage = '<html><head><title>Besser als vom Bäcker, Streuseltaler unfassbar lecker!</title></head><body><a>Skip to content</a><h1>Besser als vom Bäcker, Streuseltaler unfassbar lecker!</h1>'
    + '<p>Zutaten:</p><p>300 g Mehl</p><p>1 Pck. Trockenhefe</p><p>Fur die Streusel:</p><p>250 g Butter, kalte</p><p>250 g Zucker</p><p>Zubereitung:</p>'
    + '<p>1. Mehl mit der Trockenhefe verrühren.</p><p>2. 20 Minuten gehen lassen.</p><p>Probieren Sie auch:</p><p>Nehmen Sie 1 Apfel, 400 g Blätterteig und bereiten Sie dieses Dessert!</p>'
    + '<p>3. Streusel auf dem Teig verteilen.</p><p>4. 20 Minuten bei 180 °C backen.</p><p>Mit Familie und Freunden teilen</p><p>ÜBER UNS Willkommen bei …</p><p>Kürzliche Posts</p></body></html>';
  d = I.toDraft({ kind: 'page', ...fn.extract(plainPage, 'https://leckeregerichte.com/x') }).draft;
  ok(d.title === 'Streuseltaler', 'Name ohne „Besser als vom Bäcker“ und „unfassbar lecker“: ' + d.title);
  ok(d.ingredients.length === 4 && d.ingredients.includes('250 g Zucker'), '„Fur die Streusel:“ ist eine Zwischenüberschrift, Zutaten danach bleiben: ' + d.ingredients.join(' | '));
  ok(d.steps.length === 4 && /backen/.test(d.steps[3]) && !d.steps.some(x => /Apfel|ÜBER UNS|Posts/i.test(x)), 'Werbung und Seitenende nicht in den Schritten: ' + JSON.stringify(d.steps));
  ok(d.course === 'Gebäck' && d.method === 'Backen' && !d.notes, 'Gebäck, Backen, keine Notizen wie „Skip to content“');

  // Dinkelwaffeln: Hauptzutat aus dem Namen (auch Grundzutat wie Dinkelmehl), nie eine Gewürzmenge; Waffeleisen = Backen
  const waffelIng = ['125 g Dinkelmehl', '½ TL Backpulver', '1 Ei', '175 ml fettarme Milch', '¼ TL Vanilleextrakt', '30 ml Kokosöl', '½ TL Orangen- oder Zitronenschale'];
  ok(I.guessMain(waffelIng, 'Gesunde Dinkelwaffeln') === 'Dinkelmehl', 'Dinkelwaffeln -> Hauptzutat Dinkelmehl (' + I.guessMain(waffelIng, 'Gesunde Dinkelwaffeln') + ')');
  ok(I.guessMain(['1 TL Zimt', '½ TL Zitronenschale'], 'Gewürzmischung') === '', 'Nur Gewürzmengen -> keine Hauptzutat');
  ok(I.guessMethod(['Teig ins heiße Waffeleisen geben.'], 'Waffeln') === 'Backen', 'Waffeleisen = Backen');

  ok(I.guessCourse('Nudelsalat mit Frischkäse', [], []) === 'Salat', '„Nudelsalat“ ist ein Salat');
  d = I.fromText('Nudelsalat\nZutaten:\n250 g Nudeln\n1 Gurke\nZubereitung:\nNudeln kochen und abkühlen lassen.');
  ok(d.course === 'Salat' && d.method === 'Kalt zubereitet', 'Nudelsalat: Salat, kalt (nicht Topf), obwohl Nudeln gekocht werden');
  for (const [a, b] of [['1/2 Tasse gewürfelte Gurke', '½ Tasse gewürfelte Gurke'], ['1 1/2 TL Salz', '1½ TL Salz'], ['3/4 l Milch', '¾ l Milch']]) {
    const got = window.Store.saveRecipe({ title: 'T', ingredients: [a], steps: ['x'] }).ingredients[0];
    ok(got === b, 'Bruch als Zeichen: „' + a + '“ -> „' + got + '“');
  }

  ok(I.guessCourse('Kräuterbutter', [], []) === 'Sauce & Dip' && I.guessMain(['1 kg Butter', '200 g gehackte Kräuter', '2 TL Salz'], 'Kräuterbutter') === 'Butter', 'Kräuterbutter: Sauce & Dip, Hauptzutat Butter');

  // Amerikanische Maße: deutsches Rezept umrechnen, englisches mit Klammer
  ok(JSON.stringify(I.convertUnits(['250 g kurze Pasta', '½ Tasse gewürfelte Gurke', '1 Tasse Milch', '1 ½ Tassen Mehl'])) === JSON.stringify(['250 g kurze Pasta', '75 g gewürfelte Gurke', '240 ml Milch', '190 g Mehl']), 'Deutsches Rezept: Tassen gleich in g/ml: ' + I.convertUnits(['½ Tasse gewürfelte Gurke', '1 Tasse Milch', '1 ½ Tassen Mehl']).join(' | '));
  ok(JSON.stringify(I.convertUnits(['1 cup flour', '1/2 cup milk', '8 oz cream cheese', '2 large eggs'])) === JSON.stringify(['125 g flour', '120 ml milk', '225 g cream cheese', '2 large eggs']), 'Englisches Rezept: direkt umgerechnet, ohne fremde Angabe');
  // Doppelte Angaben (wie im Recipe-Keeper-Export) und früher gespeicherte Umrechnungen
  const dual = I.convertUnits(['1/4 Tasse / 50g Butter, geschmolzen', '20 oz./600g Frischkäse', '3/4 Tasse / 175g Zucker Zucker', '2 Esslöffel Allzweckmehl', '1lb Pflaumentomaten', '37 g / 50 g Butter', '1 cup flour (ca. 125 g)', '1 1/4 Tassen Graham Cracker Krümel']);
  ok(JSON.stringify(I.convertUnits(['1 Spr Lebensmittelfarbe', '2 Bd. Petersilie', '1 TL gestr. Salz', '3 Tr. Zitronenöl'])) === JSON.stringify(['1 Spritzer Lebensmittelfarbe', '2 Bund Petersilie', '1 TL gestrichen Salz', '3 Tropfen Zitronenöl']), 'Abkürzungen ausgeschrieben (Spr -> Spritzer, Bd. -> Bund …)');
  ok(JSON.stringify(dual) === JSON.stringify(['50 g Butter, geschmolzen', '600 g Frischkäse', '175 g Zucker', '2 EL Mehl (Type 405)', '450 g Pflaumentomaten', '50 g Butter', '125 g flour', '125 g Graham Cracker Krümel']), 'Nur metrische Angabe bleibt, Rest direkt umgerechnet: ' + dual.join(' | '));
  // Prüf-Hinweise
  let hs = I.reviewHints({ title: 'Nudelsalat', ingredients: ['250 g Nudeln', 'Gurke', 'Salz', '300 g Mehl', '250 g Mehl'], steps: ['Alles mischen.'], mainIngredient: '', servings: 4, servingsUnit: 'Personen', importInfo: { how: 'text', servingsGuessed: true, courseGuessed: true }, course: 'Hauptgericht' });
  ok(hs.some(x => /Seitentext/.test(x)) && hs.some(x => /Ohne Mengenangabe: Gurke\./.test(x)) && hs.some(x => /doppelt: Mehl/.test(x)) && !hs.some(x => /Personen/.test(x)) && hs.some(x => /Rezeptart nur geraten/.test(x)) && hs.some(x => /Keine Hauptzutat/.test(x)), 'Prüf-Hinweise sagen genau, worauf zu achten ist: ' + hs.join(' / '));
  ok(I.reviewHints({ title: 'Linsensuppe', ingredients: ['250 g Linsen', '1 Zwiebel', '1 l Brühe'], steps: ['Kochen.'], mainIngredient: 'Linsen', servings: 4 }).length === 0, 'Vollständiges Rezept: keine Hinweise');

  // Hühnereier sind kein Hähnchen; Werbung und "Gewürze:" in Zutaten
  ok(I.guessMain(['150 g Vollkorn-Sandwich-Toast', '4 Hühnereier', '100 g Eiklar', '60 g Gouda'], 'Sandwich') !== 'Hähnchen' && I.guessCourse('Sandwich', [], []) === 'Snack', 'Hühnereier -> nicht Hähnchen; Sandwich ist ein Snack');
  for (const [a, b] of [['4 Eier Hühnereier', '4 Hühnereier'], ['Gewürze Salz, Pfeffer und z. B. etwas Knobilicious @morenutrition.de oder Gewürze nach Wahl', 'Salz, Pfeffer und Gewürze nach Wahl']]) {
    const got = window.Store.saveRecipe({ title: 'T', ingredients: [a], steps: ['x'] }).ingredients[0];
    ok(got === b, 'Aufgeräumt: „' + a.slice(0, 40) + '“ -> „' + got + '“');
  }

  // Bildschirmfoto eines Beitrags (echter Text nach der Texterkennung): Einleitung mit Zahlen vor "Zutaten"
  const ocr2 = ['Schmeckt wie Milchschnitte, nur als Bowl für', 'dich allein: unten saftiger Schoko-Biskuit,', 'oben kühle Milchcreme mit einem Hauch', 'Honig. 12 Minuten backen, kurz kalt stellen,', 'fertig: 335 kcal und 29 g Eiweiß die ganze', 'Bowl statt 470 für vier Milchschnitten!',
    'Zutaten (1 Portion, Glasform 15 x 10 cm):', '1 Stück Ei', '10 g Backkakao', '15 g Dinkelmehl', '½ TL Backpulver', 'etwas Vanille', "So geht's:",
    '1. Ei, Kakao, Mehl und das', 'Backpulver glatt rühren und 12 Minuten backen.', '2. Den Schoko-Biskuit vollständig abkühlen', 'lassen.'].join('\n');
  d = I.fromText(ocr2, { ocr: true });
  ok(d.title === 'Milchschnitte-Bowl', 'Foto: Name aus „Schmeckt wie Milchschnitte, nur als Bowl“: ' + d.title);
  ok(d.ingredients.length === 5 && d.ingredients[0] === '1 Stück Ei' && d.servings === 1, 'Foto: Einleitung („12 Minuten“, „335 kcal“) keine Zutaten, 1 Portion: ' + d.ingredients.join(' | '));
  ok(d.steps[d.steps.length - 1] === 'Den Schoko-Biskuit vollständig abkühlen lassen.', 'Foto: umbrochenes „lassen.“ gehört zum Schritt');
  global.document = global.document || { baseURI: 'http://x/' };
  require('../js/ocr.js');
  const cleaned2 = window.RecipeOCR.cleanOcr('< Fitmitkev - Abnehmen ohne Verzichts Beitr...\n‚1 Stück Ei\n. 10 g Backkakao\n.% TL Backpulver\n- etwas Vanille\nlassen.\nGlasform füllen und bei 180 Ober-/Unterhitze backen.\nkochen_mit_k');
  ok(cleaned2 === '1 Stück Ei\n10 g Backkakao\n½ TL Backpulver\netwas Vanille\nlassen.\nGlasform füllen und bei 180 °C Ober-/Unterhitze backen.', 'Texterkennung aufgeräumt: Kopfzeile, Aufzählungszeichen, ½, °C, kurze Wörter: ' + JSON.stringify(cleaned2));

  // Bring!-Seite: Rezeptangaben (schema.org) aus den Daten im Link, alles maskiert
  const bringData = Buffer.from(JSON.stringify({ t: 'Suppe <script>', i: ['200 g Mehl', '2 "Eier"'] })).toString('base64url');
  const bp = fn.bringPage(bringData);
  ok(bp && bp.includes('"recipeIngredient":["200 g Mehl","2 \\"Eier\\""]') && !bp.includes('<script>') && bp.includes('Suppe &lt;script&gt;'), 'Bring!-Seite: Zutaten als Rezeptangaben, nichts Ausführbares');
  ok(fn.bringPage('kaputt!!') === null && fn.bringPage(Buffer.from('{"t":"x","i":[]}').toString('base64url')) === null, 'Bring!-Seite: ungültige Daten -> nicht gefunden');

  // ---------- Pinterest ----------
  const pinAnswers = {
    'https://pin.it/abc': { status: 200, url: 'https://www.pinterest.de/pin/987654321/sent/?x=1', text: '<html></html>' },
    'https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=987654321': { status: 200, text: JSON.stringify({ data: [{ link: 'https://www.chefkoch.de/rezepte/1/kaese.html', description: 'Leckere Spätzle', images: { '736x': { url: 'https://i.pinimg.com/736x/a.jpg' } } }] }) },
    'https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=111': { status: 200, text: JSON.stringify({ data: [{ link: null, description: 'Bananenbrot Zutaten: 3 Bananen, 250 g Mehl, 2 Eier' }] }) },
    'https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=222': { status: 500, text: '' },
    'https://www.pinterest.com/pin/222/': { status: 200, text: '<meta property="og:description" content="Pfannkuchen"><script>{"link":"https://www.pinterest.com/x","b":{"link":"https:\/\/www.lecker.de\/pfannkuchen-123.html"}}</script>' }
  };
  const pinGet = async u => { const a = pinAnswers[u]; if (!a) throw new Error('unerwartet ' + u); return { url: u, ...a }; };
  ok(fn.isPinterest('www.pinterest.de') && fn.isPinterest('pin.it') && fn.isPinterest('pinterest.com') && !fn.isPinterest('notpinterest.example'), 'Pinterest-Adressen erkannt');
  let pin = await fn.pinterestInfo('https://pin.it/abc', pinGet);
  ok(pin.link === 'https://www.chefkoch.de/rezepte/1/kaese.html' && pin.pinUrl === 'https://www.pinterest.com/pin/987654321/' && pin.image.endsWith('a.jpg'), 'Pin-Kurzlink: Weiterleitung, Link zur Rezeptseite und Bild gefunden');
  pin = await fn.pinterestInfo('https://www.pinterest.com/pin/111/', pinGet);
  ok(!pin.link && /250 g Mehl/.test(pin.description), 'Pin ohne Link: Beschreibung übernommen');
  d = I.toDraft({ kind: 'pin', url: pin.pinUrl, text: pin.description, image: '' }).draft;
  ok(d.ingredients.length === 3, 'Pin ohne Link: Zutaten aus der Beschreibung');
  ok(I.toDraft({ kind: 'pin', url: 'x', text: 'Sieht toll aus' }).how === 'pin-empty', 'Pin ohne Rezept: Hinweis aufs Bildschirmfoto');
  pin = await fn.pinterestInfo('https://www.pinterest.com/pin/222/', pinGet);
  ok(pin.link === 'https://www.lecker.de/pfannkuchen-123.html', 'Pin-Schnittstelle gestört: Link aus der Pin-Seite, Pinterest-eigene Links übersprungen');

  // ---------- Bildschirmfoto (echter TikTok-Text nach der Texterkennung) ----------
  const ocrText = ['WASMEINE KINDER LIEBE', 'Teil 7 Kartoffelplätzchen', 'Kartoffelplätzchen nicht nur, weil sie die', 'mit den Fingern essen dürfen',
    'ZUTATEN für etwa 16 Plätzchen', '4 Portionen', '1 kg Kartoffeln, mehlig kochende', '3 Eigelb', '4 EL Speisestärke', '150 g Reibekäse',
    'Reichlich Knobi, fein gehackt, ohne', 'Keim/Strunk', 'Pfeffer, Salz und Muskat', 'Etwa 0,5 Bund Petersilie', 'Öl',
    'Kartoffeln weich kochen, durchpressen,', 'Eigelbe nacheinander mit Holzlöffel', 'unterheben, würzen, Knobi, Käse,', 'Petersilie verrühren, formen und von', 'beiden Seiten backen.'].join('\n');
  d = I.fromText(ocrText, { ocr: true });
  ok(d.title === 'Kartoffelplätzchen', 'Foto: Name aus „Teil 7 …“: ' + d.title);
  ok(d.servings === 4, 'Foto: „4 Portionen“ ist die Portionszahl, keine Zutat');
  ok(JSON.stringify(d.ingredients) === JSON.stringify(['1 kg Kartoffeln, mehlig kochende', '3 Eigelb', '4 EL Speisestärke', '150 g Reibekäse',
    'Reichlich Knobi, fein gehackt, ohne Keim/Strunk', 'Pfeffer, Salz und Muskat', '0,5 Bund Petersilie', 'Öl']), 'Foto: Zutaten richtig, umbrochene Zeile zusammengefügt: ' + JSON.stringify(d.ingredients));
  ok(JSON.stringify(d.steps) === JSON.stringify(['Kartoffeln weich kochen, durchpressen.', 'Eigelbe nacheinander mit Holzlöffel unterheben, würzen.', 'Knobi, Käse, Petersilie verrühren.', 'Formen und von beiden Seiten backen.']), 'Foto: Zubereitung ohne Überschrift erkannt und in Schritte geteilt: ' + JSON.stringify(d.steps));
  ok(!d.notes, 'Foto: Begleittext landet nicht in den Notizen');

  if (fail) { console.log(fail + ' Fehler'); process.exit(1); } else console.log('Alle Import-Prüfungen ok');
})();
