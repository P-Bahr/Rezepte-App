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
  function autoSort(now) {
    const C = window.RecipeCollections;
    const I = window.RecipeImporter;
    let changed = false;
    // Unsinnige Hauptzutaten aus früheren Importen ("Minuten", "1050") neu bestimmen – als echte Änderung,
    // damit sie auch im Online-Speicher und auf den anderen Geräten repariert wird
    if (I && I.validMain) data.recipes = data.recipes.map(r => {
      if (!r.mainIngredient || I.validMain(r.mainIngredient)) return r;
      changed = true;
      return { ...r, mainIngredient: I.validMain(I.guessMain(r.ingredients || [], r.title)), updatedAt: now };
    });
    // Tassen, oz, lb in g/ml; doppelte Angaben ("¼ Tasse / 50g") nur metrisch – bei allen Rezepten
    if (I && I.convertUnits) data.recipes = data.recipes.map(r => {
      const conv = I.convertUnits(r.ingredients || []).map(l => cleanIngredient(window.RecipeScale.normalizeIngredient(l)));
      if (JSON.stringify(conv) === JSON.stringify(r.ingredients || [])) return r;
      changed = true;
      return { ...r, ingredients: conv, updatedAt: now };
    });
    // Noch nicht geprüfte Importe: Schätzungen (Rezeptart, Zubereitung, Hauptzutat) mit den aktuellen Regeln neu berechnen
    if (I && I.guessMethod) data.recipes = data.recipes.map(r => {
      if (!r.review) return r;
      const title = I.tidyTitle ? I.tidyTitle(r.title) : r.title;
      const next = {
        ingredients: r.ingredients,
        course: I.guessCourse(title, [], []) === 'Hauptgericht' ? (r.course || 'Hauptgericht') : I.guessCourse(title, [], []),
        method: I.guessMethod(r.steps || [], title),
        mainIngredient: I.validMain(I.guessMain(r.ingredients || [], title)) || r.mainIngredient
      };
      if (next.course === 'Salat' && next.method === 'Kochen') next.method = 'Kalt zubereitet';
      if (next.course === r.course && next.method === r.method && next.mainIngredient === r.mainIngredient && JSON.stringify(next.ingredients) === JSON.stringify(r.ingredients)) return r;
      changed = true;
      return { ...r, ...next, updatedAt: now };
    });
    // Namen ohne "für Kinder und Familie", "nach Omas bestem Rezept" …
    if (I && I.tidyTitle) data.recipes = data.recipes.map(r => {
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
        importInfo: existing ? (existing.importInfo || null) : (input.importHow || input.servingsGuessed || input.courseGuessed || input.unitsConverted || input.titleMissing
          ? { how: clean(input.importHow), servingsGuessed: !!input.servingsGuessed, courseGuessed: !!input.courseGuessed, unitsConverted: !!input.unitsConverted, titleMissing: !!input.titleMissing } : null),
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
      try { save(); } catch (e) { data.recipes = before; throw e; }
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
