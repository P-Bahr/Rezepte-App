/* Datenspeicher. Im Moment: im Speicher dieses Geräts (localStorage).
   Später wird hier die Online-Datenbank angeschlossen, damit alle Geräte
   dieselben Rezepte sehen. Der Rest der App muss dafür nicht geändert werden. */
(function () {
  'use strict';

  const KEY = 'rezepte.daten.v1';
  const listeners = [];
  let data = { version: 1, recipes: [], collections: [] };
  let storageOk = true;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.recipes) && Array.isArray(parsed.collections)) data = parsed;
      }
      // Ältere Einträge: Portionen als Text ("12 Stück") -> Zahl + Einheit
      // Sammlungen ohne Zeitstempel (ältere Daten) bekommen einen festen, gleichen Wert
      data.collections = data.collections.map(c => (c.updatedAt ? c : { ...c, updatedAt: '2000-01-01T00:00:00.000Z' }));
      data.recipes = data.recipes.map(r => ({ ...r, ingredients: (r.ingredients || []).map(cleanIngredient).filter(Boolean), method: cleanMethod(r.method) }));
      data.recipes = data.recipes.map(r => {
        if (typeof r.servings === 'number' || r.servings === null) return { ...r, servingsUnit: window.RecipeForms.normalizeUnit(r.servingsUnit) };
        const p = window.RecipeScale.parseServings(r.servings);
        return { ...r, servings: p.servings, servingsUnit: window.RecipeForms.normalizeUnit(r.servingsUnit || p.unit) };
      });
      // Feste Sammlungen (Ofen, Pfanne, Topf, Grill, Kalt) – ältere Daten einmalig einsortieren
      if (autoSort(new Date().toISOString())) localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      storageOk = false;
    }
    // Den Browser bitten, die Daten nicht automatisch zu löschen.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* egal */ }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      storageOk = true;
    } catch (e) {
      storageOk = false;
      throw new Error('Speichern hat nicht geklappt. Ist der Speicher des Geräts voll oder ein privates Fenster geöffnet?');
    }
    listeners.forEach(fn => fn());
  }

  function clean(text) { return String(text || '').trim(); }
  // "Bio" ist beim Einkaufen eigene Entscheidung und gehört nicht ins Rezept
  function cleanIngredient(text) {
    return packSize(clean(String(text || '').replace(/(^|[\s(])bio(?:-|\s+)(?=\p{L})/giu, '$1')
      .replace(/\s*@[\w.]+/g, '')                                  // "@morenutrition.de" (Werbung) weg
      .replace(/\bz\.\s?B\.\s+etwas\s+[\p{L}-]+\s+oder\s+/giu, '')  // "z. B. etwas Knobilicious oder" -> weg
      .replace(/^(?:gewürze|toppings?|deko|dekoration|garnitur|optional|außerdem|dazu|sonstiges)\s*:?\s+(?=\p{L})/iu, '') // "Gewürze: Salz, Pfeffer" -> "Salz, Pfeffer"
      .replace(/(\p{L})\s*:(?=\s|$)/gu, '$1') // "Reis: 200 g" / "200 g Reis:" -> ohne Doppelpunkt
      .replace(/(^|[\s(–-])(\d+\s+)?(1\/2|1\/4|3\/4|1\/3|2\/3|1\/8)(?=[\s)–-]|$)/g, (m, pre, whole, fr) => pre + (whole ? whole.trim() : '') + { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/8': '⅛' }[fr]) // "1/2" -> "½"
      .replace(/\(\s*\(+/g, '(').replace(/\)\s*\)+/g, ')')        // "((gerieben))" -> "(gerieben)"
      .replace(/\(\s*[=,;:]?\s*\)/g, '')                          // leere "()", "(= )"
      .replace(/^(\d+)\s+Eier?\s+(\p{L}*eier)\b/u, '$1 $2')        // "4 Eier Hühnereier" -> "4 Hühnereier"
      .replace(/\s{2,}/g, ' ')))
      .replace(/\(([^()]*)\)\s*\(([^()]*)\)/g, '($1, $2)');       // "(Größe M) (verquirlt)" -> "(Größe M, verquirlt)"
  }
  // Packungsgröße in Klammern direkt hinter die Packung:
  // "1 Dose 400 g Tomaten" / "1 Flasche Sekt (= 750 ml)" / "1 Dose (à 400 g) Tomaten" -> "1 Dose (400 g) Tomaten"
  const PACK = '(?:Flaschen?|Dosen?|Packungen?|Pck\\.?|Pkg\\.?|Päckchen|Gläsern?|Glas|Becher|Tüten?|Beutel|Tetrapaks?|Kartons?|Schalen?|Netze?|Bund)';
  const SIZE = '(\\d+(?:[.,]\\d+)?\\s*(?:ml|cl|l|g|kg))';
  const PACK_DIRECT = new RegExp('^(\\S+\\s+' + PACK + ')\\s+\\(?\\s*(=|à|a|je|zu|ca\\.?)?\\s*' + SIZE + '\\s*\\)?\\s+(?=\\S)', 'iu');
  const PACK_TAIL = new RegExp('^(\\S+\\s+' + PACK + ')\\s+(.+?)\\s*\\(\\s*(=|à|a|je|zu|ca\\.?)?\\s*' + SIZE + '\\s*\\)\\s*(\\([^()]*\\))?\\s*$', 'iu');
  function packSize(t) {
    const fmt = (pack, q, size) => {
      const many = !/^(1|ein|eine)\s/i.test(pack);
      const pre = /^ca/i.test(q || '') ? 'ca. ' : many ? 'je ' : '';
      return pack + ' (' + pre + size.replace(/(\d)(?=[a-z])/i, '$1 ') + ')';
    };
    if (PACK_DIRECT.test(t)) return t.replace(PACK_DIRECT, (m, pack, q, size) => fmt(pack, q, size) + ' ');
    const m = t.match(PACK_TAIL);
    if (m) return fmt(m[1], m[3], m[4]) + ' ' + m[2] + (m[5] ? ' ' + m[5] : '');
    return t;
  }
  // Alte Bezeichnung umbenennen
  function cleanMethod(m) { return /^roh\s*\/\s*ohne kochen$/i.test(clean(m)) ? 'Kalt zubereitet' : clean(m); }
  /* Sammlung aus der Zubereitung bestimmen (für alle Rezepte) und nur die festen Sammlungen behalten.
     Gibt true zurück, wenn sich etwas geändert hat. Auf jedem Gerät gleiches Ergebnis. */
  // Felder, die beim Import automatisch entstehen (und später mit besseren Regeln neu entstehen können)
  const IMPORT_FIELDS = ['title', 'course', 'mainIngredient', 'method', 'servings', 'servingsUnit', 'formSize', 'totalTime', 'ingredients', 'steps', 'notes'];
  // So, wie saveRecipe die Felder ablegt – damit "unverändert" sicher erkannt wird
  function snap(input) {
    const ps = window.RecipeScale.parseServings(input.servings);
    const o = {
      title: clean(input.title), course: clean(input.course), mainIngredient: clean(input.mainIngredient), method: cleanMethod(input.method),
      servings: ps.servings, servingsUnit: window.RecipeForms.normalizeUnit(clean(input.servingsUnit) || ps.unit),
      formSize: clean(input.formSize), totalTime: clean(input.totalTime),
      ingredients: cleanList(input.ingredients).map(l => cleanIngredient(window.RecipeScale.normalizeIngredient(l))).filter(Boolean),
      steps: cleanList(input.steps), notes: clean(input.notes)
    };
    if (window.RecipeCollections) o.method = window.RecipeCollections.forRecipe(o).method;
    return o;
  }
  const same = (a, b) => JSON.stringify(a == null ? '' : a) === JSON.stringify(b == null ? '' : b);
  const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  const appVersion = () => { try { const m = document.querySelector('meta[name="app-version"]'); return (m && m.content) || ''; } catch (e) { return ''; } };
  /* Noch nicht geprüfte Importe mit den aktuellen Regeln aus dem Original neu einlesen.
     Nur Felder, die seit dem Import niemand geändert hat, werden ersetzt – eigene Änderungen bleiben. */
  function reparse(r, now, V) {
    const I = window.RecipeImporter;
    if (!I || !I.rebuild || !r.review || !r.importSource || !r.importResult || (V && r.importV === V)) return null;
    let nd = null;
    try { nd = I.rebuild(r.importSource); } catch (e) { nd = null; }
    if (nd === undefined) return null; // Baustein noch nicht geladen: später noch einmal
    const out = { ...r, importV: V };
    if (!nd) return out;
    if (nd.title === 'Importiertes Rezept') nd.title = '';
    const ns = snap(nd);
    const res = { ...r.importResult };
    let diff = false;
    for (const f of IMPORT_FIELDS) {
      if (!same(r[f], r.importResult[f]) || isEmpty(ns[f])) continue; // selbst geändert oder neu nichts gefunden
      res[f] = ns[f];
      if (!same(ns[f], r[f])) { out[f] = ns[f]; diff = true; }
    }
    out.importResult = res;
    if (diff) {
      out.updatedAt = now;
      const info = { ...(r.importInfo || {}) };
      if (nd.courseGuessed !== undefined) info.courseGuessed = !!nd.courseGuessed;
      if (nd.unitsConverted) info.unitsConverted = true;
      out.importInfo = info;
    }
    return out;
  }

  function autoSort(now) {
    const C = window.RecipeCollections;
    const I = window.RecipeImporter;
    let changed = false;
    const V = appVersion();
    // Zuerst: ungeprüfte Importe mit Original neu einlesen (die übrigen Reparaturen brauchen sie dann nicht)
    data.recipes = data.recipes.map(r => { const n = reparse(r, now, V); if (!n) return r; changed = true; return n; });
    const fresh = r => !!(r.review && r.importSource && r.importResult);
    // Alle Rezepte aufräumen: Emojis, Schmuckschrift, Werbesätze, Hashtags, sinnlose Notizen, Tippfehler
    if (I && I.tidyRecipe) data.recipes = data.recipes.map(r => {
      const t = I.tidyRecipe(r);
      const ing = t.ingredients.map(l => cleanIngredient(window.RecipeScale.normalizeIngredient(l))).filter(Boolean);
      const next = { title: t.title || r.title, ingredients: ing, steps: t.steps, notes: t.notes };
      if (['title', 'ingredients', 'steps', 'notes'].every(f => same(next[f], r[f]))) return r;
      changed = true;
      const out = { ...r, ...next, updatedAt: now };
      // Beim gemerkten Vorschlag genauso aufräumen, sonst sähe es wie eine eigene Änderung aus
      if (r.importResult) {
        const ir = I.tidyRecipe(r.importResult);
        out.importResult = { ...r.importResult, title: ir.title || r.importResult.title, ingredients: ir.ingredients.map(l => cleanIngredient(window.RecipeScale.normalizeIngredient(l))).filter(Boolean), steps: ir.steps, notes: ir.notes };
      }
      return out;
    });
    // Unsinnige Hauptzutaten aus früheren Importen ("Minuten", "1050") neu bestimmen – als echte Änderung,
    // damit sie auch im Online-Speicher und auf den anderen Geräten repariert wird
    if (I && I.validMain) data.recipes = data.recipes.map(r => {
      if (fresh(r) || !r.mainIngredient || I.validMain(r.mainIngredient)) return r;
      changed = true;
      return { ...r, mainIngredient: I.validMain(I.guessMain(r.ingredients || [], r.title)), updatedAt: now };
    });
    // Tassen, oz, lb in g/ml; doppelte Angaben ("¼ Tasse / 50g") nur metrisch – bei allen Rezepten
    if (I && I.convertUnits) data.recipes = data.recipes.map(r => {
      if (fresh(r)) return r;
      const conv = I.convertUnits(r.ingredients || []).map(l => cleanIngredient(window.RecipeScale.normalizeIngredient(l)));
      if (JSON.stringify(conv) === JSON.stringify(r.ingredients || [])) return r;
      changed = true;
      return { ...r, ingredients: conv, updatedAt: now };
    });
    // Noch nicht geprüfte Importe: Schätzungen (Rezeptart, Zubereitung, Hauptzutat) mit den aktuellen Regeln neu berechnen
    if (I && I.guessMethod) data.recipes = data.recipes.map(r => {
      if (!r.review || fresh(r)) return r;
      const title = I.tidyTitle ? I.tidyTitle(r.title) : r.title;
      const next = {
        ingredients: r.ingredients,
        course: (() => { const c = I.guessCourse(title, [], [r.notes || ''], r); return c === 'Hauptgericht' && r.course ? r.course : c; })(),
        method: I.guessMethod(r.steps || [], title),
        mainIngredient: ''
      };
      next.mainIngredient = I.mainFor ? I.mainFor({ ...r, title, course: next.course }) : (I.validMain(I.guessMain(r.ingredients || [], title)) || r.mainIngredient);
      if (next.course === 'Salat' && next.method === 'Kochen') next.method = 'Kalt zubereitet';
      if (next.course === r.course && next.method === r.method && next.mainIngredient === r.mainIngredient && JSON.stringify(next.ingredients) === JSON.stringify(r.ingredients)) return r;
      changed = true;
      return { ...r, ...next, updatedAt: now };
    });
    // Einmalig (21.11.): zwei kaputte Importe löschen, die neu eingefügt werden (auf Wunsch der Nutzerin);
    // der Abgleich entfernt sie dann auch online
    const BROKEN = ['b72d1ee1-7f3a-4434-ab5b-0d8c62f658ce', 'e1fd6353-cba6-4cc6-988e-198bb0342f3b'];
    if (data.recipes.some(r => BROKEN.includes(r.id))) { data.recipes = data.recipes.filter(r => !BROKEN.includes(r.id)); changed = true; }
    // Einmalig (21.11., mit Zustimmung): Rezeptart, Zubereitung und Hauptzutat aller Rezepte nach den aktuellen Regeln neu einordnen
    const RECLASS = 'rezepte.neuEingeordnet';
    let reclassDone = false;
    try { reclassDone = localStorage.getItem(RECLASS) === '2026-11-21'; } catch (e) { reclassDone = true; }
    if (I && I.withGuesses && !reclassDone) {
      data.recipes = data.recipes.map(r => {
        if (r.example) return r;
        const d = { title: r.title, ingredients: (r.ingredients || []).slice(), steps: (r.steps || []).slice(), notes: r.notes || '' };
        try { I.withGuesses(d, [], [d.notes]); } catch (e) { return r; }
        const next = { course: d.course || r.course, method: d.method || r.method, mainIngredient: d.mainIngredient || '' };
        if (next.course === r.course && next.method === r.method && next.mainIngredient === (r.mainIngredient || '')) return r;
        changed = true;
        return { ...r, ...next, updatedAt: now };
      });
      try { localStorage.setItem(RECLASS, '2026-11-21'); } catch (e) { /* egal */ }
    }
    // Herzhafte Muffins/Waffeln (z. B. "Mini Nudel Muffins") waren früher "Gebäck"
    if (I && I.SAVORY_BAKE) data.recipes = data.recipes.map(r => {
      if (r.course !== 'Gebäck' || !I.SAVORY_BAKE.test(r.title || '')) return r;
      changed = true;
      const next = { ...r, course: 'Hauptgericht', updatedAt: now };
      if (I.mainFor && !r.mainIngredient) next.mainIngredient = I.mainFor(next);
      return next;
    });
    // Kleingebäck in Stück statt Personen
    if (I && I.piecesUnit) data.recipes = data.recipes.map(r => {
      if (!I.piecesUnit(r)) return r;
      changed = true;
      return { ...r, servingsUnit: 'Stück', updatedAt: now };
    });
    // "One Pot"-Gerichte gehören in den Topf, nicht in die Pfanne (frühere Importe)
    data.recipes = data.recipes.map(r => {
      if (!/\bone[- ]?pot\b/i.test(r.title || '') || r.method !== 'Braten') return r;
      changed = true;
      return { ...r, method: 'Kochen', updatedAt: now };
    });
    // Namen ohne "für Kinder und Familie", "nach Omas bestem Rezept" …
    if (I && I.tidyTitle) data.recipes = data.recipes.map(r => {
      if (fresh(r)) return r;
      // Name nur ein Spruch ("So wird dein Darm gesund"): aus dem Inhalt benennen
      if (I.isClaimTitle && I.isClaimTitle(r.title)) {
        changed = true;
        return { ...r, title: I.titleFromContent(r), importInfo: { ...(r.importInfo || {}), titleReplaced: true }, updatedAt: now };
      }
      const t = I.tidyTitle(r.title);
      if (!t || t === r.title) return r;
      changed = true;
      return { ...r, title: t, updatedAt: now };
    });
    data.recipes = data.recipes.map(r => {
      const f = C.forRecipe(r);
      if (r.collectionId === f.id && (r.method || '') === f.method) return r;
      changed = true;
      return { ...r, collectionId: f.id, method: f.method, updatedAt: now };
    });
    const fixed = C.list();
    if (JSON.stringify(data.collections) !== JSON.stringify(fixed)) { data.collections = fixed; changed = true; }
    return changed;
  }

  function cleanList(list) { return (list || []).map(clean).filter(Boolean); }

  const Store = {
    get storageOk() { return storageOk; },
    onChange(fn) { listeners.push(fn); },
    reparseNow() { const now = new Date().toISOString(); if (autoSort(now)) save(); }, // für Tests

    recipes() { return data.recipes.slice(); },
    recipe(id) { return data.recipes.find(r => r.id === id) || null; },
    collections() { return data.collections.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')); },
    collection(id) { return data.collections.find(c => c.id === id) || null; },

    saveRecipe(input) {
      const title = clean(input.title);
      if (!title) throw new Error('Bitte gib dem Rezept einen Namen.');
      const parsedServ = window.RecipeScale.parseServings(input.servings);
      if (clean(input.servings) && !parsedServ.servings) throw new Error('Bei „Rezept ist für“ bitte eine Zahl eintragen, zum Beispiel 4.');
      const now = new Date().toISOString();
      const existing = input.id ? this.recipe(input.id) : null;
      const recipe = {
        id: existing ? existing.id : uid(),
        title,
        collectionId: '', // wird unten aus der Zubereitung bestimmt
        course: clean(input.course),
        mainIngredient: clean(input.mainIngredient),
        method: cleanMethod(input.method),
        servings: parsedServ.servings,
        servingsUnit: window.RecipeForms.normalizeUnit(clean(input.servingsUnit) || parsedServ.unit),
        formSize: clean(input.formSize),
        totalTime: clean(input.totalTime),
        // Menge/Einheit nach vorn ("Mehl 200g" -> "200 g Mehl"), damit Umrechnen zuverlässig klappt
        ingredients: cleanList(input.ingredients).map(l => cleanIngredient(window.RecipeScale.normalizeIngredient(l))).filter(Boolean),
        steps: cleanList(input.steps),
        notes: clean(input.notes),
        imageId: clean(input.imageId),
        imageUrl: clean(input.imageUrl),
        sourceUrl: clean(input.sourceUrl),
        // Quelle, die es nicht mehr gibt (von der Link-Prüfung gesetzt); nur angezeigt, solange kein neuer Link da ist
        deadSourceUrl: clean(input.sourceUrl) ? '' : clean(input.deadSourceUrl || (existing && existing.deadSourceUrl)),
        favorite: existing ? !!existing.favorite : !!input.favorite,
        dupOk: existing ? !!existing.dupOk : !!input.dupOk, // bewusst als Doppel behalten (nicht aussortieren)
        example: existing ? !!existing.example : !!input.example, // Beispielrezept (lässt sich gesammelt entfernen)
        // Automatisch importiert und noch nicht angesehen ("Zu prüfen"); Speichern im Formular gilt als geprüft
        review: input.review !== undefined ? !!input.review : !!(existing && existing.review),
        importBatch: existing ? clean(existing.importBatch) : clean(input.importBatch), // für "Import rückgängig"
        // Was beim Import nur geschätzt war (für die Prüf-Hinweise)
        importInfo: existing ? (existing.importInfo || null) : (input.importHow || input.servingsGuessed || input.courseGuessed || input.unitsConverted || input.titleMissing || input.titleReplaced || input.aiRead
          ? { how: clean(input.importHow), servingsGuessed: !!input.servingsGuessed, courseGuessed: !!input.courseGuessed, unitsConverted: !!input.unitsConverted, titleMissing: !!input.titleMissing, titleReplaced: !!input.titleReplaced, aiRead: !!input.aiRead, aiUnsure: Array.isArray(input.aiUnsure) ? input.aiUnsure.slice(0, 8).map(clean) : undefined } : null),
        // Original des Imports und was die App damals daraus gemacht hat (für Neu-Einlesen und Lernen aus Korrekturen)
        importSource: existing ? (existing.importSource || null) : (input.importSource || null),
        importResult: existing ? (existing.importResult || null) : (input.importSource ? snap(input.importDraft || input) : null),
        importV: existing ? (existing.importV || '') : (input.importSource ? appVersion() : ''),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      };
      // Sammlung automatisch aus der Zubereitung (fehlt sie, wird sie aus den Schritten geschätzt)
      const auto = window.RecipeCollections.forRecipe(recipe);
      recipe.collectionId = auto.id;
      recipe.method = auto.method;
      if (!data.collections.some(c => c.id === auto.id)) data.collections = window.RecipeCollections.list();
      const before = data.recipes;
      data.recipes = existing ? before.map(r => (r.id === recipe.id ? recipe : r)) : before.concat(recipe);
      try { save(); } catch (e) {
        // Speicher voll: lieber ohne Original speichern als gar nicht
        if (!recipe.importSource) { data.recipes = before; throw e; }
        recipe.importSource = null; recipe.importResult = null;
        data.recipes = existing ? before.map(r => (r.id === recipe.id ? recipe : r)) : before.concat(recipe);
        try { save(); } catch (e2) { data.recipes = before; throw e2; }
      }
      return recipe;
    },

    // Favorit an/aus (ändert nichts am Rezept selbst)
    toggleFavorite(id) {
      const r = this.recipe(id);
      if (!r) return false;
      const before = data.recipes;
      data.recipes = before.map(x => (x.id === id ? { ...x, favorite: !x.favorite, updatedAt: new Date().toISOString() } : x));
      try { save(); } catch (e) { data.recipes = before; throw e; }
      return !r.favorite;
    },

    // "Passt": Markierung "Zu prüfen" entfernen
    // Mehrfach gespeichertes Gericht bewusst behalten (kein Hinweis mehr)
    setDupOk(ids) {
      const set = new Set(ids), now = new Date().toISOString(), before = data.recipes;
      data.recipes = before.map(x => (set.has(x.id) && !x.dupOk ? { ...x, dupOk: true, updatedAt: now } : x));
      try { save(); } catch (e) { data.recipes = before; throw e; }
    },
    setReviewed(id) {
      if (!this.recipe(id)) return;
      const before = data.recipes;
      data.recipes = before.map(x => (x.id === id ? { ...x, review: false, updatedAt: new Date().toISOString() } : x));
      try { save(); } catch (e) { data.recipes = before; throw e; }
    },

    // "Import rückgängig": alle Rezepte eines Sammel-Imports löschen
    deleteBatch(batch) {
      if (!batch) return 0;
      const gone = data.recipes.filter(r => r.importBatch === batch);
      gone.forEach(r => this.deleteRecipe(r.id));
      return gone.length;
    },

    deleteRecipe(id) {
      const gone = this.recipe(id);
      const before = data.recipes;
      data.recipes = before.filter(r => r.id !== id);
      try { save(); } catch (e) { data.recipes = before; throw e; }
      // Zugehöriges Foto aus dem Bildspeicher löschen
      if (gone && gone.imageId && window.RecipeImages) window.RecipeImages.remove(gone.imageId);
    },

    addCollection(name) {
      name = clean(name);
      if (!name) throw new Error('Bitte gib der Sammlung einen Namen.');
      const same = data.collections.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (same) return same;
      const col = { id: uid(), name, updatedAt: new Date().toISOString() };
      data.collections = data.collections.concat(col);
      try { save(); } catch (e) { data.collections = data.collections.filter(c => c !== col); throw e; }
      return col;
    },

    renameCollection(id, name) {
      name = clean(name);
      if (!name) throw new Error('Der Name darf nicht leer sein.');
      const other = data.collections.find(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase());
      if (other) throw new Error('Eine Sammlung mit diesem Namen gibt es schon.');
      const before = data.collections;
      data.collections = before.map(c => (c.id === id ? { ...c, name, updatedAt: new Date().toISOString() } : c));
      try { save(); } catch (e) { data.collections = before; throw e; }
    },

    deleteCollection(id) {
      const count = data.recipes.filter(r => r.collectionId === id).length;
      if (count) throw new Error('In dieser Sammlung liegen noch ' + count + ' Rezepte. Verschiebe sie zuerst in eine andere Sammlung.');
      const before = data.collections;
      data.collections = before.filter(c => c.id !== id);
      try { save(); } catch (e) { data.collections = before; throw e; }
    },

    // Fügt fehlende Beispielrezepte hinzu (vorhandene mit gleichem Namen werden nicht doppelt angelegt).
    // Rückgabe: Anzahl neu hinzugefügter Rezepte.
    loadExamples() {
      const ex = window.EXAMPLE_RECIPES || [];
      const before = JSON.stringify(data);
      let added = 0;
      try {
        const byTitle = new Map(data.recipes.map(r => [r.title.toLowerCase(), r]));
        for (const r of ex) {
          const old = byTitle.get(r.title.toLowerCase());
          if (old) { if (!old.example) { old.example = true; old.updatedAt = new Date().toISOString(); } continue; } // ältere, ungekennzeichnete Beispiele kennzeichnen
          this.saveRecipe({ ...r, example: true }); // Sammlung ergibt sich aus der Zubereitung
          added++;
        }
        save();
      } catch (e) { data = JSON.parse(before); throw e; }
      return added;
    },

    // ---- Für den Online-Abgleich ----
    _snapshot() { return JSON.parse(JSON.stringify({ recipes: data.recipes, collections: data.collections })); },
    // Übernimmt den abgeglichenen Stand und sortiert alles in die festen Sammlungen ein
    // (auch Rezepte von Geräten mit älterer App-Version).
    _replace(next) {
      const before = JSON.stringify(data);
      data.recipes = next.recipes;
      data.collections = next.collections;
      autoSort(new Date().toISOString());
      if (JSON.stringify(data) === before) return false;
      try { save(); } catch (e) { data = JSON.parse(before); throw e; }
      return true;
    },

    // Sicherung einspielen: fehlende Rezepte (nach ID) übernehmen, vorhandene bleiben, wie sie sind
    restore(list) {
      const have = new Set(data.recipes.map(r => r.id));
      const now = new Date().toISOString();
      const add = (Array.isArray(list) ? list : []).filter(r => r && r.id && r.title && !have.has(r.id))
        .map(r => ({ ...r, ingredients: (r.ingredients || []).map(cleanIngredient).filter(Boolean), steps: r.steps || [], updatedAt: now }));
      if (!add.length) return 0;
      const before = data.recipes;
      data.recipes = before.concat(add);
      autoSort(now);
      try { save(); } catch (e) { data.recipes = before; throw e; }
      return add.length;
    },

    exampleCount() { return data.recipes.filter(r => r.example).length; },

    // Entfernt alle Beispielrezepte und die durch sie entstandenen, jetzt leeren Sammlungen.
    removeExamples() {
      const gone = data.recipes.filter(r => r.example);
      const before = JSON.stringify(data);
      data.recipes = data.recipes.filter(r => !r.example);
      try { save(); } catch (e) { data = JSON.parse(before); throw e; }
      gone.forEach(r => { if (r.imageId && window.RecipeImages) window.RecipeImages.remove(r.imageId); });
      return gone.length;
    }
  };

  load();
  window.Store = Store;
})();
