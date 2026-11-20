/* Import: wandelt abgerufene Rezeptseiten (schema.org/JSON-LD) oder freien Text
   (TikTok-Beschreibung, später Text aus Bildschirmfotos) in einen Rezeptentwurf um.
   Läuft komplett in der App; das Server-Programm liefert nur die Rohdaten. */
(function () {
  'use strict';
  const Sc = window.RecipeScale;
  const F = window.RecipeForms;

  // ---------- Hilfen ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  /* Texte aus TikTok, Instagram, Facebook & Co. vereinheitlichen:
     - Schmuckschrift (𝗭𝘂𝘁𝗮𝘁𝗲𝗻, 𝓩𝓾𝓽𝓪𝓽𝓮𝓷, Ｚｕｔａｔｅｎ, 🅉🅄🅃) -> normale Buchstaben
     - unsichtbare Zeichen (Null-Breite-Leerzeichen, weiche Trennstriche, Schreibrichtung) weg
     - Sonder-Leerzeichen -> normales Leerzeichen; Unterstreichen/Durchstreichen per Zeichen weg
     - Umlaute aus zwei Zeichen (u + ¨, z. B. vom iPhone kopiert) -> ein Zeichen
     - ℃ -> °C, ⌀ -> Ø, Bruchstrich ⁄ -> / */
  const FANCY = /[\u{1D400}-\u{1D7FF}\u{FF01}-\u{FF5E}\u{1F100}-\u{1F1E5}\u{1F130}-\u{1F189}\u{FB00}-\u{FB06}\u{2100}-\u{214F}\u{24B6}-\u{24E9}\u{2070}-\u{209F}]/gu;
  function socialText(x) {
    return String(x == null ? '' : x).normalize('NFC')
      .replace(/[\u2028\u2029\u0085]/g, '\n')
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/[\u00AD\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u034F]/g, '')
      .replace(/[\u0305\u0331-\u0333\u0335-\u0338\u20D2\u20E5\u20EB]/g, '')
      .replace(/\u2103/g, '°C').replace(/\u2109/g, '°F').replace(/[\u2300\u2205]/g, 'Ø').replace(/\u2044/g, '/')
      .replace(FANCY, c => { if (/[\u2120-\u2122\u2117]/.test(c)) return c; const n = c.normalize('NFKC'); return n === c || /^[\p{L}\p{N}\p{P} ]+$/u.test(n) ? n : c; });
  }
  function clean(s) {
    return socialText(s)
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
        if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all; }
        return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : all;
      })
      .replace(/[ \t ]+/g, ' ').trim();
  }
  const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const types = o => arr(o && o['@type']).map(t => String(t).toLowerCase());

  // Sucht das Rezept-Objekt in beliebig verschachtelten JSON-LD-Daten (@graph, Listen, mainEntity …)
  function findRecipe(data) {
    const seen = new Set();
    const stack = arr(data).slice();
    while (stack.length) {
      const o = stack.shift();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      if (Array.isArray(o)) { stack.push(...o); continue; }
      if (types(o).includes('recipe')) return o;
      for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'hasPart']) if (o[k]) stack.push(...arr(o[k]));
    }
    return null;
  }

  // Zubereitungsschritte: Text, HowToStep, HowToSection (mit Abschnittsnamen)
  function steps(instr) {
    const out = [];
    const walk = (x, section) => {
      if (x == null) return;
      if (typeof x === 'string' && /\{\s*['"]@type['"]\s*:\s*['"]HowTo/.test(x)) {
        // Fehlerhaft gespeichert (Python-Schreibweise): nur die 'text'-Teile nehmen
        const texts = [...x.matchAll(/['"]text['"]\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/gs)].map(m => m[2].replace(/\\(['"])/g, '$1'));
        if (texts.length) { texts.forEach(t => walk(t, section)); return; }
      }
      if (typeof x === 'string') {
        clean(x).split(/\n+|(?:^|\s)(?=\d{1,2}\.\s+[A-ZÄÖÜ])/).map(s => s.replace(/^\d{1,2}[.)]\s*/, '').trim()).filter(Boolean).forEach(s => out.push(s));
        return;
      }
      if (Array.isArray(x)) { x.forEach(y => walk(y, section)); return; }
      const t = types(x);
      if (t.includes('howtosection')) {
        const name = clean(x.name);
        const before = out.length;
        walk(x.itemListElement || x.steps, name);
        if (name && out.length > before && !/^(zubereitung|anleitung|instructions?|steps?)$/i.test(name)) out[before] = name + ': ' + out[before];
        return;
      }
      if (x.itemListElement) { walk(x.itemListElement, section); return; }
      walk(x.text || x.name || x.description, section);
    };
    walk(instr);
    return out;
  }

  function image(img) {
    for (const i of arr(img)) {
      if (typeof i === 'string' && /^https?:/i.test(i)) return i;
      if (i && typeof i === 'object') { const u = i.url || i.contentUrl || (i['@id'] && /^https?:/.test(i['@id']) ? i['@id'] : ''); if (u) return u; }
    }
    return '';
  }

  // "4 Portionen", ["4", "4 servings"], "1 Springform (26 cm)", "12 Stück", "1 Blech"
  function servingsFrom(yieldVal, title) {
    const cands = arr(yieldVal).map(y => clean(y)).filter(Boolean);
    cands.sort((a, b) => b.length - a.length); // die ausführlichste Angabe zuerst
    for (const c of cands) {
      const m = c.match(/(\d+(?:[.,]\d+)?)(?:\s*(?:[-–]|bis)\s*\d+(?:[.,]\d+)?)?\s*([A-Za-zÄÖÜäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)?/);
      if (!m) continue;
      const n = parseFloat(m[1].replace(',', '.'));
      if (!(n > 0) || n > 200) continue;
      let unit = F.normalizeUnit(m[2] || '');
      if (/serving|portion|person|people|pers/i.test(m[2] || '')) unit = 'Personen';
      let formSize = '';
      const dia = c.match(/(?:Ø|ø|Durchmesser)\s*(\d{2})|(\d{2})\s*(?:cm)?\s*(?:Ø|ø|er\b)|(\d{2})\s*cm/);
      if (unit === 'Springform' || (/springform|tarteform|kuchenform/i.test(c + ' ' + title) && dia)) {
        unit = 'Springform';
        formSize = 'Ø ' + (dia ? (dia[1] || dia[2] || dia[3]) : 26) + ' cm';
      }
      // "96 Vanillekipferl", "12 Muffins", "20 Stück" -> Stück (sonst würde auf 4 Personen umgerechnet)
      if (!F.UNITS.includes(unit)) unit = m[2] && /^\p{Lu}/u.test(m[2]) && !/^(x|mal|min|minuten|std|h)$/i.test(m[2]) ? 'Stück' : 'Personen';
      return { servings: n, servingsUnit: unit, formSize };
    }
    return { servings: 4, servingsUnit: 'Personen', formSize: '', guessed: true };
  }

  // ---------- Kategorien erraten (einfache Regeln; wird später durch die Mini-KI ersetzt) ----------
  const COURSE_RULES = [
    ['Getränk', /(smoothie|lassi|cocktail|limonade|getränk|drink|shake\b|punsch|glühwein|eistee|kaffee|latte\b|bowle|caipirinha|mojito|sangria|spritz\b|likör|hugo\b|kakao|chai)/i],
    ['Frühstück', /\b(frühstück|porridge|overnight oats|müsli|granola|pancakes?|pfannkuchen|omelett|rührei|breakfast)\b/i],
    ['Gebäck', /(kuchen|torte|brot\b|brötchen|muffins?|plätzchen|kekse?|cookies?|brownies?|zopf|tarte|strudel|waffeln|cake|bread)/i],
    ['Dessert', /\b(dessert|nachtisch|mousse|pudding|tiramisu|panna cotta|eis\b|creme brulee|crème|kompott|parfait)\b/i],
    ['Suppe', /(suppe|eintopf|soup)/i],
    ['Salat', /(salat|salad)\b/i],
    ['Sauce & Dip', /(sauce|soße|dip\b|pesto|dressing|aioli|hummus|guacamole|chutney|kräuterbutter|knoblauchbutter|aufstrich|tzatziki|remoulade|mayonnaise|mayo\b|ketchup|salsa\b|frischkäsecreme)/i],
    ['Beilage', /\b(beilage|kartoffelgratin|püree|pommes|side)\b/i],
    ['Vorspeise', /\b(vorspeise|antipasti|bruschetta|starter|appetizer)\b/i],
    ['Snack', /(snack|fingerfood|häppchen|wraps?\b|sandwich|toast\b|stulle|panini|bagel|fruchtzwerg|energy ?balls?|müsliriegel|nuggets)/i]
  ];
  const CATEGORY_MAP = [
    [/haupt|main|dinner|abendessen|mittagessen|lunch/i, 'Hauptgericht'], [/dessert|nachspeise|nachtisch|süßspeise/i, 'Dessert'],
    [/kuchen|torte|backen|gebäck|baking|cake|brot/i, 'Gebäck'], [/suppe|soup|eintopf/i, 'Suppe'], [/salat|salad/i, 'Salat'],
    [/vorspeise|starter|appetizer/i, 'Vorspeise'], [/beilage|side/i, 'Beilage'], [/frühstück|breakfast|brunch/i, 'Frühstück'],
    [/getränk|drink|beverage/i, 'Getränk'], [/snack/i, 'Snack'], [/sauce|soße|dip/i, 'Sauce & Dip']
  ];
  // Verzeichnis typischer Gerichte -> Rezeptart (geprüft wird zuerst das Hauptwort vor "mit/in/auf …", dann der ganze Name)
  const DISH_COURSE = [
    ['Hauptgericht', /gebratener reis|bratreis|nasi goreng|bami goreng|flammkuchen|pizza(?!brötchen)|lasagne|auflauf|gratin(?=.*(nudel|hähnchen|fisch|hack))|gulasch|rouladen?|braten\b|schnitzel|frikadell|bulette|klopse|hackbraten|burger|steak|curry|chili con carne|chili sin carne|risotto|paella|bowl(?!e)|spätzle|knödel(?=.*(spinat|käse|speck))|spinatknödel|kässpätzle|käsespätzle|geschnetzeltes|ragout|stroganoff|moussaka|ratatouille|pfanne\b|eintopf(?=.*(kartoffel|nudel))|pulled pork|spieße|puffer|kohlrouladen|bratwurst|würstchen|wraps?(?=.*bowl)/i],
    ['Beilage', /^(?:\S+\s+)?(?:kartoffel)?püree|bratkartoffeln|salzkartoffeln|pellkartoffeln|kroketten|pommes|rösti|rotkohl|blaukraut|sauerkraut|rahmspinat|grillgemüse|semmelknödel|kartoffelknödel|serviettenknödel|klöße|kartoffelgratin|^reis\b|speckmantel|gemüsebeilage|^spätzle$/i],
    ['Vorspeise', /bruschetta|crostini|caprese|carpaccio|antipasti|vitello tonnato|tapas|gefüllte champignons|garnelen in knoblauch|gambas|aioli mit|vorspeise/i],
    ['Snack', /chips|nuggets|pizzabrötchen|belegte brote?|stulle|sandwich|wraps?\b|energy ?balls?|müsliriegel|fingerfood|häppchen|snack|popcorn|fruchtzwerg|nachos|toast(?!.*french)/i],
    ['Frühstück', /shakshuka|rührei|spiegelei|omelett|french toast|arme ritter|pancakes|porridge|chiapudding|chia-pudding|overnight oats|müsli|granola|frühstück/i],
    ['Dessert', /milchreis|grießbrei|kaiserschmarrn|pudding|mousse|panna cotta|tiramisu|grütze|kompott|kaltschale|parfait|crème brûlée|creme brulee|tiramisu|trifle|(?<!r)eis\b|sorbet|obstsalat|fruchtsalat|nachtisch|dessert|crumble|quarkspeise|götterspeise/i],
    ['Suppe', /suppe|eintopf|minestrone|brühe|bouillon|consommé|gazpacho/i],
    ['Getränk', /smoothie|lassi|cocktail|limonade|getränk|punsch|glühwein|eistee|tee\b|kaffee|latte\b|bowle|caipirinha|mojito|sangria|spritz\b|likör|hugo\b|kakao\b|chai|schorle|saft\b|milchshake|shake\b/i],
    ['Sauce & Dip', /pesto|hollandaise|tzatziki|hummus|guacamole|aioli|dip\b|dressing|vinaigrette|remoulade|mayonnaise|ketchup|salsa\b|chutney|marmelade|konfitüre|gelee\b|aufstrich|kräuterbutter|knoblauchbutter|soße|sauce|bratensoße/i],
    ['Salat', /salat|salad/i],
    ['Gebäck', /kuchen|torte|brot\b|brötchen|brezel|muffins?|plätzchen|kekse?|cookies?|brownies?|zopf|tarte|strudel|waffeln|schnecken|stollen|lebkuchen|makronen|taler\b|teilchen|krapfen|berliner|donuts?|croissants?|plunder|scones|cupcakes?|baguette|ciabatta|focaccia|knäckebrot/i]
  ];
  // Ausnahmen, die sonst falsch einsortiert würden
  const DISH_FIX = [
    [/suppe$|suppe\b|brühe$|bouillon/i, 'Suppe'], [/obstsalat|fruchtsalat/i, 'Dessert'], [/pfannkuchen|eierkuchen|crêpes?|crepes?|palatschinken/i, 'Frühstück'],
    [/kaiserschmarrn/i, 'Dessert'], [/flammkuchen|zwiebelkuchen(?=.*speck)|quiche/i, null], [/french toast/i, 'Frühstück'],
    [/kartoffelsalat|nudelsalat|eiersalat|wurstsalat|thunfischsalat|reissalat|couscous-salat/i, 'Salat']
  ];
  function dishCourse(title) {
    const t = String(title || '');
    const head = t.split(/\s+(?:mit|in|an|auf|und|zu|im|vom|aus|nach)\s+/i)[0];
    for (const [re, v] of DISH_FIX) if (re.test(head)) return v === null ? '' : v;
    // Bei "X mit Y" entscheidet X ("Fischstäbchen mit Kartoffelsalat" ist kein Salat)
    for (const [v, re] of DISH_COURSE) if (re.test(head)) return v;
    if (head !== t) for (const [v, re] of DISH_COURSE) if (v !== 'Salat' && v !== 'Sauce & Dip' && re.test(t)) return v;
    return '';
  }

  function guessCourse(title, category, keywords, recipe) {
    const byDish = dishCourse(title);
    if (byDish) return byDish;
    if (/^(flammkuchen|quiche)/i.test(title)) return 'Hauptgericht';
    if (!/(pfannkuchen|eierkuchen|kaiserschmarrn)/i.test(title) && /(kipferl|plätzchen|kekse?\b|cookies?|muffins?|kuchen|torte|brötchen|brot\b|brownies?|waffeln|schnecken|stollen|lebkuchen|makronen|taler\b|teilchen|krapfen|berliner|donuts?|croissants?|plunder|zopf|streusel|scones|cupcakes?|blechkuchen|hefeteig)/i.test(title)) return 'Gebäck';
    if (COURSE_RULES[0][1].test(title)) return 'Getränk';
    for (const c of arr(category)) for (const [re, v] of CATEGORY_MAP) if (re.test(clean(c))) return v;
    const hay = title + ' ' + arr(keywords).join(' ');
    const headOnly = String(title).split(/\s+(?:mit|in|an|auf|und|zu|im)\s+/i)[0];
    for (const [v, re] of COURSE_RULES) {
      if (v === 'Sauce & Dip' || v === 'Salat' ? re.test(headOnly) : re.test(hay)) return v; // "Hähnchen in Soße" ist kein Dip
    }
    return courseFromContent(recipe) || 'Hauptgericht';
  }

  // Rezeptart aus Zutaten und Schritten, wenn der Name nichts verrät
  const MEAT = /hähnchen|hühnchen|huhn|rind|schwein|hack|speck|schinken|wurst|würstchen|wiener|lachs|thunfisch|fisch|garnele|pute|lamm|salami|bacon|chorizo|gyros/i;
  const SAVORY = /zwiebel|knoblauch|lauch|brühe|fond|senf|sojasauce|sojasoße|pfeffer|oregano|paprikapulver|curry/i;
  const SWEET = /zucker|honig|ahornsirup|agavendicksaft|süßstoff|erythrit|xylit|schokolade|kakao|vanille|marmelade|puderzucker|dattel|nutella|karamell/i;
  const BAKE = /backen|backofen|ofen|°c|backblech|backform|springform|muffinform|umluft|ober-\/unterhitze|waffeleisen/i;
  function courseFromContent(r) {
    if (!r) return '';
    const ing = (r.ingredients || []).join(' | ').toLowerCase(), st = (r.steps || []).join(' ').toLowerCase();
    if (!ing) return '';
    const meat = MEAT.test(ing), savory = SAVORY.test(ing), sweet = SWEET.test(ing), bake = BAKE.test(st);
    if (bake && /mehl|teig|haferflocken|biskuit/.test(ing) && sweet && !meat && !savory) return 'Gebäck';
    if (/haferflocken|porridge|müsli|granola|chiasamen|overnight/.test(ing) && /milch|joghurt|skyr|quark|kefir/.test(ing) && !meat && !savory && !bake) return 'Frühstück';
    if (sweet && !meat && !savory && !bake && /quark|joghurt|skyr|sahne|pudding|mascarpone|creme|beeren|frucht|obst|apfel|äpfel|banane|schokolade|mango|kirsch/.test(ing)) return 'Dessert';
    // Suppe nur bei viel Brühe (ab 1 l) ohne Nudeln/Reis/Kartoffeln als Sättigungsbeilage (sonst ist es meist ein Pfannen-/Topfgericht)
    if (/(?:^|\|\s*)(?:[1-9](?:[.,]\d+)?)\s*l\b[^|]*(brühe|fond)|(\d{4})\s*ml\b[^|]*(brühe|fond)/.test(ing) && /koch|köchel|garen/.test(st) && !/nudel|spaghetti|reis\b|gnocchi|kartoffel/.test(ing)) return 'Suppe';
    if (/salat|rucola|eisberg|feldsalat|blattsalat/.test(ing) && /dressing|vinaigrette|essig|mischen|vermengen/.test(ing + ' ' + st) && !bake) return 'Salat';
    if (meat || (/nudel|spaghetti|penne|reis\b|kartoffel|gnocchi|couscous|linsen|bohnen|kichererbsen|tofu/.test(ing) && savory)) return 'Hauptgericht';
    return '';
  }
  // Zubereitung: Wörter in den Schritten zählen; was am Ende passiert (letzte Schritte) zählt dreifach,
  // denn "Soße köcheln, dann im Ofen backen" ist ein Ofengericht
  const METHOD_WORDS = {
    Backen: /(\bbacken|\bbackofen|im ofen|in den ofen|\bofen\b|überbacken|\d\s*°\s*c|\d\s*grad\b|\bumluft|ober-\/unterhitze|waffeleisen|muffinform|backform|springform|auflaufform|backblech|\bblech\b)/g,
    Braten: /(\banbraten|\bbraten\b|braten\.|gebraten|\bbrät|\bpfanne|\bwok\b|ausbacken|ausgebacken|butterschmalz|\brösten\b|anrösten|stocken lassen)/g,
    Kochen: /(\bkoch(en|t)\b|kochen\.|kochend|\bköcheln|\baufkochen|\bsieden|\btopf\b|salzwasser|aufbrühen|\bbrühen\b|ziehen lassen|wasserbad|\bdünsten|andünsten|einkochen|\bgaren\b|blanchieren)/g,
    Schmoren: /\bschmor/g,
    Grillen: /\bgrill/g,
    Frittieren: /frittier|im heißen fett|in heißem fett/g,
    'Heißluftfritteuse': /heißluftfritteuse|airfryer|air fryer/g
  };
  // Typische Gerichte als zusätzlicher Hinweis (zählt wie mehrere Wörter)
  const DISH_METHOD = [
    ['Kochen', /risotto|spätzle|knödel|klöße|suppe|eintopf|(?<!chia-?)pudding|milchreis|porridge|grießbrei|kompott|grütze|panna cotta/i],
    ['Braten', /schnitzel|frikadell|bulette|puffer|pfannkuchen|bratkartoffeln|rührei|spiegelei|omelett|shakshuka|kaiserschmarrn|french toast|steak|geschnetzeltes|gebraten/i],
    ['Backen', /lasagne|auflauf|gratin|pizza|flammkuchen|quiche|überbacken|mac and cheese|kuchen(?<!pfannkuchen)|torte|brot\b|brötchen|muffins?|plätzchen|kekse|brownies|strudel|aus dem ofen|ofengemüse|ofenkartoffeln/i],
    ['Schmoren', /pulled pork|gulasch(?!suppe)|rouladen?|schmorbraten|ratatouille|rotkohl|ossobuco|beef brisket/i],
    ['Grillen', /gegrillt|vom grill|grillgemüse|spieße/i]
  ];
  const COLD = /kalt stellen|kühlen|kühlschrank|gefrieren|eismaschine|über nacht|im mixer|pürieren|vermengen|verrühren|anrichten|mischen/;
  function guessMethod(stepsList, title) {
    const steps = (stepsList || []).map(x => String(x).toLowerCase());
    const late = steps.slice(-2).join(' ');
    const all = (String(title || '').toLowerCase() + ' ' + steps.join(' '));
    const score = {};
    for (const k in METHOD_WORDS) {
      const n = (all.match(METHOD_WORDS[k]) || []).length, m = (late.match(METHOD_WORDS[k]) || []).length;
      score[k] = n + 2 * m;
    }
    score.Schmoren *= 2; score.Grillen *= 2; score.Frittieren *= 2; score['Heißluftfritteuse'] *= 3;
    for (const [k, re] of DISH_METHOD) if (re.test(title || '')) score[k] += 4;
    // Grillen nur, wenn wirklich gegrillt wird (nicht "Grillpfanne" o. Ä. in Nebensätzen)
    let best = 'Kalt zubereitet', max = 0;
    for (const k in score) if (score[k] > max) { best = k; max = score[k]; }
    // Nur geschmolzen/erhitzt und dann kalt gestellt (Mousse, Tiramisu …) -> kalt
    const strong = /(\bkoch(en|t)\b|köcheln|braten|backen|garen|frittier|grill|schmor|aufkochen|brühen|erhitzen|°c)/.test(all);
    if (!strong && COLD.test(all) && (best === 'Kochen' || best === 'Braten') && max <= 2) best = 'Kalt zubereitet';
    return best;
  }
  // Hauptzutat: die mengenmäßig größte Zutat, Grundzutaten ausgenommen
  // Grundzutaten: auch als Wortende ("Gemüsebrühe", "Puderzucker", "Olivenöl")
  const STAPLE_END = /(salz|pfeffer|zucker|wasser|öl|butter|mehl|backpulver|natron|hefe|essig|gewürz|gewürze|brühe|fond|milch|sahne|kräuter|zimt|muskat|honig|senf|pulver)$/i;
  const STAPLE_WORD = /^(knoblauch|knoblauchzehen?|zehen?|zwiebeln?|ei|eier|eigelbe?|eiweiße?|eiklar|hühnereier?|petersilie|schnittlauch|chili|chiliflocken|vanilleschote|lorbeerblätter?|thymian|rosmarin|basilikum|dill)$/i;
  // Hauptwort einer Zutat: vor Komma/Klammer, letztes Wort ("300 g Bergkäse, gerieben" -> "Bergkäse")
  // Hauptwort einer Zutat: vor Komma/Klammer/"mit …", das letzte großgeschriebene Wort ("Mandelmus mit Zimt vermischt" -> Mandelmus)
  function noun(name) {
    const words = String(name).split(/[,(]|\s(?:mit|und|oder|für|zum|zur|in|nach|vom|von|aus)\s/)[0].trim().split(/\s+/).filter(Boolean);
    const caps = words.filter(w => /^\p{Lu}/u.test(w));
    return (caps.length ? caps[caps.length - 1] : words[words.length - 1]) || '';
  }
  const isStaple = name => { const n = noun(name).toLowerCase(); return !n || STAPLE_END.test(n) || STAPLE_WORD.test(n); };
  // Hauptzutat aus dem Rezeptnamen: "Kohlrabi-Karotten-Nudeln" -> Nudeln (das Grundwort steht hinten),
  // "Hähnchen mit Reis" -> Hähnchen (vor "mit" steht das Gericht), "Kartoffelplätzchen" -> Kartoffeln
  function mainFromTitle(ingredients, title, opt) {
    opt = opt || {};
    // Umlaute angleichen: "Äpfel" passt zu "Apfelkuchen"
    const de = x => String(x).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
    const head = de(String(title || '').split(/\s+(?:mit|an|auf|in|und|im|vom|aus|nach|à la|a la)\s+/i)[0]);
    if (!head) return '';
    let best = '', bestPos = -1;
    for (const line of ingredients) {
      if (isSubheading(line)) continue;
      const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
      if (!p.name) continue;
      if (isStaple(p.name)) {
        if (opt.noStaple) continue;
        // "Dinkelmehl" + "Dinkelwaffeln", "Kokosmilch" + "Kokos-Curry": der besondere Teil steht im Namen
        const n = de(noun(p.name) || '');
        const front = n.replace(STAPLE_END, '');
        if (front.length >= 4 && front !== n && head.includes(front) && !SPICE.test(front)) {
          const pos = head.lastIndexOf(front);
          if (pos > bestPos) { bestPos = pos; best = p.name; }
        }
        continue;
      }
      const name = p.name.replace(/\s+(nach (wahl|belieben|geschmack)|zum \p{L}+|für \p{L}+.*)$/iu, '').split(/\s(?:mit|und|oder)\s/)[0];
      const stemOf = x => de(x).replace(/(innen|en|n|e|s)$/, '');
      const headWords = head.split(/[\s-]+/).filter(w => w.length >= 4);
      for (const word of name.split(/[\s,]+/).filter(w => /^\p{Lu}/u.test(w))) {
        const n = de(word);
        if (/rezept|kinder|familie|essen$|ideen|gericht|küche/.test(n)) continue;
        const stem = stemOf(n);
        if (stem.length < 3) continue;
        let pos = head.lastIndexOf(stem);
        // "Bandnudeln" passt zu "…-Nudeln": hinterer Wortteil (mind. 5 Buchstaben) im Namen
        if (pos < 0) for (let k = 1; k <= stem.length - 5; k++) { const tail = stem.slice(k); const q = head.lastIndexOf(tail); if (q >= 0) { pos = q; break; } }
        // "Lachs auf Spinat" + "Lachsfilets": Zutat beginnt mit einem Wort aus dem Namen
        if (pos < 0) for (const w of headWords) if (n.startsWith(stemOf(w))) pos = Math.max(pos, head.lastIndexOf(w));
        // Bei Süßem zählen Obst und Schokolade vor Quark & Co. ("Erdbeer-Quark-Dessert" -> Erdbeeren)
        if (pos >= 0 && opt.prefer && opt.prefer.test(p.name)) pos += 1000;
        if (pos > bestPos) { bestPos = pos; best = p.name; }
      }
    }
    if (best) return best;
    // Name nur aus Grundzutaten ("Kräuterbutter", "Knoblauchöl"): die zuletzt genannte Grundzutat
    if (!opt.noStaple) {
      let st = '', stPos = -1;
      for (const line of ingredients) {
        const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
        if (!p.name || !isStaple(p.name)) continue;
        const n = (noun(p.name) || '').toLowerCase().replace(/(en|n|e|s)$/, '');
        if (n.length < 3 || /^(salz|pfeffer|wasser|zucker|ei|eier)/.test(n) || SPICE.test(n)) continue;
        const pos = head.lastIndexOf(n);
        if (pos > stPos) { stPos = pos; st = p.name; }
      }
      if (st && stPos >= 0 && !/[\s-]/.test(head.slice(stPos))) return st;
    }
    // Nichts vor "mit": die zuerst genannte Zutat im ganzen Namen ("Eintopf mit Kartoffeln & Würstchen" -> Kartoffeln)
    const whole = String(title || '').toLowerCase();
    let first = '', firstPos = Infinity;
    for (const line of ingredients) {
      const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
      if (!p.name || isStaple(p.name)) continue;
      for (const word of p.name.split(/\s(?:mit|und|oder)\s/)[0].split(/[\s,]+/).filter(w => /^\p{Lu}/u.test(w))) {
        const stem = word.toLowerCase().replace(/(innen|en|n|e|s)$/, '');
        if (stem.length < 3) continue;
        let pos = whole.indexOf(stem);
        // "Wraps mit Hähnchen" + "Hähnchenbrust": Zutat beginnt mit einem Wort aus dem Namen
        if (pos < 0) for (const w of whole.split(/[\s,&-]+/).filter(x => x.length >= 4)) if (word.toLowerCase().startsWith(w.replace(/(innen|en|n|e|s)$/, ''))) { pos = whole.indexOf(w); break; }
        if (pos >= 0 && pos < firstPos) { firstPos = pos; first = p.name; }
      }
    }
    return first;
  }

  const SPICE = /salz|pfeffer|paprikapulver|curry(?!wurst)|chilipulver|kurkuma|kreuzkümmel|kümmel|zimt|muskat|oregano|thymian|rosmarin|basilikum|majoran|chili|cayenne|knoblauchpulver|zwiebelpulver|lorbeer|nelke|piment|vanille|backpulver|natron|gewürz|ingwerpulver|koriander|hefe|zitronenschale|orangenschale|abrieb|puddingpulver|speisestärke/i;
  function guessMain(ingredients, title) {
    let best = mainFromTitle(ingredients, title) || null, bestScore = best ? Infinity : -1;
    ingredients.forEach((line, i) => {
      const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
      if (!p.name || isStaple(p.name)) return;
      // Kategorie-Wörter von Webseiten sind keine Zutat ("Kinderrezepte", "Familienessen", "Abendessen")
      if (bestScore === Infinity) return;
      if (/rezept|kinder|familie|essen\b|ideen|gericht|küche|snack|dessert|frühstück/i.test(p.name)) return;
      const v = Sc.parseNum(String(p.amount).split('–')[0]);
      let g = isNaN(v) ? 0 : v;
      const u = (p.unit || '').toLowerCase();
      if (u === 'kg' || u === 'l') g *= 1000; else if (u === 'g' || u === 'ml') g *= 1; else if (!u) g *= /dattel|feige|olive|nuss|nüsse|mandel|kirsche|beere|knoblauch|chili|schalotte|champignon|radieschen|cracker|keks|zweig|blatt|blätter/i.test(p.name) ? 10 : 120; else g *= 15;
      // Gewürze/Backzutaten nie; Würzmengen (Löffel, Prise, bis 20 g – in den Rezepten im Schnitt ~9 g) auch nicht
      if (SPICE.test(p.name) || /^(tl|el|prise|msp|messerspitze|spritzer|tropfen|teelöffel|esslöffel)/.test(u) || ((u === 'g' || u === 'ml') && g <= 20)) return;
      const score = g - i; // bei Gleichstand: weiter oben gewinnt
      if (score > bestScore) { bestScore = score; best = p.name; }
    });
    return mainLabel(best);
  }
  // Zutatenname -> kurze Hauptzutat ("Hähnchenbrustfilets" -> "Hähnchen", "Rolle Blätterteig" -> "Blätterteig")
  function mainLabel(best) {
    if (!best) return '';
    const w = noun(best) || best;
    if (/hühnerei|eiklar|eiweiß|eigelb/i.test(best)) return '';
    const MAP = [[/grüne bohnen|brechbohnen|buschbohnen|stangenbohnen/i, 'Grüne Bohnen'], [/getrocknete erbsen|schälerbsen|spalterbsen|trockenerbsen/i, 'Trockenerbsen'], [/kidney|schwarze bohnen|weiße bohnen|wachtelbohnen/i, 'Bohnen'], [/hähnchen|huhn|hühner(?!ei)|chicken/i, 'Hähnchen'], [/rind/i, 'Rind'], [/schwein/i, 'Schwein'], [/hack/i, 'Hackfleisch'], [/lachs/i, 'Lachs'], [/thunfisch/i, 'Thunfisch'], [/garnele|shrimp/i, 'Garnelen'], [/nudel|spaghetti|pasta|penne|linguine|tagliatelle|fusilli/i, 'Nudeln'], [/kartoffel/i, 'Kartoffeln'], [/reis\b/i, 'Reis'], [/linse/i, 'Linsen'], [/tofu/i, 'Tofu'], [/apfel|äpfel/i, 'Äpfel'], [/schoko/i, 'Schokolade'], [/quark/i, 'Quark']];
    for (const [re, v] of MAP) if (re.test(best)) return v;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  // Hauptzutat muss ein echtes Wort sein (keine Zahl, keine Zeit- oder Mengenangabe)
  const NOT_MAIN = /^(minuten?|min|stunden?|std|sekunden|portionen?|personen|pers|stück|stk|gläser|zutaten|zubereitung|rezepte?|kcal|kj|bis|zu|ca|etwa|und|oder|mit|für|von|grad|gramm|liter|zeit|schritt|anleitung|hinweis|tipp|kinderrezepte?|familienessen|abendessen|mittagessen|ideen|eier|ei|eigelbe?|eiweiße?|salz|pfeffer|wasser|light|leicht|kleiner?e?|große?r?|mittelgroße?|frische?r?|natur|fein|grob|optional|tk|bio|vegan|veggie|reife?|weiche?|kalte?|warme?|gehackte?|gewürfelte?|geriebene?r?|limonade|mineralwasser|sprudel|sprudelwasser|cola|lebensmittelfarbe)$/i;
  function validMain(v) {
    const t = clean(v);
    return /^\p{L}[\p{L}\s'’-]{1,40}$/u.test(t) && !NOT_MAIN.test(t) ? t : '';
  }
  // ---------- Amerikanische Maße (Tasse/cup, oz, lb) umrechnen ----------
  // Deutsches Rezept: gleich umrechnen ("½ Tasse Gurke" -> "75 g Gurke");
  // englisches Rezept: Original lassen, Umrechnung in Klammern dahinter ("1 cup flour (ca. 125 g)")
  const CUP_G = [[/krümel|brösel|crumbs/i, 100], [/puderzucker|powdered sugar|icing sugar/i, 120], [/brauner zucker|brown sugar/i, 220], [/mehl|flour/i, 125], [/zucker|sugar/i, 200], [/haferflocken|oats/i, 90],
    [/reis|rice/i, 185], [/butter/i, 225], [/geriebene[rn]? käse|käse.*gerieben|shredded cheese|grated cheese|parmesan/i, 100], [/mandeln|nüsse|nuts|almonds|walnüsse|walnuts|cashews/i, 140],
    [/kakao|cocoa/i, 100], [/quinoa/i, 170], [/couscous/i, 180], [/linsen|lentils/i, 190], [/schoko|chocolate/i, 170], [/rosinen|raisins/i, 150], [/kokos(raspeln|flocken)|shredded coconut/i, 80],
    [/spinat|spinach|salat|lettuce|rucola|kräuter|herbs|petersilie|parsley|basilikum|basil/i, 30],
    [/gurke|cucumber|paprika|pepper|mais|corn|tomate|tomato|zwiebel|onion|karotte|möhre|carrot|zucchini|erbsen|peas|bohnen|beans|brokkoli|broccoli|pilze|champignon|mushroom|beeren|berries|obst|fruit|kartoffel|potato/i, 150]];
  const LIQUID = /milch|milk|wasser|water|brühe|broth|stock|sahne|cream|öl\b|oil|saft|juice|joghurt|yogurt|wein|wine|essig|vinegar|sauce|soße|sirup|syrup|honig|honey/i;
  const EN_HINT = /\b(cups?|tbsp|tsp|teaspoons?|tablespoons?|ounces?|oz|pounds?|lbs?|of|chopped|minced|diced|sliced|large|small|and|or|fresh|to taste|pinch)\b/i;
  const DE_HINT = /\b(und|oder|gehackt|gewürfelt|frisch|EL|TL|Prise|nach Geschmack|Stück|Zehe|Bund|Dose|ml|g)\b|[äöüß]/;
  const NUMV = '(\\d+(?:[.,]\\d+)?(?:\\s?[½⅓⅔¼¾⅛])?|[½⅓⅔¼¾⅛]|\\d+\\/\\d+|\\d+\\s\\d+\\/\\d+)';
  const CUP_RE = new RegExp('^' + NUMV + '\\s*(?:[–-]\\s*' + NUMV + '\\s*)?(tassen?|cups?|c\\.)\\s+(.+)$', 'i');
  const OZ_RE = new RegExp('^' + NUMV + '\\s*(fl\\.?\\s*oz|oz|ounces?|lbs?|pounds?)\\.?\\s*(\\p{L}.+)$', 'iu');
  const round = (v, step) => Math.max(step, Math.round(v / step) * step);
  function metricFor(cups, rest) {
    if (LIQUID.test(rest)) { const ml = round(cups * 240, cups * 240 >= 100 ? 10 : 5); return ml >= 1000 ? Sc.parseNum ? (String(ml / 1000).replace('.', ',') + ' l') : ml + ' ml' : ml + ' ml'; }
    for (const [re, g] of CUP_G) if (re.test(rest)) return round(cups * g, 5) + ' g';
    return round(cups * 240, 10) + ' ml';
  }
  // Fremde Maße immer direkt in g/ml umrechnen; steht schon g/ml daneben, nur das behalten
  const FOREIGN = '(?:tassen?|cups?|c\\.|oz\\.?|ounces?|lbs?\\.?|pounds?|fl\\.?\\s*oz\\.?)';
  const METRIC = '(\\d+(?:[.,]\\d+)?)\\s*(g|kg|ml|l|cl)\\b\\.?';
  const DUAL_A = new RegExp('^' + NUMV + '\\s*' + FOREIGN + '\\s*/\\s*' + METRIC + '\\s*(.*)$', 'i');   // "¼ Tasse / 50g Butter"
  const DUAL_B = new RegExp('^' + METRIC + '\\s*/\\s*' + NUMV + '\\s*' + FOREIGN + '\\s*(.*)$', 'i');   // "50 g / ¼ cup butter"
  const DUAL_M = new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(?:g|ml)\\s*/\\s*' + METRIC + '\\s*(.*)$', 'i');     // früher doppelt umgerechnet: "37 g / 50 g Butter"
  const PAREN_CA = /\s*\(ca\.\s*(\d+(?:[.,]\d+)?)\s*(g|ml|l)\)\s*$/i;                                    // früher: "1 cup flour (ca. 125 g)"
  const fmtMetric = (n, u) => n + ' ' + u.toLowerCase().replace(/^l$/, 'l');
  function tidyLine(l) {
    return String(l)
      .replace(/(\d)\s*(?:esslöffel|eßlöffel|tablespoons?|tbsps?\.?)(?=\s|$)/gi, '$1 EL').replace(/^(?:esslöffel|eßlöffel)\s/i, 'EL ')
      .replace(/(\d)\s*(?:teelöffel|teaspoons?|tsps?\.?)(?=\s|$)/gi, '$1 TL').replace(/^teelöffel\s/i, 'TL ')
      .replace(/\b(\p{L}{3,})\s+\1\b/giu, '$1') // "Zucker Zucker"
      .replace(/allzweckmehl|all-purpose flour/gi, 'Mehl (Type 405)')
      // Abkürzungen ausschreiben, die nicht jeder kennt ("1 Spr" -> "1 Spritzer")
      .replace(/(\d|^)\s*Spr\.?(?=\s|$)/g, (m, d) => (d ? d + ' ' : '') + 'Spritzer')
      .replace(/(\d)\s*Bd\.?(?=\s|$)/g, '$1 Bund')
      .replace(/(\d)\s*Zw\.?(?=\s|$)/g, '$1 Zweig')
      .replace(/\bgestr\.(?=\s|$)/g, 'gestrichen').replace(/\bgeh\.(?=\s|$)/g, 'gehäuft')
      .replace(/(\d)\s*Tr\.?(?=\s|$)/g, '$1 Tropfen')
      .replace(/\s{2,}/g, ' ').trim();
  }
  function convertUnits(lines) {
    return lines.map(raw => {
      let l = tidyLine(raw);
      let m;
      // Früher in Klammern umgerechnet -> Gramm vorn, fremde Angabe weg
      if ((m = l.match(PAREN_CA)) && new RegExp('^' + NUMV + '\\s*' + FOREIGN + '\\s', 'i').test(l)) {
        const rest = l.replace(PAREN_CA, '').replace(new RegExp('^' + NUMV + '\\s*' + FOREIGN + '\\s*', 'i'), '');
        return fmtMetric(m[1], m[2]) + ' ' + rest;
      }
      if ((m = l.match(DUAL_A))) return fmtMetric(m[2], m[3]) + ' ' + m[4];
      if ((m = l.match(DUAL_B))) return fmtMetric(m[1], m[2]) + ' ' + m[4];
      if ((m = l.match(DUAL_M))) return fmtMetric(m[2], m[3]) + ' ' + m[4];
      // "20 oz./600g Frischkäse" ohne Leerzeichen
      if ((m = l.match(new RegExp('^' + NUMV + '\\s*' + FOREIGN + '\\s*/\\s*' + METRIC + '(.*)$', 'i')))) return fmtMetric(m[2], m[3]) + ' ' + m[4].trim();
      m = l.match(CUP_RE);
      if (m) {
        const a = Sc.parseNum(m[1]), b = m[2] ? Sc.parseNum(m[2]) : NaN;
        if (isNaN(a)) return l;
        const met = metricFor(a, m[4]);
        const amount = isNaN(b) ? met : met.replace(/\s.*$/, '') + '–' + metricFor(b, m[4]);
        return amount + ' ' + m[4];
      }
      m = l.match(OZ_RE);
      if (m) {
        const a = Sc.parseNum(m[1]);
        if (isNaN(a)) return l;
        const unit = m[2].toLowerCase();
        const met = /fl/.test(unit) ? round(a * 30, 5) + ' ml' : /lb|pound/.test(unit) ? round(a * 454, 10) + ' g' : round(a * 28, 5) + ' g';
        return met + ' ' + m[3];
      }
      return l;
    });
  }

  // Ist die Rezeptart wirklich erkannt (oder nur "Hauptgericht" als Notlösung)?
  function courseSure(title, category, keywords, recipe) {
    if (arr(category).some(c => CATEGORY_MAP.some(([re]) => re.test(clean(c))))) return true;
    const hay = title + ' ' + arr(keywords).join(' ');
    return COURSE_RULES.some(([, re]) => re.test(hay)) || /(kipferl|plätzchen|kuchen|torte)/i.test(title) || !!courseFromContent(recipe);
  }

  // ---------- Prüf-Hinweise: Woran sollte man bei einem importierten Rezept schauen? ----------
  const NO_AMOUNT_OK = /^(salz|pfeffer|wasser|eiswürfel|eis\b|muskat|deko|garnitur)|\b(zum|zur|für (?:das|die|den)|nach belieben|nach geschmack|nach bedarf|optional|etwas|evtl|eventuell)\b/i;
  // Liefert die Prüfpunkte; Nebeninfos (z. B. Zutaten ohne Menge) stehen in hints.minor
  function reviewHints(r) {
    const info = r.importInfo || r;
    const hints = [];
    const minor = [];
    hints.minor = minor;
    const ing = r.ingredients || [], st = r.steps || [];
    if (info.titleMissing || /^Rezept vom Bildschirmfoto \d+$/.test(r.title || '')) hints.push('Kein Name erkannt – bitte einen Namen eintragen.');
    if (info.how === 'photo') hints.push('Vom Bildschirmfoto gelesen – vor allem die Mengen prüfen, die Texterkennung kann sich bei Zahlen vertun.');
    if (info.how === 'text') hints.push('Die Seite hatte keine Rezeptangaben – alles wurde aus dem Seitentext gelesen. Auf fehlende oder überzählige Zutaten und Schritte achten.');
    else if (/^(pin|tiktok|social)$/.test(info.how || '')) hints.push('Aus einer Beitragsbeschreibung gelesen – prüfen, ob alle Zutaten und Schritte dabei sind.');
    if (ing.length < 3) hints.push(ing.length ? 'Nur ' + ing.length + ' Zutat' + (ing.length > 1 ? 'en' : '') + ' – fehlt etwas?' : 'Keine Zutaten gefunden.');
    const noAmount = [], odd = [], seen = new Map(), dup = new Set();
    for (const l of ing) {
      const p = Sc.parseIngredient(Sc.normalizeIngredient(l));
      if (!/\p{L}{2}/u.test(l) || l.length > 140 || /^[)\],;.]/.test(l)) odd.push(l);
      else if (!p.amount && !NO_AMOUNT_OK.test(l.trim())) noAmount.push(noun(l) || l);
      const n = (noun(p.name || l) || '').toLowerCase();
      if (n.length > 2) { if (seen.has(n)) dup.add(noun(p.name || l)); else seen.set(n, true); }
    }
    if (noAmount.length) minor.push('Ohne Mengenangabe: ' + noAmount.slice(0, 6).join(', ') + (noAmount.length > 6 ? ' …' : '') + '.');
    if (odd.length) hints.push('Seltsame Zutatenzeile: „' + odd[0].slice(0, 60) + (odd[0].length > 60 ? '…' : '') + '“' + (odd.length > 1 ? ' (und ' + (odd.length - 1) + ' weitere)' : '') + '.');
    if (dup.size) hints.push('Zutat doppelt: ' + [...dup].join(', ') + ' – vielleicht für Teig und Belag getrennt? Dann stimmt es.');
    if (info.unitsConverted) hints.push('Tassen/Unzen wurden in g bzw. ml umgerechnet – die Mengen sind ungefähr.');
    if (!st.length) hints.push('Keine Zubereitung gefunden.');
    else {
      const long = st.findIndex(x => x.length > 350);
      if (long >= 0) hints.push('Schritt ' + (long + 1) + ' ist sehr lang – vielleicht ist Werbung oder Begleittext hineingerutscht.');
      const link = st.findIndex(x => /https?:\/\/|www\.|@\w|#\w/.test(x));
      if (link >= 0) hints.push('Schritt ' + (link + 1) + ' enthält einen Link oder Hashtag.');
    }
    // Keine Portionsangabe: einfach 4 Personen, ohne Hinweis
    if (info.courseGuessed && !courseSure(r.title || '', [], [], r)) hints.push('Rezeptart nicht eindeutig erkennbar – „' + (r.course || 'Hauptgericht') + '“ angenommen.');
    if (!r.mainIngredient && !NO_MAIN_COURSES.test(r.course || '')) hints.push('Keine Hauptzutat erkannt.');
    if ((r.title || '').length > 45) hints.push('Der Name ist sehr lang – kürzen?');
    return hints;
  }

  // Snacks, Desserts und Gebäck haben meist keine Hauptzutat – nur wenn sie im Namen steckt ("Apfelkuchen")
  // Zwischenüberschrift statt Zutat ("Für den Teig", "Cookies", "Topping:") – ohne Zahl
  const SUBHEAD = /^(für|zum|zur|dienen|deko|dekoration|toppings?|teig|boden|füllung|creme|soße|sauce|glasur|guss|belag|streusel|panade|marinade|dressing)\b|^(cookies?|kekse?|kuchen|muffins?|waffeln|brot|brötchen|pancakes|pfannkuchen|bowl|salat|dip|außerdem|sonstiges|zusätzlich|optional|zutaten)\s*:?$/i;
  const isSubheading = l => { const t = String(l || '').trim(); return !!t && !/\d|[½¼¾⅓⅔]/.test(t) && (SUBHEAD.test(t) || (/:$/.test(t) && t.split(/\s+/).length <= 4)); };
  const NO_MAIN_COURSES = /^(Dessert|Snack|Gebäck|Getränk|Sauce & Dip)$/;
  // Typische Gerichte: Name -> welche Zutat das Gericht ausmacht (sonst fester Name)
  // [Gericht im Namen, Zutat im Rezept, Ersatz, wenn keine passende Zutat dabei ist]
  const DISH_MAIN = [
    [/chili con carne|hackbraten|frikadell|bulette|köttbullar|hackbällchen|burger|cevapcici/i, /hack|rind|patt(y|ies)/i, ''],
    [/hähnchen|hühnchen|huhn\b|hühner(?!ei)|chicken|nuggets|geflügel|pute/i, /hähnchen|hühnchen|huhn|hühner(?!ei)|chicken|pute|geflügel/i, ''],
    [/bratwurst|currywurst|würstchen|wiener\b/i, /wurst|würst|wiener/i, ''],
    [/sushi|fisch(?!sauce)|lachs|thunfisch|garnele|shrimp|scampi|forelle|kabeljau|seelachs/i, /lachs|thunfisch|fisch(?!sauce)|garnele|shrimp|scampi|forelle|kabeljau|seelachs/i, ''],
    [/rührei|spiegelei|omelett|shakshuka|quiche|eiersalat|eierlikör|frittata|tortilla de patatas|eggs benedict|^eier\b|soleier|strammer max/i, null, 'Eier'],
    [/caprese/i, /mozzarella|burrata/i, 'Mozzarella'],
    [/spätzle/i, /spätzle/i, 'Spätzle'],
    [/semmelknödel|serviettenknödel|brezenknödel|kartoffelknödel|klöße|(?<!spinat|käse|speck|rote-bete-)knödel/i, /kartoffel|brötchen|semmel|brezel|knödel/i, 'Knödel'],
    [/pizza(?!brötchen)|flammkuchen/i, /teig|mehl/i, ''],
    [/pasta|spaghetti|nudel|penne|tagliatelle|fusilli|makkaroni|maccaroni|lasagne|tortellini|ravioli|mac and cheese|mac'n'cheese/i, /nudel|spaghetti|pasta|penne|tagliatelle|fusilli|makkaroni|maccaroni|lasagne|tortellini|ravioli|farfalle|rigatoni|linguine/i, 'Nudeln'],
    [/overnight oats|porridge|haferbrei|müsli|granola|oatmeal/i, /hafer|flocken|müsli|granola/i, 'Haferflocken'],
    [/erbsen(eintopf|suppe)|linsen|dal\b|chili sin carne|bohneneintopf|bohnensuppe|hummus|falafel|kichererbsen(?!.*curry)/i, /linse|bohne|kichererbse|erbse/i, 'Hülsenfrüchte'],
    [/obstsalat|fruchtsalat|grütze|kompott/i, /beere|kirsch|obst|apfel|äpfel|pflaume|zwetsch|frucht|früchte|orange|banane|trauben/i, 'Obst'],
    [/ofengemüse|grillgemüse|gemüsepfanne|ratatouille|gemüsecurry|gemüsesuppe|gemüseeintopf|gemüsestrudel/i, null, 'Gemüse'],
    [/schoko|chocolat/i, /schoko|kuvertüre|kakao/i, 'Schokolade'],
    [/^reis\b|reispfanne|gebratener reis|nasi goreng|risotto|paella/i, /reis/i, 'Reis']
  ];
  function dishMain(d) {
    const t = String(d.title || '');
    // Nur der Kern des Namens zählt ("Gemüsecurry mit Kichererbsen" -> Gemüsecurry);
    // was nach "mit" steht, klärt danach die Zutatensuche im Namen
    const head = t.split(/\s+(?:mit|an|auf|in|und|im|vom|aus|nach)\s+/i)[0];
    // Mehrere Treffer: das hintere Wort ist das Gericht ("Lachs-Spinat-Pasta" -> Pasta)
    const hits = DISH_MAIN.map(x => { const m = head.match(new RegExp(x[0].source, 'gi')); return m ? [x, head.toLowerCase().lastIndexOf(m[m.length - 1].toLowerCase())] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]).map(h => h[0]);
    for (const [re, ing, label] of hits) {
      if (ing) {
        let best = '', bestG = -1;
        for (const line of d.ingredients || []) {
          const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
          if (!p.name || !ing.test(p.name)) continue;
          const v = Sc.parseNum(String(p.amount).split('–')[0]); const u = (p.unit || '').toLowerCase();
          const g = (isNaN(v) ? 0.5 : v) * (u === 'kg' || u === 'l' ? 1000 : u === 'g' || u === 'ml' ? 1 : u ? 300 : 100);
          if (g > bestG) { bestG = g; best = p.name; }
        }
        if (best) return /mehl$/i.test(noun(best)) ? 'Teig' : (mainLabel(best) || label);
      }
      if (label) return label;
    }
    return '';
  }
  const SWEET_FIRST = new RegExp('(apfel|äpfel|birne|banane|beere|erdbeer|himbeer|heidelbeer|blaubeer|kirsch|pflaume|zwetschg|aprikose|pfirsich|mango|ananas|rhabarber|orange|zitrone|kokos|schoko|kakao|nougat|karamell|marzipan|nuss|nüsse|mandel)', 'i');
  function mainFor(d) {
    const byDish = dishMain(d);
    if (byDish) return byDish;
    if (NO_MAIN_COURSES.test(d.course || '')) return validMain(mainLabel(mainFromTitle(d.ingredients || [], d.title, { noStaple: true, prefer: SWEET_FIRST }))) || '';
    return validMain(guessMain(d.ingredients || [], d.title));
  }
  // Häufige Tippfehler und alte Schreibweisen in Rezepten (nur ganze Wörter, auch in Zusammensetzungen am Wortende)
  const SPELL = [
    [/champions\b/gi, 'Champignons'], [/champingons?\b/gi, 'Champignons'], [/zuchinis?\b/gi, 'Zucchini'], [/zucchinis\b/gi, 'Zucchini'], [/brokoli\b/gi, 'Brokkoli'], [/broccoli\b/gi, 'Brokkoli'],
    [/spagetti\b/gi, 'Spaghetti'], [/mozarella\b/gi, 'Mozzarella'], [/mozzarela\b/gi, 'Mozzarella'], [/jogurt\b/gi, 'Joghurt'], [/joghourt\b/gi, 'Joghurt'], [/yoghurt\b/gi, 'Joghurt'],
    [/zimmt\b/gi, 'Zimt'], [/vanilie\b/gi, 'Vanille'], [/vanile\b/gi, 'Vanille'], [/ruccola\b/gi, 'Rucola'], [/tomatten\b/gi, 'Tomaten'], [/kartofeln\b/gi, 'Kartoffeln'], [/kartofel\b/gi, 'Kartoffel'],
    [/backpulfer\b/gi, 'Backpulver'], [/paprikapulfer\b/gi, 'Paprikapulver'], [/parmasan\b/gi, 'Parmesan'], [/parmesankäse\b/gi, 'Parmesan'], [/basilikumm\b/gi, 'Basilikum'], [/oreganno\b/gi, 'Oregano'],
    [/muskatnuß\b/gi, 'Muskatnuss'], [/kokosnuß\b/gi, 'Kokosnuss'], [/haselnuß\b/gi, 'Haselnuss'], [/walnuß\b/gi, 'Walnuss'], [/erdnuß\b/gi, 'Erdnuss'], [/\bnuß\b/gi, 'Nuss'], [/nüße\b/gi, 'Nüsse'],
    [/\bmuß\b/g, 'muss'], [/\bdaß\b/g, 'dass'], [/\bläßt\b/g, 'lässt'], [/\bgeschloßen\b/g, 'geschlossen'], [/\bbißchen\b/g, 'bisschen'], [/\bnaß\b/g, 'nass'], [/\bfaß\b/g, 'Fass'],
    [/\bschlagsahnne\b/gi, 'Schlagsahne'], [/\bsahnne\b/gi, 'Sahne'], [/\bzwiebbel(n?)\b/gi, 'Zwiebel$1'], [/\bknoblauchzehn\b/gi, 'Knoblauchzehen'], [/\bpetersielie\b/gi, 'Petersilie'],
    [/\bzitronnen\b/gi, 'Zitronen'], [/\bmandarinnen\b/gi, 'Mandarinen'], [/\bhimbeern\b/gi, 'Himbeeren'], [/\berdbeern\b/gi, 'Erdbeeren'], [/\bheidelbeern\b/gi, 'Heidelbeeren'],
    [/\bgries\b/gi, 'Grieß'], [/\bweizengries\b/gi, 'Weizengrieß'], [/\bpuderzuker\b/gi, 'Puderzucker'], [/\bzuker\b/gi, 'Zucker'], [/\bbutterschmaltz\b/gi, 'Butterschmalz'], [/\bschmaltz\b/gi, 'Schmalz'],
    [/\bgemüsebrüe\b/gi, 'Gemüsebrühe'], [/\bbrüe\b/gi, 'Brühe'], [/\bmilch reis\b/gi, 'Milchreis'], [/\bkräuter salz\b/gi, 'Kräutersalz'], [/\bolivenoel\b/gi, 'Olivenöl'], [/\boel\b/gi, 'Öl']
  ];
  // Großschreibung des Originals übernehmen ("champions" -> "Champignons", am Satzanfang groß)
  function fixSpelling(t) {
    let out = String(t || '');
    for (const [re, rep] of SPELL) out = out.replace(re, (m, ...g) => {
      let w = rep.replace(/\$(\d)/g, (x, i) => g[i - 1] || '');
      if (/^\p{Lu}/u.test(m) && /^\p{Ll}/u.test(w)) w = w.charAt(0).toUpperCase() + w.slice(1);
      return w;
    });
    return out;
  }
  // Schreibweise glätten: doppelte Leerzeichen, Leerzeichen vor Satzzeichen, fehlendes nach Komma, Satzanfang groß
  const tidyText = t => fixSpelling(String(t || '')).replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])(?=\s|$)/g, '$1').replace(/,(?=\p{L})/gu, ', ').replace(/([.!?])\1{1,}/g, '$1').trim();
  const capFirst = t => t.replace(/^(\p{Ll})/u, c => c.toUpperCase());
  // Notizen: Werbung, Aufrufe, Hashtags, @Namen, Emojis und Wiederholung des Namens weg; echte Hinweise (Haltbarkeit, Tipps) bleiben
  function cleanNotes(notes, title) {
    const t = String(title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    return String(notes || '').split(/\n/)
      .map(l => stripSymbols(socialText(l)).replace(/#[\p{L}\p{N}_]+/gu, '').replace(/(^|\s)@[\p{L}\p{N}_.]+/gu, '$1'))
      .map(l => l.split(/(?<=[.!?])\s+/).filter(x => !isFluffLine(x)).join(' '))
      .map(l => tidyText(l))
      .filter(l => /[\p{L}\p{N}]/u.test(l) && l.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') !== t && !/^(zutaten|zubereitung|anleitung|so geht'?s|rezept|notizen?|tipps?)\s*:?$/i.test(l))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  /* Aufräumen für jedes Rezept (neu importiert oder schon gespeichert):
     Emojis, Schmuckschrift, unsichtbare Zeichen, Werbesätze, Hashtags, Tippfehler */
  function tidyRecipe(r) {
    const title = r.title ? capFirst(tidyText(stripSymbols(socialText(r.title))).replace(/[.!,;:]+$/, '')) : r.title;
    const ingredients = (r.ingredients || []).map(l => tidyText(stripSymbols(foodEmoji(socialText(l))).replace(/(^|\s)@[\p{L}\p{N}_.]+/gu, '$1').replace(/#[\p{L}\p{N}_]+/gu, ''))).filter(l => /[\p{L}\p{N}]/u.test(l));
    const steps = (r.steps || []).map(l => stripSymbols(socialText(l)).replace(/#[\p{L}\p{N}_]+/gu, '').replace(/(^|\s)@[\p{L}\p{N}_.]+/gu, '$1'))
      .map(l => capFirst(tidyText(l.split(/(?<=[.!?])\s+/).filter(x => !isFluffLine(x)).join(' ')))).filter(l => /[\p{L}\p{N}]/u.test(l));
    return { title, ingredients, steps, notes: cleanNotes(r.notes, title) };
  }
  function withGuesses(d, category, keywords) {
    // Letzte Sicherung: keine Emojis, Werbesätze, Tippfehler in Name, Zutaten, Schritten und Notizen (egal woher)
    Object.assign(d, tidyRecipe(d));
    const before = JSON.stringify(d.ingredients || []);
    d.ingredients = convertUnits(d.ingredients || []);
    if (JSON.stringify(d.ingredients) !== before) d.unitsConverted = true;
    if (!d.course) d.courseGuessed = !courseSure(d.title, category, keywords, d);
    d.course = d.course || guessCourse(d.title, category, keywords, d);
    d.method = d.method || guessMethod(d.steps, d.title);
    d.mainIngredient = validMain(d.mainIngredient) || mainFor(d);
    // Salat mit nur gekochten/gebratenen Zutaten: wird kalt gegessen -> Sammlung "Kalt"
    if (d.course === 'Salat' && (d.method === 'Kochen' || d.method === 'Braten')) d.method = 'Kalt zubereitet';
    // Suppe wird gekocht, auch wenn vorher etwas angebraten wird
    if (d.course === 'Suppe' && d.method === 'Braten') d.method = 'Kochen';
    return d;
  }

  // ---------- Werbesprüche herausfiltern ----------
  // Lobende Füllwörter, die nichts über das Gericht sagen ("das einfachste", "super lecker", "in 10 Minuten")
  const PRAISE = '(?:super|mega|total|richtig|extra|echt|ganz|unglaublich|wirklich)?\\s*(?:einfach(?:st)?(?:e[nmrs]?)?|schnell(?:st)?(?:e[nmrs]?)?|lecker(?:st)?(?:e[nmrs]?)?|best(?:e[nmrs]?)?|perfekt(?:e[nmrs]?)?|gelingsicher(?:e[nmrs]?)?|genial(?:e[nmrs]?)?|himmlisch(?:e[nmrs]?)?|traumhaft(?:e[nmrs]?)?|ultimativ(?:e[nmrs]?)?|unwiderstehlich(?:e[nmrs]?)?|köstlich(?:e[nmrs]?)?|blitzschnell(?:e[nmrs]?)?|sensationell(?:e[nmrs]?)?|fantastisch(?:e[nmrs]?)?|easy)';
  const FLUFF_SEGMENT = new RegExp('(\\brezept\\b|\\bgrundrezept\\b|\\b' + PRAISE + '\\b|\\bin\\s+\\d+\\s*(min|minuten)\\b|\\bnur\\s+\\d+\\s+zutaten\\b|\\bso\\s+geht\'?s\\b|\\bwie\\s+bei\\s+oma\\b|\\bgarantiert\\b|\\bohne\\s+schnickschnack\\b|\\bschritt\\s+für\\s+schritt\\b|\\bmit\\s+video\\b)', 'iu');
  const GENERIC_SEG = /^(abendessen|mittagessen|frühstück|brunch|feierabend(küche|essen|rezept)?|meal ?prep|familienessen|sonntags(essen|braten)?|reste(verwertung|essen|küche)?|party(rezept|food|snack)?|fingerfood|weihnachts(rezept|essen|bäckerei|plätzchen)?|oster(rezept|brunch)?|soul ?food|comfort ?food|low ?carb|vegan|vegetarisch|glutenfrei|kinderleicht|alltags(rezept|küche)|wochenend(rezept|küche)|one ?pot|dessert|nachtisch|beilage|snack|ofengericht|pfannengericht|sommerrezept|winterrezept)$/iu;
  const LEADING_PRAISE = new RegExp('^(?:(?:das|der|die|mein|meine|unser|unsere)\\s+)?(?:' + PRAISE + '\\s+)+', 'iu');
  // Alle Emojis und Bildzeichen (auch Flaggen, Hautfarben, ⭐ ⬇️ ➡️ ✓ ★ ♡ ® ™), aber nicht ° (Grad)
  const SYM_SRC = '[\\u{1F1E6}-\\u{1F1FF}\\u{1F3FB}-\\u{1F3FF}\\u{E0020}-\\u{E007F}\\uFE0E\\uFE0F\\u200D\\u20E3\\u2022\\u2023\\u2043\\u2219\\u25E6\\u2190-\\u21FF\\u27F0-\\u27FF\\u2900-\\u297F\\u2B00-\\u2BFF]|(?!°)[\\p{Extended_Pictographic}\\p{So}]';
  const EMOJI_RE = new RegExp(SYM_SRC, 'gu');
  const stripSymbols = x => String(x || '').replace(EMOJI_RE, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?)])/g, '$1').replace(/\(\s*\)/g, '').trim();
  // Emoji statt Wort hinter einer Menge ("2 🥚", "1 🍋") -> Wort
  const FOOD_EMOJI = { '🥚': 'Eier', '🍳': 'Eier', '🍌': 'Bananen', '🍋': 'Zitronen', '🍎': 'Äpfel', '🍏': 'Äpfel', '🍐': 'Birnen', '🍊': 'Orangen', '🍓': 'Erdbeeren', '🫐': 'Heidelbeeren', '🍒': 'Kirschen', '🍑': 'Pfirsiche', '🥭': 'Mangos', '🍍': 'Ananas', '🥝': 'Kiwis', '🥥': 'Kokosnuss', '🍅': 'Tomaten', '🥕': 'Karotten', '🥔': 'Kartoffeln', '🧅': 'Zwiebeln', '🧄': 'Knoblauchzehen', '🥒': 'Gurken', '🫑': 'Paprika', '🌶': 'Chilischoten', '🥑': 'Avocados', '🍆': 'Auberginen', '🥦': 'Brokkoli', '🌽': 'Maiskolben', '🍄': 'Champignons', '🧈': 'Butter', '🥛': 'Milch', '🧀': 'Käse', '🍫': 'Schokolade', '🍯': 'Honig', '🧂': 'Salz', '🍞': 'Brot', '🥖': 'Baguette', '🥯': 'Bagels', '🍗': 'Hähnchenschenkel', '🥓': 'Bacon', '🍤': 'Garnelen', '🐟': 'Fisch', '🍝': 'Nudeln', '🍚': 'Reis', '🥜': 'Erdnüsse', '🌰': 'Kastanien' };
  const FOOD_EMOJI_RE = new RegExp('(\\d(?:[.,/]\\d+)?\\s*(?:[½¼¾⅓⅔]\\s*)?(?:g|kg|ml|l|el|tl|stk\\.?|stück|x)?\\s*)(' + Object.keys(FOOD_EMOJI).join('|') + ')\\uFE0F?(?![\\s\\uFE0F]*\\p{L})', 'giu');
  const FOOD_ONE = { 'Eier': 'Ei', 'Bananen': 'Banane', 'Zitronen': 'Zitrone', 'Äpfel': 'Apfel', 'Birnen': 'Birne', 'Orangen': 'Orange', 'Erdbeeren': 'Erdbeere', 'Kirschen': 'Kirsche', 'Pfirsiche': 'Pfirsich', 'Mangos': 'Mango', 'Kiwis': 'Kiwi', 'Tomaten': 'Tomate', 'Karotten': 'Karotte', 'Kartoffeln': 'Kartoffel', 'Zwiebeln': 'Zwiebel', 'Knoblauchzehen': 'Knoblauchzehe', 'Gurken': 'Gurke', 'Chilischoten': 'Chilischote', 'Avocados': 'Avocado', 'Auberginen': 'Aubergine', 'Maiskolben': 'Maiskolben', 'Bagels': 'Bagel', 'Hähnchenschenkel': 'Hähnchenschenkel' };
  const foodEmoji = t => String(t).replace(FOOD_EMOJI_RE, (m, pre, e) => {
    const w = FOOD_EMOJI[e], one = /^\s*1\s*(?:stk\.?|stück|x)?\s*$/i.test(pre);
    return pre.replace(/\s*$/, ' ') + (one && FOOD_ONE[w] ? FOOD_ONE[w] : w);
  });

  /* "Ofenpfannkuchen – das einfachste Rezept" -> "Ofenpfannkuchen"
     "Das einfachste Rezept: Ofenpfannkuchen" -> "Ofenpfannkuchen"
     "Super leckere schnelle Pfannkuchen in 10 Minuten" -> "Pfannkuchen"
     "Spaghetti Carbonara Rezept" -> "Spaghetti Carbonara" */
  // Nur Zusätze ohne Inhalt entfernen ("nach Omas bestem Rezept", "für Kinder und Familie") – auch für gespeicherte Rezepte
  function tidyTitle(t) {
    // "nach Omas bestem Rezept", "wie bei Oma", "nach Mamas Art" … gehören nicht in den Namen
    t = String(t || '').replace(/\s+(?:nach|wie bei|von|à la|a la)\s+(?:(?:meiner|unserer|der)\s+)?(?:omas?|mamas?|großmutters?|großmama|uromas?|muttis?|opas?|papas?)(?:\s+(?:bestem|bestes|bester|beste|liebstem|altem|klassischem|original|geheimem|bewährtem|einfachem|leckerem|leckerstem|traditionellem))?(?:\s+(?:rezept|art|stil|style))?\s*$/iu, '');
    // Zielgruppe gehört nicht in den Namen: "für Kinder und Familie", "für die ganze Familie", "kindgerecht"
    t = t.replace(/\s*[–—-]?\s*\(?\b(?:für|for)\s+(?:die\s+(?:ganze\s+)?|kleine\s+|große\s+(?:und\s+kleine\s+)?)?(?:kinder|kids|babys?|kleinkinder|familien?|groß\s+und\s+klein|jung\s+und\s+alt)(?:\s+(?:und|&|\+)\s+(?:die\s+(?:ganze\s+)?)?(?:kinder|kids|familien?|erwachsene))?\)?(?=\s*$|\s*[–—|,:(])/giu, '')
      .replace(/\s*[–—-]?\s*\(?\b(?:kindgerecht|kinderfreundlich|familienfreundlich|kinderleicht|baby-?led[- ]?weaning|blw)\)?(?=\s*$|\s*[–—|,:(])/giu, '');
    // "Kräuterbutter selber machen", "Brot selbst backen", "Selbstgemachtes Granola"
    t = t.replace(/\s+(?:ganz\s+)?(?:einfach\s+)?(?:selber|selbst)\s+(?:machen|gemacht|herstellen|backen|kochen|zubereiten)\s*$/iu, '')
      .replace(/\s+(?:einfach\s+|schnell\s+)?(?:zubereiten|zubereitet|machen|gemacht)\s*$/iu, '')
      .replace(/^(?:selbst|selber)\s*gemachte[rsn]?\s+(?=\p{L})/iu, '');
    // "15 Minuten Schlemmer One Pot", "5 Zutaten Fladenbrot", "3-Zutaten-Kuchen"
    t = t.replace(/^\d+[\s-]*(?:minuten|min\.?|zutaten)[\s-]+(?=\p{L})/iu, '');
    // "Kinder Nudelsalat" / "Baby Brei" (mit Leerzeichen, nicht "Kinder-Pizza")
    t = t.replace(/^(?:[Kk]inder|[Kk]ids|[Bb]aby|[Ff]amilien)\s+(?=\p{Lu})/u, '');
    // "Besser als vom Bäcker, …" / "… unfassbar lecker!"
    t = t.replace(/^(?:(?:noch\s+)?besser\s+als\s+(?:vom|beim|im|aus\s+dem)\s+[\p{L}-]+|wie\s+(?:vom|beim|im)\s+[\p{L}-]+|der\s+hammer|suchtgefahr)\s*[!,:–—-]+\s*/iu, '');
    const tail = /\s*[,–—-]?\s*(?:(?:super|mega|so+|einfach|unfassbar|unglaublich|richtig|total|wahnsinnig|absolut|extrem|echt|sehr|soo+)\s+)*(?:lecker|köstlich|himmlisch|genial|traumhaft|fantastisch|unwiderstehlich|saulecker|oberlecker|ein\s+traum|der\s+hammer|zum\s+niederknien)\s*!*$/iu;
    if (tail.test(t) && /\p{L}{3,}/u.test(t.replace(tail, ''))) t = t.replace(tail, '');
    return t.replace(/[\s!,]+$/, '').trim();
  }

  function cleanTitle(raw) {
    let t = clean(raw).replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return t;
    // Teile an Trennzeichen; Werbe-Teile weglassen
    const parts = t.split(/\s+[–—|•]\s+|\s+-\s+|:\s+|\s*!\s*/).map(x => x.trim()).filter(Boolean);
    const rest = x => x.replace(new RegExp(FLUFF_SEGMENT.source, 'giu'), '').replace(/\b(das|der|die|für|ein|eine|einfach|so|und|&|mit|ohne|von|aus|zum|zur|alle|jeden|tag)\b/giu, '').replace(/[^\p{L}]+/gu, ' ').trim();
    const fluff = x => FLUFF_SEGMENT.test(x) && rest(x).replace(/\s+/g, '').length < 4;
    // Oberbegriffe statt Gericht ("Schnelles Abendessen: Gnocchi-Pfanne") nur behalten, wenn nichts anderes da ist
    const generic = x => GENERIC_SEG.test(rest(x).toLowerCase());
    let keep = parts.filter(x => !fluff(x));
    if (keep.length > 1) keep = keep.filter(x => !generic(x)).concat(keep.filter(generic));
    t = (keep[0] || parts[0] || t);
    // Lob am Anfang und Rezept/Minuten-Angaben am Ende entfernen
    t = tidyTitle(t);
    t = t.replace(LEADING_PRAISE, '')
      .replace(/\s*\((?:grund)?rezept\)\s*$/iu, '')
      .replace(/\s+(?:grund)?rezept(?:\s+(?:von|nach)\s+.+)?$/iu, '')
      .replace(/^(?:grund)?rezept\s+(?:für\s+)?/iu, '')
      .replace(/\s+in\s+\d+\s*(?:min\.?|minuten)$/iu, '')
      .replace(/\s+(?:der\s+welt|aller\s+zeiten|ever|überhaupt|für\s+jeden\s+(?:tag|anlass))$/iu, '')
      .replace(/[\s,.;:!]+$/, '').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : clean(raw);
  }

  // Sätze ohne Rezeptinhalt am Ende/Anfang von Schritten und Texten
  const FLUFF_LINE = /^(guten appetit|viel spa(ß|ss)|lasst es euch|lass es dir|enjoy|bon app[ée]tit|und fertig|fertig ist|mahlzeit|have fun|happy (baking|cooking)|ich wünsche|wenn (du|ihr) (dieses|das) rezept|hast du (dieses|das) rezept|teile? (gerne )?(dein|ein) foto|markiere mich|folge mir|(und )?für mehr .{0,30}(folg|folge|folgt) mir|speicher(e|t)? (dir )?(das|dieses|den|die) (rezept|post|video|beitrag)|pin(ne)? (es|das rezept)|werbung|anzeige|affiliate|newsletter|link (?:ist )?in (?:der|meiner|unserer) bio|link in bio|(?:das )?rezept (?:steht |findest du |gibt'?s )?(?:unten|im kommentar|in den kommentaren|in der (?:caption|beschreibung|bio)|auf meinem blog)|rezept$|rezept(?:e)? unten$|rezept (?:speichern|merken|pinnen|sichern)|folg(?:e|t)? (?:mir|uns)|abonnier|lass(?:t)? (?:mir |uns )?(?:gerne |doch )?(?:ein(?:en)? )?(?:like|herz|abo|kommentar)|(?:teil|schick|sende)(?:e|t)? (?:das|es|dieses)(?: video| rezept)? (?:mit|an|deine)|markier(?:e|t)? |kommentier(?:e|t)?|speicher(?:e|t)? (?:dir|euch) |(?:unbezahlte |unbeauftragte )?werbung|mehr rezepte|skip to content|zum inhalt springen|menü$|navigation$|suche$|startseite$)/iu;
  const isFluffLine = l => FLUFF_LINE.test(String(l).replace(EMOJI_RE, '').trim()) || /^[\s\p{P}\p{S}]*$/u.test(String(l).replace(EMOJI_RE, ''));
  const cleanIngredientText = l => clean(l).replace(/\(?\*?\s*(affiliate[- ]?link|werbung|anzeige|\*)\s*\)?/giu, ' ').replace(/\s*\*+\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();

  // ---------- Rezeptseite (JSON-LD) ----------
  function fromPage(page) {
    let r = null;
    for (const block of page.jsonld || []) { r = findRecipe(block); if (r) break; }
    if (!r) return null;
    const title = cleanTitle(r.name || r.headline || page.title);
    const ingredients = arr(r.recipeIngredient || r.ingredients).map(cleanIngredientText).filter(Boolean);
    const st = splitSteps(steps(r.recipeInstructions).filter(x => !isFluffLine(x)));
    const sv = servingsFrom(r.recipeYield, title);
    // Die Kurzbeschreibung der Seite ist fast immer Werbung ("Das einfachste Rezept für …") -> nicht übernehmen
    const notes = '';
    const d = {
      title, ingredients, steps: st, notes,
      servings: sv.servings, servingsUnit: sv.servingsUnit, formSize: sv.formSize, servingsGuessed: !!sv.guessed,
      imageUrl: image(r.image) || page.image || '',
      sourceUrl: page.url
    };
    return withGuesses(d, r.recipeCategory, [].concat(arr(r.keywords).join(',').split(','), arr(r.recipeCuisine)));
  }

  // ---------- Freier Text (TikTok-Beschreibung, Text aus Bildschirmfotos) ----------
  const HEAD_ING = /^(zutaten|ingredients?|du brauchst|ihr braucht|für den teig|für die füllung|einkaufsliste)\b[:\s]*$/i;
  const HEAD_STEP = /^(zubereitung|anleitung|so geht'?s|so wird'?s gemacht|instructions?|steps?|method|schritte)\b[:\s]*$/i;
  const EMOJI = EMOJI_RE;
  // Emoji (auch mehrere) direkt vor einer Zahl oder einem großgeschriebenen Wort = Aufzählungszeichen
  const EMOJI_BULLET = new RegExp('[ \\t]*(?:' + SYM_SRC + ')(?:[ \\t]*(?:' + SYM_SRC + '))*[ \\t]*(?=[\\p{Lu}\\d½¼¾⅓])', 'gu');
  // Nummern als Zeichen: 1️⃣ ① ❶ ➊ 🔟 ⑴ ⒈ -> neue Zeile
  const NUM_BULLET = /(?:\d\uFE0F?\u20E3|[\u2460-\u2473\u2474-\u249B\u24EB-\u24FF\u2776-\u2793]|\u{1F51F})[ \t]*/gu;
  // Typische Verben in Zubereitungsschritten (ganze Wörter)
  const STEP_VERB = /(?<![\p{L}])(kochen|durchpressen|pressen|rühren|verrühren|unterrühren|unterheben|würzen|formen|backen|ausbacken|braten|anbraten|schneiden|hacken|geben|mischen|vermischen|vermengen|kneten|schälen|reiben|servieren|garen|köcheln|erhitzen|schmelzen|abgießen|abschrecken|vorheizen|bestreuen|anrichten|füllen|legen|verteilen|stellen|pürieren|aufkochen|abschmecken|fetten|einfetten|wenden|zugeben|hinzufügen|dünsten|anschwitzen|ablöschen|ruhen|abkühlen|abtropfen|zerdrücken|aufschlagen|schlagen)(?![\p{L}])/iu;
  // Lange Absätze in einzelne Schritte teilen: erst nach Sätzen, dann an Kommas nach einem Kochverb
  // ("Kartoffeln weich kochen, durchpressen, Eigelbe … unterheben, würzen, …" -> mehrere Schritte)
  // Erzählstil straffen: "Zuerst nehmen wir …", "– ich hatte einen großen Kohlrabi –", "Zum Schluss nur noch anrichten und genießen!"
  function tidyStep(t) {
    let x = String(t)
      .replace(/\s*[–—]\s*(ich|wir)\b[^–—]*[–—]\s*/gi, ' ')
      .replace(/\s*\((ich|wir)\b[^)]*\)/gi, '')
      .replace(/^(zuerst|zunächst|anschließend|danach|dann|nun|jetzt|als nächstes|zum schluss|im nächsten schritt|als erstes)\s*,?\s+/i, '')
      .replace(/\bnur noch\s+/gi, '')
      .replace(/\s+und\s+(genießen|servieren und genießen|guten appetit)\s*([.!]+)?$/i, '.')
      .replace(/\s{2,}/g, ' ').trim();
    x = x.charAt(0).toUpperCase() + x.slice(1);
    return condense(x);
  }

  // ---------- "wir"-Erzählstil in kurze Anweisungen umschreiben ----------
  // "Nun nehmen wir uns eine Pfanne, geben etwas Öl hinein und schwitzen die Zwiebeln darin an."
  //   -> "Etwas Öl in die Pfanne geben und die Zwiebeln darin anschwitzen."
  const PARTICLES = ['an', 'auf', 'aus', 'ab', 'bei', 'dazu', 'hinzu', 'hinein', 'herein', 'heraus', 'hinaus', 'ein', 'mit', 'nach', 'vor', 'zu', 'zurück', 'weg', 'um', 'unter', 'durch', 'beiseite', 'zusammen', 'fest', 'darüber', 'darauf', 'darunter'];
  const NOT_VERB = /^(einen|den|denen|kleinen|großen|ganzen|frischen|warmen|kalten|heißen|weichen|allen|diesen|einigen|beiden|anderen|guten|braunen|roten|grünen|gelben|weißen|feinen|groben|dünnen|dicken|ersten|zweiten|letzten|restlichen|übrigen|vorbereiteten|geschnittenen|gehackten|gekochten|eigenen|unseren|meinen|deinen|ihren|seinen|oben|unten|wieder|eben|gegen|neben|unter|hinten|gern|gerne|morgen|sondern)$/i;
  const VESSEL = /^(eine?n?|die|der|den|das)\s+(pfanne|topf|schüssel|auflaufform|form|backform|springform|kastenform|blech|backblech|kasserolle|wok|bräter|rührschüssel|schale|mixer|standmixer|glas|kanne|tasse|kochtopf|bratpfanne|pfanne mit .+|großen? \p{L}+|tiefen? \p{L}+)$/iu;
  const FILLER = /\s+(?:schön|einfach|ruhig|mal|ebenfalls|auch|zunächst|nun|jetzt|dann|eben|gerne?|direkt)(?=\s|[,.!]|$)/gi;
  const isVerbWord = (w, next) => /^\p{Ll}+(?:en|ern|eln)$/u.test(w || '') && !NOT_VERB.test(w) && (!(next && /^\p{Lu}/u.test(next)) || STEP_VERB.test(w));
  function verbFinal(verb, rest) {
    let r = rest.replace(/^(?:wir|uns)\s+/i, '').replace(/^uns\s+/i, '').replace(FILLER, '').trim().replace(/^(?:dann|nun|jetzt|zunächst|direkt)\s+/i, '');
    // Pronomen am Anfang ("schneiden sie klein") weglassen
    r = r.replace(/^(?:sie|ihn|es|diese|diesen|dieses)\b\s*/i, '');
    const words = r ? r.split(/\s+/) : [];
    const last = (words[words.length - 1] || '').toLowerCase();
    if (words.length && PARTICLES.includes(last)) { words.pop(); return (words.join(' ') + ' ' + last + verb).trim(); }
    return (r + ' ' + verb).trim();
  }
  function condenseSentence(sen) {
    const end = (sen.match(/[.!?]+$/) || ['.'])[0].replace(/!+/, '.').replace(/\?+/, '.');
    let s = sen.replace(/[.!?]+$/, '').trim();
    // Nebensatz vorn behalten ("Wenn das Gemüse angeschwitzt ist, …")
    let lead = '';
    const sub = s.match(/^((?:wenn|sobald|nachdem|sowie|während)\b[^,]+,)\s*(.+)$/i);
    if (sub) { lead = sub[1].replace(FILLER, '') + ' '; s = sub[2]; }
    // "Wir lassen …" / "Ich gebe …" -> wie "Lassen wir …"
    s = s.replace(/^wir\s+(\p{Ll}+)\s+/iu, (a, v) => v + ' wir ')
      .replace(/^ich\s+(\p{Ll}+e)\s+/iu, (a, v) => v + 'n wir ')
      .replace(/^(\p{L}+e)\s+ich\s+/u, (a, v) => v + 'n wir ');
    let m = s.match(/^(\p{L}+)\s+wir\s+(.*)$/iu);
    let head = null;
    if (!m) {
      // "Das Gemüse stellen wir beiseite" -> Objekt vorn
      const v2 = s.match(/^(.+?)\s+(\p{Ll}+(?:en|ern|eln))\s+wir\s+(.*)$/u);
      if (!v2) return null;
      head = { verb: v2[2], rest: v2[1].replace(/^(\p{Lu})/u, c => c.toLowerCase()) + ' ' + v2[3] };
      // Artikel am Satzanfang wieder groß
      head.rest = head.rest.replace(/^(\p{L})/u, c => c.toUpperCase());
    }
    const verb0 = head ? head.verb : m[1].toLowerCase();
    let rest = head ? head.rest : m[2];
    // Teilsätze an ", verb" und " und verb" trennen
    const clauses = [{ verb: verb0, text: '' }];
    const toks = rest.split(/(\s*,\s*|\s+und\s+)/);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (/^(\s*,\s*|\s+und\s+)$/.test(t)) {
        const nxt = (toks[i + 1] || '').trim().split(/\s+/);
        if (isVerbWord(nxt[0], nxt[1])) {
          clauses.push({ verb: nxt[0], text: nxt.slice(1).join(' '), sep: /und/.test(t) ? 'und' : ',' });
          i++; continue;
        }
        clauses[clauses.length - 1].text += t;
      } else clauses[clauses.length - 1].text += t;
    }
    // "nehmen wir uns X" verschmilzt mit dem nächsten Schritt
    const out = [];
    for (let i = 0; i < clauses.length; i++) {
      const c = clauses[i];
      const obj = c.text.replace(/^(?:wir|uns)\s+/i, '').replace(/^uns\s+/i, '').trim();
      if (c.verb === 'nehmen' && clauses[i + 1]) {
        const n = clauses[i + 1];
        if (VESSEL.test(obj) && /\bhinein$/.test(n.text.trim())) {
          n.text = n.text.trim().replace(/\s*hinein$/, ' in ' + obj.replace(/^(eine?n?)\s+/i, 'die ').replace(/^den\s+/i, 'den '));
          n.text = n.text.replace(/in die (topf|bräter|wok|mixer|standmixer|kochtopf)\b/i, 'in den $1').replace(/in die (glas|blech|backblech)\b/i, 'in das $1');
        } else if (!/^(?:sie|ihn|es)\b/i.test(n.text.trim()) && n.text.trim()) {
          if (VESSEL.test(obj)) {
            // "nehmen wir uns eine Schüssel und vermischen Mehl …" -> "In einer Schüssel Mehl … vermischen"
            n.prefix = 'In ' + obj.replace(/^eine\s+/i, 'einer ').replace(/^eine?n?\s+/i, 'einem ').replace(/^die\s+/i, 'der ').replace(/^den\s+/i, 'dem ') + ' ';
          } else out.push(obj.replace(/^(eine?n?|die|der|den|das)\s+/i, '') + ' bereitstellen');
        } else {
          n.text = obj.replace(/^(eine?n?|die|der|den|das)\s+/i, '') + ' ' + n.text.trim().replace(/^(?:sie|ihn|es)\b\s*/i, '');
        }
        continue;
      }
      out.push((c.prefix || '') + verbFinal(c.verb, obj));
    }
    const parts = out.filter(Boolean);
    let res = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1] : (parts[0] || '');
    res = (lead + res).replace(/\s{2,}/g, ' ').trim();
    res = res.replace(/^(eine?n?|die|der|den|das)\s+(?=\p{Lu})/iu, '');
    return res.charAt(0).toUpperCase() + res.slice(1) + end;
  }
  function condense(step) {
    // Überall: "und schneiden sie (auch) in Stücke" -> "und in Stücke schneiden"; Füllwörter wie "das Ganze", "schön"
    step = step.split(/(?<=[.!?])\s+/).map(sen => sen
      .replace(/\bund\s+(\p{Ll}+(?:en|eln|ern))\s+(?:sie|ihn|es)\b(?:\s+(?:auch|ebenfalls|dann))?\s+([^.!?,]+?)([.!?]?)$/u, (all, v, rest, e) => isVerbWord(v) && !/\bwir\b/.test(sen) ? 'und ' + verbFinal(v, rest) + e : all)
      .replace(/\s+das Ganze\b/g, '')
      .replace(/\s+(?:schön|einfach|ruhig)\s+(?=\p{Ll})/gu, ' ')
    ).join(' ');
    if (!/\b(wir|ich)\b/i.test(step)) return step;
    return step.split(/(?<=[.!?])\s+/).map(sen => {
      if (!/\b(wir|ich)\b/i.test(sen)) return sen;
      try { return condenseSentence(sen) || sen; } catch (e) { return sen; }
    }).join(' ');
  }

  function splitSteps(list) {
    const out = [];
    const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
    for (const step of list) {
      // Pro Satz ein Schritt (aber nicht nach Abkürzungen wie "ca.", "z. B.", "Std.")
      const sentences = step.split(/(?<![\s(]\p{L}\.)(?<!\b(?:ca|bzw|evtl|ggf|ggfs|usw|etc|Std|Min|min|max|Nr|vgl|inkl|zzgl|gem|geh|gestr|TL|EL|Pck|Pkg)\.)(?<=[.!?])\s+(?=\p{Lu})/u);
      if (sentences.length === 1 && step.length < 120) { out.push(step); continue; }
      for (const sen of sentences) {
        if (sen.length < 90) { out.push(cap(sen)); continue; }
        const end = (sen.match(/[.!?]$/) || [''])[0];
        const parts = sen.replace(/[.!?]$/, '').split(/,\s+/);
        const segs = [];
        let cur = '';
        for (const part of parts) {
          cur = cur ? cur + ', ' + part : part;
          const last = cur.split(/\s+/).pop();
          if (STEP_VERB.test(last) && new RegExp('^' + STEP_VERB.source + '$', 'iu').test(last)) { segs.push(cur); cur = ''; }
        }
        if (cur) { if (segs.length) segs[segs.length - 1] += ', ' + cur; else segs.push(cur); }
        // Einzelwörter ("durchpressen", "würzen") gehören zum Schritt davor
        const merged = [];
        for (const sg of segs) {
          if (merged.length && sg.split(/\s+/).length <= 2) merged[merged.length - 1] += ', ' + sg;
          else merged.push(sg);
        }
        if (merged.length < 2) { out.push(cap(sen)); continue; }
        merged.forEach(m => out.push(cap(m) + (end || '.')));
      }
    }
    return out;
  }

  // Lange Notizen nur am Satz- oder Zeilenende kürzen, nie mitten im Wort
  function cutNotes(t, max) {
    if (t.length <= max) return t;
    const part = t.slice(0, max);
    const end = Math.max(part.lastIndexOf('\n'), part.search(/[.!?][^.!?]*$/) + 1);
    return (end > max * 0.5 ? part.slice(0, end) : part.replace(/\s+\S*$/, '')).trim() + ' …';
  }

  function fromText(text, hint) {
    const d = fromTextInner(text, hint);
    // Originaltext merken: werden die Regeln besser, liest die App das Rezept damit neu ein
    const h = {};
    for (const k of ['title', 'image', 'url', 'ocr']) if (hint && hint[k]) h[k] = hint[k];
    d.importSource = { kind: 'text', text: String(text || '').slice(0, SRC_MAX), hint: h };
    return d;
  }
  function fromTextInner(text, hint) {
    hint = hint || {};
    // Einzeiliger Text (TikTok): doppelte Leerzeichen sind ehemalige Zeilenumbrüche
    text = socialText(text);
    if (!/\n/.test(text)) text = text.replace(/ {2,}/g, '\n');
    let lines = foodEmoji(text)
      // Zahl-Emojis (1️⃣ ① ❶) und Aufzählungszeichen mitten im Text -> neue Zeile
      .replace(NUM_BULLET, '\n')
      // Pfeile und Striche als Aufzählung ("-> 200 g Mehl", "=> Teig kneten", "— 1 Ei")
      .replace(/(^|\s)(?:->|=>|>>|~>)\s*(?=[\p{Lu}\d½¼¾⅓])|(^|\s)[–—-]\s+(?=\d|[½¼¾⅓])/gmu, '\n')
      .replace(/[’`´]/g, "'")
      // Emojis als Aufzählungszeichen ("🤎40 g Haferflocken 🤎150 ml Sojamilch") -> neue Zeile
      .replace(EMOJI_BULLET, '\n')
      .replace(EMOJI, ' ')
      .replace(/\s[*•·▪︎]\s+/g, '\n')
      // "… Zutaten: 3 Bananen, … Zubereitung: …" -> eigene Zeilen
      .replace(/\s*\b(zutaten|ingredients|zubereitung|anleitung|so geht'?s|instructions)\s*:/gi, '\n$1:')
      // "… Zutaten für 1 Blech: …" -> eigene Überschrift-Zeile
      .replace(/\s*\b((?:zutaten|ingredients)\s+(?:für|for)\s+[^:\n.]{1,25}):/gi, '\n$1:\n')
      // Kurze Zwischenüberschrift nach Satzende ("… (ca. 4 EL) Das steckt drin: …", "… wird. Haltbarkeit: …")
      .replace(/(?<=[.!?)\]])\s+((?:[\p{L}\d-]+ ){0,5}[\p{L}-]+:)(?=\s|$)/gu, '\n$1\n')
      // Zwischenüberschriften ohne Doppelpunkt mitten im Fließtext ("… Prise Zimt Topping …", "… vermischt So geht's 1. …")
      .replace(/\s+(?=(?:so geht'?s|so wird'?s gemacht|zubereitung|anleitung)\b(?!\s*:))/gi, '\n')
      .replace(/\b(so geht'?s|so wird'?s gemacht)\s+(?=\d{1,2}\.\s)/gi, '$1\n')
      .split(/\r?\n|(?<=[.!)])\s+(?=\d{1,2}[.)]\s)|\s(?=\d{1,2}\.\s+\p{Lu})/u)
      .map(l => l.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/(^|\s)@[\p{L}\p{N}_.]+/gu, '$1').replace(/^[\s•·*\-–—>]+/, '').replace(/\s+/g, ' ').trim())
      // Trennlinien und Zeilen nur aus Zeichen ("━━━━", "~~~", "・゜・", "…") weglassen
      .filter(l => l && !/^@\w/.test(l) && /[\p{L}\p{N}]/u.test(l));
    let title = hint.title || '';
    const ingredients = [], st = [], other = [];
    let mode = '';
    let servingsFound = 0;
    let skipAd = 0;
    // Gibt es eine Überschrift "Zutaten", ist alles davor Einleitung ("12 Minuten backen, 335 kcal …")
    const hasIngHead = lines.some(l => HEAD_ING.test(l) || /^(zutaten|ingredients?)\b/i.test(l));
    for (const raw of lines) {
      let l = raw;
      // Seitenende (Teilen-Knöpfe, "Über uns", Kommentare …): hier hört das Rezept auf
      if ((ingredients.length || st.length) && /^(mit (?:familie|freunden).{0,30}teilen|(?:rezept )?teilen\b|share\b|über uns|kürzliche (?:posts|beiträge)|ähnliche (?:beiträge|rezepte)|neueste (?:beiträge|rezepte)|kommentare?\b|\d+ kommentare|hinterlasse einen kommentar|schreibe einen kommentar|related|tags:|schlagwörter|kategorien?:|copyright|©|impressum|datenschutz|newsletter|zurück zur übersicht|zurück zu allen|drucken$|skip to content)/i.test(l)) break;
      // Werbung mitten im Rezept ("Probieren Sie auch: Nehmen Sie 1 Apfel …"): Überschrift und nächste Zeile überspringen
      if (skipAd) { skipAd--; continue; }
      if (/^(probieren sie auch|probier(?:e|t)? auch|das könnte (?:dich|sie|euch) auch interessieren|lesen sie auch|lies auch|auch lecker|weitere rezepte|mehr rezepte|ähnliche rezepte|passend dazu)\b.{0,40}:?$/i.test(l)) { skipAd = 1; continue; }
      if (/^(werbung|anzeige|\*?affiliate)\b/i.test(l)) continue;
      // Zwischenüberschrift bei den Zutaten ("Für die Streusel:", auch mit Tippfehler "Fur die …") -> weiter Zutaten
      if (/^(für|fur|fuer|for|zum|zur)\s+(?:den|die|das|the)?\s*[\p{L} -]{2,30}:$/iu.test(l) && (mode === 'ing' || ingredients.length)) { mode = 'ing'; continue; }
      if (/^(topping|toppings|deko|dekoration|garnitur|teig|boden|füllung|creme|soße|sauce|dressing|glasur|streusel|marinade|für das topping|für die soße|für den teig)\s*:?$/i.test(l) && (mode === 'ing' || ingredients.length)) { mode = 'ing'; continue; }
      // Nummerierter Schritt nach einem Einschub -> wieder Zubereitung
      if (mode === 'other' && st.length && /^\d{1,2}[.)]\s/.test(l)) mode = 'step';
      const inlineHead = l.match(/^(zutaten|ingredients?|zubereitung|anleitung|so geht'?s)\s*:\s*(.+)$/i);
      if (inlineHead) {
        mode = /zut|ingr/i.test(inlineHead[1]) ? 'ing' : 'step';
        l = inlineHead[2];
        // Zutaten als Komma-Liste in einer Zeile
        if (mode === 'ing' && /[,;]/.test(l)) {
          l.replace(/[.]\s*$/, '').split(/\s*[,;]\s*/).filter(Boolean).forEach(x => ingredients.push(Sc.normalizeIngredient(x)));
          continue;
        }
      }
      else if (HEAD_ING.test(l)) { mode = 'ing'; continue; }
      else if (HEAD_STEP.test(l)) { mode = 'step'; continue; }
      // Andere Zwischenüberschrift ("Das steckt drin:", "Haltbarkeit:") -> Begleittext, keine Zutaten/Schritte
      else if (/:$/.test(l) && l.split(' ').length <= 6 && !/^(für|for)\b/i.test(l) && !/\d/.test(l)) { mode = 'other'; other.push(l); continue; }
      // "ZUTATEN für etwa 16 Plätzchen" -> Überschrift (mit Mengenangabe)
      else if (/^(zutaten|ingredients?)\b/i.test(l)) {
        mode = 'ing';
        const y = l.match(/(\d{1,3})\s*(portionen|portion|personen|person|pers\.?|stück|stk\.?|plätzchen|muffins|gläser|bleche?|servings?)/i);
        if (y && !servingsFound) servingsFound = { n: parseInt(y[1], 10), unit: y[2] };
        continue;
      }
      // Bildschirmfoto: "Teil 7 Kartoffelplätzchen" ist der Rezeptname einer Serie
      if (!hint.ocr && /^te[il]l\s*\d+\s*([|:–-]|$)/i.test(l)) continue;
      if (hint.ocr && !title) { const m = l.match(/\bte[il]l\s*\d+\s*[|:–-]?\s*(\p{L}.+)$/iu); if (m) { title = m[1]; continue; } }
      // "4 Portionen" -> Portionsangabe, keine Zutat
      const sv = l.match(/^(?:für\s+)?(\d{1,3})\s*(portionen|personen|pers\.?|servings?)\.?$/i);
      if (sv) { servingsFound = { n: parseInt(sv[1], 10), unit: 'Personen' }; continue; }

      if (hint.ocr) l = l.replace(/^(etwa|ca\.?|circa)\s+(?=\d)/i, '');
      l = l.replace(/\s*\((?:ich|wir)\b[^)]*\)/gi, '').trim();
      if (hasIngHead && mode === '' ) { other.push(l); continue; }
      const norm = Sc.normalizeIngredient(l);
      const p = Sc.parseIngredient(norm);
      const hasVerb = STEP_VERB.test(l) && !p.amount && l.split(' ').length >= 3;
      const numbered = /^\d{1,2}[.)]\s/.test(l);
      const prevIng = ingredients[ingredients.length - 1];
      const prevStep = st[st.length - 1];

      // Fortsetzung einer umbrochenen Zeile
      if (mode === 'step' && prevStep && !numbered && !/[.!?:]$/.test(prevStep)) { st[st.length - 1] = prevStep + ' ' + l; continue; }
      if (hint.ocr && mode === 'ing' && prevIng && !p.amount && !hasVerb && !/^(etwas|eine?\s|prise|salz|pfeffer|nach belieben|n\.\s?b\.)/i.test(l) &&
          (/[,(/-]$/.test(prevIng) || /\b(ohne|mit|und|oder|in|aus|für|à|ca\.?|etwa)$/i.test(prevIng) || /^\p{Ll}/u.test(l))) {
        ingredients[ingredients.length - 1] = prevIng + ' ' + l; continue;
      }

      // Kochverb ohne Mengenangabe -> Zubereitung beginnt (auch ohne Überschrift)
      if (mode === 'other') { other.push(l); continue; }
      if (numbered || (hasVerb && (mode === 'ing' || ingredients.length))) {
        mode = 'step';
        st.push(l.replace(/^\d{1,2}[.)]\s*/, ''));
        continue;
      }
      const looksIngredient = !!p.amount && p.name && /\p{L}{2}/u.test(p.name) && p.name.split(' ').length <= 8 && !/[.!?]$/.test(l);
      if (mode === 'ing' && !/[.!?]$/.test(l)) ingredients.push(norm);
      else if (mode !== 'step' && looksIngredient) ingredients.push(norm);
      else if (mode === 'step') st.push(l);
      else other.push(l);
    }
    // Rezeptname bei Bildschirmfotos: "Teil 7 | Kartoffelplätzchen" -> "Kartoffelplätzchen";
    // sonst die erste Zeile, die nicht nur aus Großbuchstaben besteht (Serientitel wie "WAS MEINE KINDER LIEBEN")
    if (!title && hint.ocr) {
      for (const o of other) { const m = o.match(/\bte[il]l\s*\d+\s*[|:–-]?\s*(.+)$/i); if (m) { title = m[1]; break; } }
      if (!title) { const m = other.join(' ').match(/schmeckt wie (?:eine?n? )?([\p{L}-]{4,})\b.{0,40}?\bals (?:eine?n? )?([\p{L}-]{3,})/iu); if (m) title = m[1] + '-' + m[2]; }
      if (!title) title = other.find(o => o !== o.toUpperCase() && o.split(' ').length <= 5 && !/[,.!?]$|,/.test(o)) || '';
    }
    // Nur Fließtext mit Arbeitsschritten (keine Zutatenliste): die Sätze mit Kochverben als Schritte nehmen
    if (!ingredients.length && !st.length) {
      const verbs = other.filter(o => STEP_VERB.test(o) && o.split(' ').length >= 4);
      if (verbs.length) { verbs.forEach(v => { st.push(v); other.splice(other.indexOf(v), 1); }); }
    }
    if (!title) { const k = other.findIndex(o => !isFluffLine(o)); title = (k >= 0 ? other.splice(k, 1)[0] : '').replace(/[:!]+$/, '').slice(0, 80); }
    title = cleanTitle(title);
    const sameAsTitle = x => title && String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === String(title).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    for (let i = other.length - 1; i >= 0; i--) {
      if (isFluffLine(other[i]) || sameAsTitle(other[i]) || sameAsTitle(cleanTitle(other[i]))) { other.splice(i, 1); continue; }
      // Werbesätze auch mitten in einer Zeile entfernen ("… Snack! Speichere dir das Rezept …! Folg mir")
      const kept = other[i].split(/(?<=[.!?])\s+/).filter(x => !isFluffLine(x)).join(' ');
      if (kept) other[i] = kept; else other.splice(i, 1);
    }
    for (let i = st.length - 1; i >= 0; i--) if (isFluffLine(st[i])) st.splice(i, 1);
    const d = {
      title: title || 'Importiertes Rezept', ingredients, steps: splitSteps(st.map(tidyStep)).filter(x => /\p{L}{2}/u.test(x)).filter(x => x && !/^(anrichten|servieren)?[.!]*$/i.test(x) || /^(anrichten|servieren)/i.test(x)),
      notes: hint.ocr ? '' : cutNotes(other.join('\n'), 3000), // bei Fotos ist der Rest meist Begleittext
      servings: 4, servingsUnit: 'Personen', formSize: '',
      imageUrl: hint.image || '', sourceUrl: hint.url || ''
    };
    const sv = String(text).match(/(?:für|for)\s+(\d{1,2})\s*(personen|portionen|pers\.?|servings?|people)/i);
    if (servingsFound) {
      d.servings = servingsFound.n;
      d.servingsUnit = /stück|stk|plätzchen|muffins/i.test(servingsFound.unit) ? 'Stück' : /gläser/i.test(servingsFound.unit) ? 'Gläser' : /blech/i.test(servingsFound.unit) ? 'Blech' : 'Personen';
    } else if (sv) d.servings = parseInt(sv[1], 10);
    else d.servingsGuessed = true;
    return withGuesses(d, [], [d.notes || '']); // Begleittext ("… zum Frühstück") hilft beim Raten der Rezeptart
  }

  // Ergebnis des Server-Programms -> Entwurf (oder null, wenn kein Rezept erkennbar)
  // Nur das Nötige aufheben (das Rezept aus der Seite, nicht die ganze Seite)
  const SRC_MAX = 15000;
  function compactRes(res, how) {
    const out = {};
    for (const k of ['kind', 'url', 'title', 'image', 'link', 'pinImage']) if (res[k]) out[k] = String(res[k]).slice(0, 2000);
    if (res.kind === 'page') {
      let node = null;
      for (const block of res.jsonld || []) { node = findRecipe(block); if (node) break; }
      if (node && how === 'page') {
        const keep = {};
        for (const k of ['@type', 'name', 'headline', 'recipeIngredient', 'ingredients', 'recipeInstructions', 'recipeYield', 'recipeCategory', 'recipeCuisine', 'keywords', 'totalTime', 'prepTime', 'cookTime', 'image', 'description']) if (node[k] != null) keep[k] = node[k];
        out.jsonld = [keep];
      } else out.jsonld = [];
      if (how === 'text') out.text = String(res.text || '').slice(0, SRC_MAX);
      if (how === 'pin') out.pinText = String(res.pinText || '').slice(0, SRC_MAX);
    } else if (res.text) out.text = String(res.text).slice(0, SRC_MAX);
    return out;
  }
  function toDraft(res) {
    const r = toDraftInner(res);
    if (r && r.draft) {
      try { const src = compactRes(res, r.how); if (JSON.stringify(src).length < SRC_MAX * 2) r.draft.importSource = { kind: 'res', res: src }; else delete r.draft.importSource; } catch (e) { delete r.draft.importSource; }
    }
    return r;
  }
  // Rezept aus dem gemerkten Original mit den aktuellen Regeln neu einlesen
  function rebuild(src) {
    if (!src) return null;
    if (src.kind === 'res') { const r = toDraftInner(src.res); return r && r.draft; }
    if (src.kind === 'text') return fromTextInner(src.text, src.hint);
    if (src.kind === 'rk') return window.RecipeKeeper ? window.RecipeKeeper.toDraft(src.raw) : undefined; // undefined = noch nicht geladen
    return null;
  }
  function toDraftInner(res) {
    if (!res) return null;
    if (res.kind === 'page') {
      const d = fromPage(res);
      if (d && (d.ingredients.length || d.steps.length)) return { draft: d, how: 'page' };
      // Keine Rezeptangaben: mit dem sichtbaren Text versuchen
      const t = fromText(res.text || '', { title: res.title, image: res.image, url: res.url });
      if (t.ingredients.length >= 2) return { draft: t, how: 'text' };
      // Von Pinterest gekommen, Zielseite ohne Rezept: Beschreibung des Pins versuchen
      if (res.pinText) {
        const p = fromText(res.pinText, { image: res.pinImage || res.image, url: res.url });
        if (p.ingredients.length) return { draft: p, how: 'pin' };
      }
      return null;
    }
    if (res.kind === 'pin') {
      const t = fromText(res.text || '', { image: res.image, url: res.link || res.url });
      return { draft: t, how: t.ingredients.length ? 'pin' : 'pin-empty' };
    }
    if (res.kind === 'tiktok' || res.kind === 'social') {
      const t = fromText(res.text || '', { image: res.image, url: res.url });
      return { draft: t, how: t.ingredients.length || t.steps.length ? 'tiktok' : 'tiktok-empty' };
    }
    return null;
  }

  // ---------- Pinterest-Pinnwand (Antwort der Widget-Schnittstelle) ----------
  function boardSlug(name) {
    return String(name || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
  }
  function decode(s) {
    const t = document.createElement('textarea');
    t.innerHTML = String(s || '');
    return t.value;
  }
  function cleanLink(raw) {
    if (!raw) return '';
    try {
      const u = new URL(decode(raw));
      if (!/^https?:$/.test(u.protocol)) return '';
      for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mibextid)/i.test(k)) u.searchParams.delete(k);
      return u.toString().replace(/\?$/, '');
    } catch (e) { return ''; }
  }
  function boardFromWidget(data, boardName) {
    if (!data || data.status !== 'success' || !data.data) return null;
    const b = data.data.board || {};
    const pins = (data.data.pins || []).map(p => {
      const imgs = p.images || {};
      return {
        id: String(p.id || ''),
        url: 'https://www.pinterest.com/pin/' + p.id + '/',
        link: cleanLink(p.link),
        text: decode([p.title, p.description].filter(Boolean).join('\n')),
        image: (imgs['736x'] || imgs['564x'] || imgs['237x'] || {}).url || ''
      };
    }).filter(p => p.id);
    return { board: { name: decode(b.name || boardName), count: b.pin_count || pins.length }, pins };
  }
  // Direkt vom Gerät abrufen (Pinterest erlaubt das); klappt das nicht, über den Online-Speicher
  async function loadBoard(user, board, viaServer) {
    const u = String(user || '').trim().replace(/^@/, '').toLowerCase();
    const slug = boardSlug(board);
    try {
      const r = await fetch('https://widgets.pinterest.com/v3/pidgets/boards/' + encodeURIComponent(u) + '/' + encodeURIComponent(slug) + '/pins/', { cache: 'no-store' });
      const res = boardFromWidget(await r.json(), board);
      if (res && res.pins.length) return res;
    } catch (e) { /* über den Server versuchen */ }
    if (viaServer) return viaServer(u, board);
    throw new Error('Pinnwand nicht gefunden. Stimmen Name und Pinnwand, und ist sie öffentlich?');
  }

  // Schritte aus einer anderen App: Nummern weg, leere weg, Erzählstil straffen, pro Satz ein Schritt
  const cleanSteps = list => splitSteps(arr(list).map(x => clean(x).replace(/^\d{1,2}[.)]\s*/, '')).filter(Boolean).map(tidyStep));
  window.RecipeImporter = { tidyRecipe, fixSpelling, rebuild, socialText, stripSymbols, isSubheading, mainFor, cleanSteps, withGuesses, reviewHints, convertUnits, tidyTitle, validMain, boardSlug, boardFromWidget, loadBoard, cleanLink, findRecipe, steps, servingsFrom, fromPage, fromText, toDraft, guessCourse, guessMethod, guessMain, clean, cleanTitle, isFluffLine };
})();
