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

// Gesundheits-Sprüche im Namen
for (const [t, want] of [['Gesunder Darm Porridge', 'Porridge'], ['Overnight Oats für einen gesunden Darm', 'Overnight Oats'], ['Detox Smoothie', 'Smoothie'], ['Darmfreundliches Bananenbrot', 'Bananenbrot'], ['Schoko-Muffins', 'Schoko-Muffins']])
  ok(I.cleanTitle(t) === want, 'Gesundheits-Spruch aus dem Namen: ' + t + ' -> ' + I.cleanTitle(t));
d = imp('So wird dein Darm gesund\nZutaten:\n50 g Haferflocken\n1 EL Leinsamen\n200 ml Kefir\nZubereitung:\nAlles verrühren und über Nacht quellen lassen.');
ok(d.title === 'Overnight Oats' && d.titleReplaced && I.reviewHints({ ...d, importInfo: d }).some(x => /Werbespruch/.test(x)), 'Name nur ein Spruch -> aus dem Inhalt benannt und zum Prüfen markiert: ' + d.title);
console.log(fail ? fail + ' Fehler' : 'Emoji-Prüfung ok');
process.exit(fail ? 1 : 0);
