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
  function guessMain(ingredients) {
    let best = null, bestScore = -1;
    ingredients.forEach((line, i) => {
      const p = Sc.parseIngredient(Sc.normalizeIngredient(line));
      if (!p.name || isStaple(p.name)) return;
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
    d.mainIngredient = d.mainIngredient || guessMain(d.ingredients);
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
  const FLUFF_LINE = /^(guten appetit|viel spa(ß|ss)|lasst es euch|lass es dir|enjoy|bon app[ée]tit|und fertig|fertig ist|mahlzeit|have fun|happy (baking|cooking)|ich wünsche|wenn (du|ihr) (dieses|das) rezept|hast du (dieses|das) rezept|teile? (gerne )?(dein|ein) foto|markiere mich|folge mir|speicher(e|t)? (dir )?(das|dieses) rezept|pin(ne)? (es|das rezept)|werbung|anzeige|affiliate|newsletter|link in bio|mehr rezepte)/iu;
  const isFluffLine = l => FLUFF_LINE.test(String(l).replace(EMOJI_RE, '').trim()) || /^[\s\p{P}\p{S}]*$/u.test(String(l).replace(EMOJI_RE, ''));
  const cleanIngredientText = l => clean(l).replace(/\(?\*?\s*(affiliate[- ]?link|werbung|anzeige|\*)\s*\)?/giu, ' ').replace(/\s*\*+\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();

  // ---------- Rezeptseite (JSON-LD) ----------
  function fromPage(page) {
    let r = null;
    for (const block of page.jsonld || []) { r = findRecipe(block); if (r) break; }
    if (!r) return null;
    const title = cleanTitle(r.name || r.headline || page.title);
    const ingredients = arr(r.recipeIngredient || r.ingredients).map(cleanIngredientText).filter(Boolean);
    const st = steps(r.recipeInstructions).filter(x => !isFluffLine(x));
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
  function fromText(text, hint) {
    hint = hint || {};
    let lines = String(text || '').replace(EMOJI, ' ')
      // "… Zutaten: 3 Bananen, … Zubereitung: …" -> eigene Zeilen
      .replace(/\s*\b(zutaten|ingredients|zubereitung|anleitung|so geht'?s|instructions)\s*:/gi, '\n$1:')
      .split(/\r?\n|(?<=[.!])\s+(?=\d{1,2}[.)]\s)/)
      .map(l => l.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/^[\s•·*\-–—>]+/, '').replace(/\s+/g, ' ').trim())
      .filter(l => l && !/^@\w/.test(l));
    let title = hint.title || '';
    const ingredients = [], st = [], other = [];
    let mode = '';
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
      const norm = Sc.normalizeIngredient(l);
      const p = Sc.parseIngredient(norm);
      const looksIngredient = !!p.amount && p.name.split(' ').length <= 6 && !/[.!?]$/.test(l);
      // Vor der ersten Überschrift zählen nur nummerierte Zeilen als Schritt (sonst Titel/Text)
      const looksStep = /^\d{1,2}[.)]\s/.test(l) || (mode !== '' && (l.split(' ').length >= 6 || /[.!]$/.test(l)));
      if ((mode === 'ing' && !looksStep) || (mode !== 'step' && looksIngredient)) ingredients.push(norm);
      else if (mode === 'step' || looksStep) st.push(l.replace(/^\d{1,2}[.)]\s*/, ''));
      else other.push(l);
    }
    if (!title) title = (other.shift() || '').replace(/[:!]+$/, '').slice(0, 80);
    title = cleanTitle(title);
    for (let i = other.length - 1; i >= 0; i--) if (isFluffLine(other[i])) other.splice(i, 1);
    for (let i = st.length - 1; i >= 0; i--) if (isFluffLine(st[i])) st.splice(i, 1);
    const d = {
      title: title || 'Importiertes Rezept', ingredients, steps: st,
      notes: other.join('\n').slice(0, 500),
      servings: 4, servingsUnit: 'Personen', formSize: '',
      imageUrl: hint.image || '', sourceUrl: hint.url || ''
    };
    const sv = String(text).match(/(?:für|for)\s+(\d{1,2})\s*(personen|portionen|pers\.?|servings?|people)/i);
    if (sv) d.servings = parseInt(sv[1], 10);
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
      return null;
    }
    if (res.kind === 'tiktok') {
      const t = fromText(res.text || '', { image: res.image, url: res.url });
      if (res.author) t.notes = (t.notes ? t.notes + '\n' : '') + 'Von @' + res.author + ' auf TikTok';
      return { draft: t, how: t.ingredients.length ? 'tiktok' : 'tiktok-empty' };
    }
    return null;
  }

  window.RecipeImporter = { findRecipe, steps, servingsFrom, fromPage, fromText, toDraft, guessCourse, guessMethod, guessMain, clean, cleanTitle, isFluffLine };
})();
