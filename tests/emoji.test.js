// Emojis, Schmuckschrift und unsichtbare Zeichen aus sozialen Netzwerken: node tests/emoji.test.js
global.window = {};
for (const f of ['search', 'scale', 'forms', 'importer']) require('../js/' + f + '.js');
const I = window.RecipeImporter;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER', m); } else console.log('ok  ', m); };
// Kein Bildzeichen darf übrig bleiben (Grad ° ist erlaubt)
const SYM = /[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200B\u200D\u20E3\u00AD\u2190-\u21FF\u2B00-\u2BFF\u{1D400}-\u{1D7FF}\uFF01-\uFF5E\u2460-\u24FF\u2776-\u2793]|(?!°)[\p{Extended_Pictographic}\p{So}]|\u0308/u;
const imp = text => I.toDraft({ kind: 'tiktok', url: 'u', text }).draft;
const clean = (d, name) => {
  const all = [d.title, ...d.ingredients, ...d.steps, d.notes || ''];
  const bad = all.filter(x => SYM.test(x));
  ok(!bad.length, name + ': keine Emojis/Sonderzeichen übrig ' + JSON.stringify(bad));
  ok(!all.some(x => /#\p{L}|@\p{L}|folg|link in bio|speicher/iu.test(x)), name + ': keine Hashtags, @Namen oder Werbesätze ' + JSON.stringify(all));
};
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ': ' + JSON.stringify(a));

let d = imp('𝗕𝗮𝗻𝗮𝗻𝗲𝗻𝗯𝗿𝗼𝘁 🍌\n\n𝗭𝘂𝘁𝗮𝘁𝗲𝗻:\n▪️3 reife Bananen\n▪️2 Eier\n▪️200 g Mehl\n\n𝗭𝘂𝗯𝗲𝗿𝗲𝗶𝘁𝘂𝗻𝗴:\n1️⃣ Bananen zerdrücken.\n2️⃣ Alles verrühren.\n3️⃣ Bei 180℃ 50 Min backen.\n\n#bananenbrot #backen @koch.mama');
ok(d.title === 'Bananenbrot', 'Fette Schmuckschrift im Namen: ' + d.title);
eq(d.ingredients, ['3 reife Bananen', '2 Eier', '200 g Mehl'], 'Fette Schmuckschrift: Zutaten mit ▪️');
ok(d.steps.length === 3 && /180 ?°C/.test(d.steps[2]), 'Schritte mit 1️⃣ 2️⃣ 3️⃣, ℃ wird °C: ' + JSON.stringify(d.steps));
clean(d, 'Schmuckschrift');

d = imp('Pasta in 10 Minuten 🇮🇹✨ Zutaten: ✨250 g Spaghetti ✨2 Knoblauchzehen ✨50 ml Olivenöl ✨1 Chili 🌶️ Zubereitung: 👉🏼 Spaghetti kochen. 👉🏼 Knoblauch im Öl anbraten. 👉🏼 Alles mischen. Folgt mir für mehr Rezepte 💕 Link in Bio');
ok(d.title === 'Pasta', 'Flagge, Funkeln, Hautfarbe: Name ' + d.title);
eq(d.ingredients, ['250 g Spaghetti', '2 Knoblauchzehen', '50 ml Olivenöl', '1 Chili'], 'Einzeilig mit ✨: Zutaten');
eq(d.steps, ['Spaghetti kochen.', 'Knoblauch im Öl anbraten.', 'Alles mischen.'], 'Einzeilig mit 👉🏼: Schritte');
clean(d, 'Einzeilig');

d = imp('Zitronenkuchen\nZutaten:\n- 2 🥚\n- 1 🍋 (Saft)\n- 100 g 🧈\n- 200 g Mehl 🌾\nZubereitung:\n➡️ Eier schlagen.\n➡️ Butter ❤️ schmelzen.');
eq(d.ingredients, ['2 Eier', '1 Zitrone (Saft)', '100 g Butter', '200 g Mehl'], 'Emoji statt Wort (2 🥚 -> 2 Eier), Emoji am Zeilenende weg');
eq(d.steps, ['Eier schlagen.', 'Butter schmelzen.'], 'Schritte mit ➡️, ❤️ mitten im Satz weg');
clean(d, 'Emoji als Wort');

d = imp('Käsetoast\nZutaten:\n200\u00A0g Ka\u0308se\n1\u200B Zwiebel\n2\u202FScheiben Toast\u00AD\nZubereitung:\nKa\u0308se reiben und auf den Toast legen.');
eq(d.ingredients, ['200 g Käse', '1 Zwiebel', '2 Scheiben Toast'], 'Unsichtbare Zeichen, geschütztes Leerzeichen, Umlaut aus zwei Zeichen');
ok(d.steps[0] === 'Käse reiben und auf den Toast legen.', 'Umlaut im Schritt: ' + d.steps[0]);
clean(d, 'Unsichtbar');

d = imp('Hackpfanne\nZutaten:\n• 500 g Hackfleisch\n• 1 Zwiebel\nSo geht\'s:\n① Zwiebel würfeln.\n② Hack anbraten.\n③ Würzen.');
eq(d.steps, ['Zwiebel würfeln.', 'Hack anbraten.', 'Würzen.'], 'Schritte mit ① ② ③');
clean(d, 'Kreiszahlen');

d = imp('Kartoffelsuppe\n━━━━━━━━\nZutaten\n-> 1 kg Kartoffeln\n-> 1 l Brühe\n━━━━━━━━\nZubereitung\n=> Kartoffeln kochen.\n=> Pürieren.\n⬇️ Rezept speichern ⬇️');
eq(d.ingredients, ['1 kg Kartoffeln', '1 l Brühe'], 'Trennlinien ━━━ und Pfeile -> als Aufzählung');
eq(d.steps, ['Kartoffeln kochen.', 'Pürieren.'], 'Pfeile => als Aufzählung, „Rezept speichern“ weg');
clean(d, 'Trennlinien');

d = imp('Ｐｆａｎｎｋｕｃｈｅｎ\nＺｕｔａｔｅｎ：\n２５０ｇ Ｍｅｈｌ\n３ Ｅｉｅｒ\nＺｕｂｅｒｅｉｔｕｎｇ：\nＡｌｌｅｓ verrühren.');
ok(d.title === 'Pfannkuchen', 'Breite Schrift im Namen: ' + d.title);
eq(d.ingredients, ['250 g Mehl', '3 Eier'], 'Breite Schrift: Zutaten');
clean(d, 'Breite Schrift');

d = imp('𝓢𝓬𝓱𝓸𝓴𝓸𝓶𝓾𝓯𝓯𝓲𝓷𝓼 🧁\n𝒁𝒖𝒕𝒂𝒕𝒆𝒏:\n⭐ 1⁄2 TL Salz\n⭐ 100 g Zucker\n𝒁𝒖𝒃𝒆𝒓𝒆𝒊𝒕𝒖𝒏𝒈:\n✔️ Alles mischen.\n✔️ In einer Form ⌀ 26 cm backen.');
ok(d.title === 'Schokomuffins', 'Schreibschrift im Namen: ' + d.title);
ok(d.ingredients.length === 2 && /^(½|1\/2) TL Salz$/.test(d.ingredients[0]), 'Bruchstrich ⁄ und ⭐: ' + JSON.stringify(d.ingredients));
ok(/Ø 26 cm/.test(d.steps[1]), '⌀ wird Ø: ' + d.steps[1]);
clean(d, 'Schreibschrift');

d = imp('Rezept unten 👇👇\nWaffeln 🧇\nZutaten 🛒\n🔸 250 g Mehl\n🔸 2 Eier\nZubereitung 👩‍🍳\n🔹 Alles verrühren.\n🔹 Im Waffeleisen backen.\nKommentiert, wie ihr sie esst! 💬 Teilt das Video mit euren Liebsten');
ok(d.title === 'Waffeln', '„Rezept unten 👇“ ist nicht der Name: ' + d.title);
eq(d.ingredients, ['250 g Mehl', '2 Eier'], 'Überschrift mit 🛒, Aufzählung 🔸');
eq(d.steps, ['Alles verrühren.', 'Im Waffeleisen backen.'], 'Überschrift mit 👩‍🍳 (zusammengesetztes Emoji), Aufrufe am Ende weg');
clean(d, 'Aufrufe');

ok(I.cleanTitle('Thermomix® Brot™ 🍞') === 'Thermomix Brot', '® ™ im Namen weg: ' + I.cleanTitle('Thermomix® Brot™ 🍞'));
ok(I.socialText('𝘂̲𝗻̶𝘁̶𝗲̶𝗿̶') === 'unter', 'Unter-/Durchstreichen per Zeichen weg: ' + I.socialText('𝘂̲𝗻̶𝘁̶𝗲̶𝗿̶'));

// Aus deinen echten Rezepten (Sicherung vom 21.11.)
for (const [t, want] of [['Hackfleisch-Käse-Lauch Brötchen Teil 12', 'Hackfleisch-Käse-Lauch Brötchen'], ['Kartoffelwaffeln (Teil 3/5)', 'Kartoffelwaffeln']])
  ok(I.cleanTitle(t) === want, 'Serien-Zusatz aus dem Namen: ' + I.cleanTitle(t));
// Echter Facebook-Beitrag (21.11.): Schmuckschrift, „So geht‘s“ mit gebogenem Apostroph, Nährwerte, Fußnote, viel Gerede
{
  const fb = imp(require('fs').readFileSync(__dirname + '/fixtures/fb-plaetzchen.txt', 'utf8'));
  ok(fb.title === 'Plätzchen-Teig' && fb.servings === 3 && fb.servingsUnit === 'Blech', 'Facebook: Name normal geschrieben, 3 Bleche: ' + fb.title + ' ' + fb.servings + ' ' + fb.servingsUnit);
  eq(fb.ingredients, ['2 Eier (M)', '500 g Mehl', '200 g Zucker', '250 g Butter, weich, fettarm', '1 Pack Vanillezucker'], 'Facebook: Zutaten ohne Nährwerte, Fußnote und „(3 volle Bleche)“');
  ok(fb.steps.length === 4 && /^Alle Zutaten/.test(fb.steps[0]) && /mürbe\.$/.test(fb.steps[3]), 'Facebook: „So geht‘s“ erkannt, 4 Schritte ohne „Ein Traum!“/„Unbedingt speichern“: ' + JSON.stringify(fb.steps));
  ok(!/boo|lust auf mehr|NICHT KLEBT|eure ela|lidl/i.test(fb.notes), 'Facebook: Notizen ohne Gerede und Werbung: ' + JSON.stringify(fb.notes));
  clean(fb, 'Facebook-Plätzchen');
}
// Echtes TikTok (22.11.): alles in einer Zeile, „Und das brauchst du für ca 18 stk:“, Schritte „1. … 2.in … 3. den …“, Erzählsatz statt Name
{
  const tt = imp(require('fs').readFileSync(__dirname + '/fixtures/tiktok-milchbroetchen.txt', 'utf8'));
  ok(tt.title === 'Milchbrötchen' && tt.titleReplaced, 'TikTok: Name aus dem Text statt Erzählsatz: ' + tt.title);
  ok(tt.servings === 18 && tt.servingsUnit === 'Stück', 'TikTok: 18 Stück aus „für ca 18 stk“: ' + tt.servings + ' ' + tt.servingsUnit);
  ok(tt.ingredients.length === 7 && tt.ingredients[0] === '500 g Mehl' && tt.ingredients[3] === '1 TL Salz' && tt.ingredients[6] === '1 Ei', 'TikTok: 7 Zutaten aus einer Zeile, „TI“ -> TL: ' + JSON.stringify(tt.ingredients));
  ok(tt.steps.length >= 6 && /^Zucker mit/.test(tt.steps[0]) && /Milchbrötchen sofort mit Butter/.test(tt.steps[tt.steps.length - 1]), 'TikTok: nummerierte Schritte auch ohne Leerzeichen/Großbuchstaben: ' + tt.steps.length);
  ok(tt.mainIngredient === '' && tt.course === 'Gebäck', 'TikTok: Gebäck ohne „Zimmerwarm“ als Hauptzutat: ' + tt.mainIngredient);
  clean(tt, 'TikTok-Milchbrötchen');
}
// Gesundheits-Sprüche im Namen
for (const [t, want] of [['Gesunder Darm Porridge', 'Porridge'], ['Overnight Oats für einen gesunden Darm', 'Overnight Oats'], ['Detox Smoothie', 'Smoothie'], ['Darmfreundliches Bananenbrot', 'Bananenbrot'], ['Schoko-Muffins', 'Schoko-Muffins']])
  ok(I.cleanTitle(t) === want, 'Gesundheits-Spruch aus dem Namen: ' + t + ' -> ' + I.cleanTitle(t));
d = imp('So wird dein Darm gesund\nZutaten:\n50 g Haferflocken\n1 EL Leinsamen\n200 ml Kefir\nZubereitung:\nAlles verrühren und über Nacht quellen lassen.');
ok(d.title === 'Overnight Oats' && d.titleReplaced && I.reviewHints({ ...d, importInfo: d }).some(x => /Werbespruch/.test(x)), 'Name nur ein Spruch -> aus dem Inhalt benannt und zum Prüfen markiert: ' + d.title);
// ---------- KI-Ergebnis -> Entwurf ----------
{
  const src = 'Blechkuchen für 2 Bleche 🍰 500 g mehl, 250 g Butter, 4 Eier, 300 g Zucker. Alles verrühren, aufs Blech, 25 min bei 180 Grad backen. Hält 3 Tage in der Dose. Folgt mir!';
  const ai = { isRecipe: true, title: 'Blechkuchen', servings: 2, servingsUnit: 'Blech', ingredients: ['500 g Mehl', '250 g Butter', '4 Eier', '300 g Zucker'], steps: ['Alles verrühren.', 'Auf das Blech streichen und 25 Minuten bei 180 °C backen.'], notes: ['Hält 3 Tage in der Dose.'] };
  const k = I.fromAi(ai, src, { url: 'https://x', image: 'i.jpg' });
  ok(k.title === 'Blechkuchen' && k.servings === 2 && k.servingsUnit === 'Blech', 'KI: Name und 2 Bleche übernommen');
  ok(k.course === 'Gebäck' && k.method === 'Backen' && k.aiRead && !k.aiUnsure, 'KI: danach Rezeptart/Zubereitung nach den eigenen Regeln, nichts zu prüfen (' + k.course + '/' + k.method + ')');
  ok(k.sourceUrl === 'https://x' && k.imageUrl === 'i.jpg' && k.importSource.kind === 'ai', 'KI: Quelle, Bild und Original gemerkt');
  ok(JSON.stringify(I.rebuild(k.importSource).ingredients) === JSON.stringify(k.ingredients), 'KI-Rezept lässt sich aus dem Gemerkten neu einlesen (ohne neue KI-Abfrage)');
  const made = I.fromAi({ ...ai, ingredients: ai.ingredients.concat(['1 Pck. Vanillezucker', '2 Prisen Salz']) }, src, {});
  ok(JSON.stringify(made.aiUnsure) === JSON.stringify(['Vanillezucker', 'Salz']), 'KI: Zutaten, die nicht im Text stehen, werden markiert ' + JSON.stringify(made.aiUnsure));
  ok(I.reviewHints({ ...made, importInfo: made }).some(x => /nicht im Originaltext.*Vanillezucker/.test(x)), 'KI: Prüf-Hinweis nennt die Zutat');
  ok(I.fromAi({ isRecipe: false, title: '', ingredients: [], steps: [], notes: [] }, 'Hallo', {}) === null && I.fromAi(null, 'x', {}) === null, 'KI findet kein Rezept: null (die Regeln übernehmen)');
  const e = I.fromAi({ isRecipe: true, title: 'Rührei 🍳', servings: null, servingsUnit: null, ingredients: ['3 Eier', '1 EL Butter'], steps: ['1. Eier verquirlen.'], notes: [] }, '3 Eier 1 EL Butter Eier verquirlen', {});
  ok(e.title === 'Rührei' && e.steps[0] === 'Eier verquirlen.' && e.servings === 4 && e.servingsGuessed, 'KI: Emoji und Nummer weg, ohne Angabe 4 Personen');
}
console.log(fail ? fail + ' Fehler' : 'Emoji-Prüfung ok');
process.exit(fail ? 1 : 0);
