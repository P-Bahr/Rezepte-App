/* Import: wandelt abgerufene Rezeptseiten (schema.org/JSON-LD) oder freien Text
   (TikTok-Beschreibung, später Text aus Bildschirmfotos) in einen Rezeptentwurf um.
   Läuft komplett in der App; das Server-Programm liefert nur die Rohdaten. */
(function () {
  'use strict';
  const Sc = window.RecipeScale;
  const F = window.RecipeForms;

  // ---------- Hilfen ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function clean(s) {
    return String(s == null ? '' : s)
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
      const m = c.match(/(\d+(?:[.,]\d+)?)\s*([A-Za-zÄÖÜäöüß]+)?/);
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
      if (!F.UNITS.includes(unit)) unit = 'Personen';
      return { servings: n, servingsUnit: unit, formSize };
    }
    return { servings: 4, servingsUnit: 'Personen', formSize: '' };
  }

  // ---------- Kategorien erraten (einfache Regeln; wird später durch die Mini-KI ersetzt) ----------
  const COURSE_RULES = [
    ['Getränk', /\b(smoothie|lassi|cocktail|limonade|getränk|drink|shake|punsch|glühwein|eistee|kaffee|latte)\b/i],
    ['Frühstück', /\b(frühstück|porridge|overnight oats|müsli|granola|pancakes?|pfannkuchen|omelett|rührei|breakfast)\b/i],
    ['Gebäck', /(kuchen|torte|brot\b|brötchen|muffins?|plätzchen|kekse?|cookies?|brownies?|zopf|tarte|strudel|waffeln|cake|bread)/i],
    ['Dessert', /\b(dessert|nachtisch|mousse|pudding|tiramisu|panna cotta|eis\b|creme brulee|crème|kompott|parfait)\b/i],
    ['Suppe', /(suppe|eintopf|soup|chili con carne)/i],
    ['Salat', /\b(salat|salad|bowl)\b/i],
    ['Sauce & Dip', /\b(sauce|soße|dip|pesto|dressing|aioli|hummus|guacamole|chutney)\b/i],
    ['Beilage', /\b(beilage|kartoffelgratin|püree|pommes|ofenkartoffeln|reis|side)\b/i],
    ['Vorspeise', /\b(vorspeise|antipasti|bruschetta|starter|appetizer)\b/i],
    ['Snack', /\b(snack|fingerfood|häppchen|wraps?)\b/i]
  ];
  const CATEGORY_MAP = [
    [/haupt|main|dinner|abendessen|mittagessen|lunch/i, 'Hauptgericht'], [/dessert|nachspeise|nachtisch|süßspeise/i, 'Dessert'],
    [/kuchen|torte|backen|gebäck|baking|cake|brot/i, 'Gebäck'], [/suppe|soup|eintopf/i, 'Suppe'], [/salat|salad/i, 'Salat'],
    [/vorspeise|starter|appetizer/i, 'Vorspeise'], [/beilage|side/i, 'Beilage'], [/frühstück|breakfast|brunch/i, 'Frühstück'],
    [/getränk|drink|beverage/i, 'Getränk'], [/snack/i, 'Snack'], [/sauce|soße|dip/i, 'Sauce & Dip']
  ];
  function guessCourse(title, category, keywords) {
    for (const c of arr(category)) for (const [re, v] of CATEGORY_MAP) if (re.test(clean(c))) return v;
    const hay = title + ' ' + arr(keywords).join(' ');
    for (const [v, re] of COURSE_RULES) if (re.test(hay)) return v;
    return 'Hauptgericht';
  }
  function guessMethod(stepsList, title) {
    const t = (title + ' ' + stepsList.join(' ')).toLowerCase();
    const score = {
      Backen: (t.match(/\b(backen|backofen|ofen|überbacken|gratin|°c|grad|umluft|ober-\/unterhitze)/g) || []).length,
      Braten: (t.match(/\b(braten|anbraten|pfanne|wok|rösten)/g) || []).length,
      Kochen: (t.match(/\b(koch(en|t|end\w*)|köcheln|garen|aufkochen|sieden|topf|salzwasser)/g) || []).length,
      Schmoren: (t.match(/\bschmor/g) || []).length * 2,
      Grillen: (t.match(/\bgrill/g) || []).length * 2,
      Frittieren: (t.match(/\bfrittier/g) || []).length * 2,
      'Heißluftfritteuse': (t.match(/heißluftfritteuse|airfryer|air fryer/g) || []).length * 3
    };
    let best = 'Kalt zubereitet', max = 0;
    for (const k in score) if (score[k] > max) { best = k; max = score[k]; }
    return best;
  }
  // Hauptzutat: die mengenmäßig größte Zutat, Grundzutaten ausgenommen
  // Grundzutaten: auch als Wortende ("Gemüsebrühe", "Puderzucker", "Olivenöl")
  const STAPLE_END = /(salz|pfeffer|zucker|wasser|öl|butter|mehl|backpulver|natron|hefe|essig|gewürz|gewürze|brühe|fond|milch|sahne|kräuter|zimt|muskat|honig|senf|pulver)$/i;
  const STAPLE_WORD = /^(knoblauch|knoblauchzehen?|zehen?|zwiebeln?|ei|eier|eigelb|eiweiß|petersilie|schnittlauch|chili|chiliflocken|vanilleschote|lorbeerblätter?|thymian|rosmarin|basilikum|dill)$/i;
  // Hauptwort einer Zutat: vor Komma/Klammer, letztes Wort ("300 g Bergkäse, gerieben" -> "Bergkäse")
  function noun(name) {
    const words = String(name).split(/[,(]/)[0].trim().split(/\s+/).filter(Boolean);
    return words[words.length - 1] || '';
  }
  const isStaple = name => { const n = noun(name).toLowerCase(); return !n || STAPLE_END.test(n) || STAPLE_WORD.test(n); };
  // Hauptzutat aus dem Rezeptnamen: "Kohlrabi-Karotten-Nudeln" -> Nudeln (das Grundwort steht hinten),
  // "Hähnchen mit Reis" -> Hähnchen (vor "mit" steht das Gericht), "Kartoffelplätzchen" -> Kartoffeln
  function mainFromTitle(ingredients, title) {
    const head = String(title || '').toLowerCase().split(/\s+(?:mit|an|auf|in|und|im|vom|aus|nach|à la|a la)\s+/)[0];
    if (!head) return '';
    let best = '', bestPos = -1;
    for (const line of ingredients) {
      const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
      if (!p.name || isStaple(p.name)) continue;
      const name = p.name.replace(/\s+(nach (wahl|belieben|geschmack)|zum \p{L}+|für \p{L}+.*)$/iu, '');
      const stemOf = x => x.toLowerCase().replace(/(innen|en|n|e|s)$/, '');
      const headWords = head.split(/[\s-]+/).filter(w => w.length >= 4);
      for (const word of name.split(/[\s,]+/).filter(w => /^\p{Lu}/u.test(w))) {
        const n = word.toLowerCase();
        if (/rezept|kinder|familie|essen$|ideen|gericht|küche/.test(n)) continue;
        const stem = stemOf(n);
        if (stem.length < 3) continue;
        let pos = head.lastIndexOf(stem);
        // "Lachs auf Spinat" + "Lachsfilets": Zutat beginnt mit einem Wort aus dem Namen
        if (pos < 0) for (const w of headWords) if (n.startsWith(stemOf(w))) pos = Math.max(pos, head.lastIndexOf(w));
        if (pos > bestPos) { bestPos = pos; best = p.name; }
      }
    }
    return best;
  }

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
      if (u === 'kg' || u === 'l') g *= 1000; else if (u === 'g' || u === 'ml') g *= 1; else if (!u) g *= 120; else g *= 15;
      const score = g - i; // bei Gleichstand: weiter oben gewinnt
      if (score > bestScore) { bestScore = score; best = p.name; }
    });
    if (!best) return '';
    // "Hähnchenbrustfilets" -> "Hähnchen", "festkochende Kartoffeln" -> "Kartoffeln"
    const w = noun(best) || best;
    const MAP = [[/hähnchen|huhn|hühner|chicken/i, 'Hähnchen'], [/rind/i, 'Rind'], [/schwein/i, 'Schwein'], [/hack/i, 'Hackfleisch'], [/lachs/i, 'Lachs'], [/garnele|shrimp/i, 'Garnelen'], [/nudel|spaghetti|pasta|penne|linguine|tagliatelle|fusilli/i, 'Nudeln'], [/kartoffel/i, 'Kartoffeln'], [/reis\b/i, 'Reis'], [/linse/i, 'Linsen'], [/tofu/i, 'Tofu'], [/apfel|äpfel/i, 'Äpfel'], [/schoko/i, 'Schokolade'], [/quark/i, 'Quark']];
    for (const [re, v] of MAP) if (re.test(best)) return v;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function withGuesses(d, category, keywords) {
    d.course = d.course || guessCourse(d.title, category, keywords);
    d.method = d.method || guessMethod(d.steps, d.title);
    d.mainIngredient = d.mainIngredient || guessMain(d.ingredients, d.title);
    return d;
  }

  // ---------- Werbesprüche herausfiltern ----------
  // Lobende Füllwörter, die nichts über das Gericht sagen ("das einfachste", "super lecker", "in 10 Minuten")
  const PRAISE = '(?:super|mega|total|richtig|extra|echt|ganz|unglaublich|wirklich)?\\s*(?:einfach(?:st)?(?:e[nmrs]?)?|schnell(?:st)?(?:e[nmrs]?)?|lecker(?:st)?(?:e[nmrs]?)?|best(?:e[nmrs]?)?|perfekt(?:e[nmrs]?)?|gelingsicher(?:e[nmrs]?)?|genial(?:e[nmrs]?)?|himmlisch(?:e[nmrs]?)?|traumhaft(?:e[nmrs]?)?|ultimativ(?:e[nmrs]?)?|unwiderstehlich(?:e[nmrs]?)?|köstlich(?:e[nmrs]?)?|blitzschnell(?:e[nmrs]?)?|sensationell(?:e[nmrs]?)?|fantastisch(?:e[nmrs]?)?|easy)';
  const FLUFF_SEGMENT = new RegExp('(\\brezept\\b|\\bgrundrezept\\b|\\b' + PRAISE + '\\b|\\bin\\s+\\d+\\s*(min|minuten)\\b|\\bnur\\s+\\d+\\s+zutaten\\b|\\bso\\s+geht\'?s\\b|\\bwie\\s+bei\\s+oma\\b|\\bgarantiert\\b|\\bohne\\s+schnickschnack\\b|\\bschritt\\s+für\\s+schritt\\b|\\bmit\\s+video\\b)', 'iu');
  const GENERIC_SEG = /^(abendessen|mittagessen|frühstück|brunch|feierabend(küche|essen|rezept)?|meal ?prep|familienessen|sonntags(essen|braten)?|reste(verwertung|essen|küche)?|party(rezept|food|snack)?|fingerfood|weihnachts(rezept|essen|bäckerei|plätzchen)?|oster(rezept|brunch)?|soul ?food|comfort ?food|low ?carb|vegan|vegetarisch|glutenfrei|kinderleicht|alltags(rezept|küche)|wochenend(rezept|küche)|one ?pot|dessert|nachtisch|beilage|snack|ofengericht|pfannengericht|sommerrezept|winterrezept)$/iu;
  const LEADING_PRAISE = new RegExp('^(?:(?:das|der|die|mein|meine|unser|unsere)\\s+)?(?:' + PRAISE + '\\s+)+', 'iu');
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

  /* "Ofenpfannkuchen – das einfachste Rezept" -> "Ofenpfannkuchen"
     "Das einfachste Rezept: Ofenpfannkuchen" -> "Ofenpfannkuchen"
     "Super leckere schnelle Pfannkuchen in 10 Minuten" -> "Pfannkuchen"
     "Spaghetti Carbonara Rezept" -> "Spaghetti Carbonara" */
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
  const FLUFF_LINE = /^(guten appetit|viel spa(ß|ss)|lasst es euch|lass es dir|enjoy|bon app[ée]tit|und fertig|fertig ist|mahlzeit|have fun|happy (baking|cooking)|ich wünsche|wenn (du|ihr) (dieses|das) rezept|hast du (dieses|das) rezept|teile? (gerne )?(dein|ein) foto|markiere mich|folge mir|(und )?für mehr .{0,30}(folg|folge|folgt) mir|speicher(e|t)? (dir )?(das|dieses|den|die) (rezept|post|video|beitrag)|pin(ne)? (es|das rezept)|werbung|anzeige|affiliate|newsletter|link in bio|mehr rezepte)/iu;
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
      servings: sv.servings, servingsUnit: sv.servingsUnit, formSize: sv.formSize,
      imageUrl: image(r.image) || page.image || '',
      sourceUrl: page.url
    };
    return withGuesses(d, r.recipeCategory, [].concat(arr(r.keywords).join(',').split(','), arr(r.recipeCuisine)));
  }

  // ---------- Freier Text (TikTok-Beschreibung, Text aus Bildschirmfotos) ----------
  const HEAD_ING = /^(zutaten|ingredients?|du brauchst|ihr braucht|für den teig|für die füllung|einkaufsliste)\b[:\s]*$/i;
  const HEAD_STEP = /^(zubereitung|anleitung|so geht'?s|so wird'?s gemacht|instructions?|steps?|method|schritte)\b[:\s]*$/i;
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
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
    hint = hint || {};
    let lines = String(text || '')
      // Zahl-Emojis (1️⃣) und Aufzählungszeichen mitten im Text -> neue Zeile
      .replace(/(\d)\uFE0F?\u20E3\s*/g, '\n')
      .replace(EMOJI, ' ')
      .replace(/\s[*•·▪︎]\s+/g, '\n')
      // "… Zutaten: 3 Bananen, … Zubereitung: …" -> eigene Zeilen
      .replace(/\s*\b(zutaten|ingredients|zubereitung|anleitung|so geht'?s|instructions)\s*:/gi, '\n$1:')
      // "… Zutaten für 1 Blech: …" -> eigene Überschrift-Zeile
      .replace(/\s*\b((?:zutaten|ingredients)\s+(?:für|for)\s+[^:\n.]{1,25}):/gi, '\n$1:\n')
      // Kurze Zwischenüberschrift nach Satzende ("… (ca. 4 EL) Das steckt drin: …", "… wird. Haltbarkeit: …")
      .replace(/(?<=[.!?)\]])\s+((?:[\p{L}\d-]+ ){0,5}[\p{L}-]+:)(?=\s|$)/gu, '\n$1\n')
      .split(/\r?\n|(?<=[.!])\s+(?=\d{1,2}[.)]\s)/)
      .map(l => l.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/^[\s•·*\-–—>]+/, '').replace(/\s+/g, ' ').trim())
      .filter(l => l && !/^@\w/.test(l));
    let title = hint.title || '';
    const ingredients = [], st = [], other = [];
    let mode = '';
    let servingsFound = 0;
    for (const raw of lines) {
      let l = raw;
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
        const y = l.match(/(\d{1,3})\s*(portionen|personen|pers\.?|stück|stk\.?|plätzchen|muffins|gläser|bleche?|servings?)/i);
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
      if (!title) title = other.find(o => o !== o.toUpperCase() && o.split(' ').length <= 8) || '';
    }
    // Nur Fließtext mit Arbeitsschritten (keine Zutatenliste): die Sätze mit Kochverben als Schritte nehmen
    if (!ingredients.length && !st.length) {
      const verbs = other.filter(o => STEP_VERB.test(o) && o.split(' ').length >= 4);
      if (verbs.length) { verbs.forEach(v => { st.push(v); other.splice(other.indexOf(v), 1); }); }
    }
    if (!title) title = (other.shift() || '').replace(/[:!]+$/, '').slice(0, 80);
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
      title: title || 'Importiertes Rezept', ingredients, steps: splitSteps(st.map(tidyStep)).filter(x => x && !/^(anrichten|servieren)?[.!]*$/i.test(x) || /^(anrichten|servieren)/i.test(x)),
      notes: hint.ocr ? '' : cutNotes(other.join('\n'), 3000), // bei Fotos ist der Rest meist Begleittext
      servings: 4, servingsUnit: 'Personen', formSize: '',
      imageUrl: hint.image || '', sourceUrl: hint.url || ''
    };
    const sv = String(text).match(/(?:für|for)\s+(\d{1,2})\s*(personen|portionen|pers\.?|servings?|people)/i);
    if (servingsFound) {
      d.servings = servingsFound.n;
      d.servingsUnit = /stück|stk|plätzchen|muffins/i.test(servingsFound.unit) ? 'Stück' : /gläser/i.test(servingsFound.unit) ? 'Gläser' : /blech/i.test(servingsFound.unit) ? 'Blech' : 'Personen';
    } else if (sv) d.servings = parseInt(sv[1], 10);
    return withGuesses(d);
  }

  // Ergebnis des Server-Programms -> Entwurf (oder null, wenn kein Rezept erkennbar)
  function toDraft(res) {
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

  window.RecipeImporter = { findRecipe, steps, servingsFrom, fromPage, fromText, toDraft, guessCourse, guessMethod, guessMain, clean, cleanTitle, isFluffLine };
})();
