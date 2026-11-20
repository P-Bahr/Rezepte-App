/* Bedienoberfläche: Übersicht, Suche, Filter, Rezeptfenster, Formular. */
(function () {
  'use strict';

  const S = window.RecipeSearch;
  const Store = window.Store;
  const $ = sel => document.querySelector(sel);

  const COURSES = ['Frühstück', 'Vorspeise', 'Suppe', 'Salat', 'Hauptgericht', 'Beilage', 'Dessert', 'Gebäck', 'Snack', 'Getränk', 'Sauce & Dip'];
  const METHODS = ['Backen', 'Braten', 'Kochen', 'Grillen', 'Dünsten', 'Schmoren', 'Frittieren', 'Heißluftfritteuse', 'Kalt zubereitet'];
  const FACETS = [
    { key: 'collectionId', label: 'Sammlung' },
    { key: 'course', label: 'Rezeptart', order: COURSES },
    { key: 'mainIngredient', label: 'Hauptzutat', order: window.RecipeGroups.ORDER } // als Gruppe (Fleisch, Fisch …)
  ];

  const state = {
    query: '',
    filters: { collectionId: new Set(), course: new Set(), mainIngredient: new Set() },
    mode: null,          // 'detail' | 'edit' | 'collections' | null
    favOnly: false,      // nur Favoriten zeigen
    reviewOnly: false,   // nur "Zu prüfen"
    onePotOnly: false,   // nur One-Pot-Gerichte
    ings: [],            // gewählte Zutaten [{ key, label }] – Rezept muss alle enthalten
    depth: 0,            // wie viele Rezepte nacheinander per Antippen geöffnet wurden (für "Zurück")
    pushing: false       // gerade öffnet die App selbst ein Rezept
  };

  // ---------- kleine Helfer ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
  }

  function facetKey(value) { return S.normalize(value); }
  function facetValue(recipe, key) {
    if (key === 'collectionId') return recipe.collectionId;
    if (key === 'mainIngredient') return facetKey(window.RecipeGroups.groupOf(recipe.mainIngredient));
    return facetKey(recipe[key]);
  }
  function facetLabel(recipe, key) {
    if (key === 'collectionId') return collectionName(recipe.collectionId);
    if (key === 'mainIngredient') return window.RecipeGroups.groupOf(recipe.mainIngredient);
    return String(recipe[key] || '').trim();
  }
  function collectionName(id) { const c = Store.collection(id); return c ? c.name : ''; }

  function safeUrl(url) {
    try { const u = new URL(url); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : ''; }
    catch (e) { return ''; }
  }

  // ---------- Suche & Filter merken (falls iOS die App im Hintergrund neu lädt) ----------
  function rememberView() {
    try {
      const f = {};
      for (const k in state.filters) f[k] = [...state.filters[k]];
      sessionStorage.setItem('rezepte.ansicht', JSON.stringify({ q: state.query, f, fav: state.favOnly, ings: state.ings }));
    } catch (e) { /* nicht schlimm */ }
  }
  function restoreView() {
    try {
      const v = JSON.parse(sessionStorage.getItem('rezepte.ansicht') || 'null');
      if (!v) return;
      state.query = v.q || '';
      state.favOnly = !!v.fav;
      state.ings = Array.isArray(v.ings) ? v.ings.filter(i => i && i.key && i.label) : [];
      for (const k in state.filters) state.filters[k] = new Set((v.f && v.f[k]) || []);
      // Früher gemerkte einzelne Hauptzutaten ("minuten") passen nicht mehr zu den Gruppen
      const groups = new Set(window.RecipeGroups.ORDER.map(facetKey));
      state.filters.mainIngredient = new Set([...state.filters.mainIngredient].filter(x => groups.has(x)));
    } catch (e) { /* nicht schlimm */ }
  }

  // ---------- Übersicht ----------
  let indexCache = new Map();
  function getIndex(r) {
    const key = r.id + '|' + r.updatedAt + '|' + collectionName(r.collectionId);
    const c = indexCache.get(r.id);
    if (c && c.key === key) return c.idx;
    const idx = S.index(r, collectionName(r.collectionId));
    indexCache.set(r.id, { key, idx });
    return idx;
  }

  function passesFilters(r, skipKey) {
    if (state.favOnly && skipKey !== 'fav' && !r.favorite) return false;
    if (state.reviewOnly && skipKey !== 'review' && !r.review) return false;
    if (state.onePotOnly && skipKey !== 'onepot' && !window.RecipeCollections.isOnePot(r)) return false;
    if (state.ings.length && skipKey !== 'ings') {
      const ks = window.RecipeIngredients.keysOf(r);
      if (!state.ings.every(i => ks.has(i.key))) return false;
    }
    for (const f of FACETS) {
      if (f.key === skipKey) continue;
      const sel = state.filters[f.key];
      if (sel.size && !sel.has(facetValue(r, f.key))) return false;
    }
    return true;
  }

  // ---------- Sortieren ----------
  const SORTS = { name: 'A–Z', neu: 'Neueste', schnell: 'Schnellste' };
  let sortBy = 'name';
  try { const v = localStorage.getItem('rezepte.sortierung'); if (SORTS[v]) sortBy = v; } catch (e) { /* egal */ }
  function minutes(r) { const t = window.RecipeTime.estimateMinutes(r); return t ? t.minutes + (t.overnight ? 720 : 0) : Infinity; }
  function sortResults(results) {
    const byName = (a, b) => a.r.title.localeCompare(b.r.title, 'de');
    if (sortBy === 'neu') results.sort((a, b) => String(b.r.createdAt).localeCompare(String(a.r.createdAt)) || byName(a, b));
    else if (sortBy === 'schnell') results.sort((a, b) => minutes(a.r) - minutes(b.r) || byName(a, b));
    // Bei "Name" und laufender Suche stehen die besten Treffer oben
    else if (state.query.trim()) results.sort((a, b) => b.sc - a.sc || byName(a, b));
    else results.sort(byName);
  }

  // ---------- Reihenfolge der Filterzeilen ----------
  let facetOrder = FACETS.map(f => f.key);
  try {
    const v = JSON.parse(localStorage.getItem('rezepte.filterReihenfolge') || 'null');
    if (Array.isArray(v) && v.length === facetOrder.length && facetOrder.every(k => v.includes(k))) facetOrder = v;
  } catch (e) { /* egal */ }
  let arranging = false;
  function moveFacet(key, dir) {
    const i = facetOrder.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= facetOrder.length) return;
    [facetOrder[i], facetOrder[j]] = [facetOrder[j], facetOrder[i]];
    try { localStorage.setItem('rezepte.filterReihenfolge', JSON.stringify(facetOrder)); } catch (e) { /* egal */ }
    render();
    const btn = document.querySelector('.facet[data-key="' + key + '"] .move-' + (dir < 0 ? 'up' : 'down'));
    if (btn && !btn.disabled) btn.focus();
  }

  function render() {
    const all = Store.recipes();
    // Filter, die es nicht mehr gibt (z. B. gelöschte Sammlung), stillschweigend entfernen
    const ids = new Set(Store.collections().map(c => c.id));
    for (const id of [...state.filters.collectionId]) if (!ids.has(id)) state.filters.collectionId.delete(id);

    const scores = S.search(all.map(getIndex), state.query);
    const scored = [];
    all.forEach((r, i) => { if (scores[i] > 0) scored.push({ r, sc: scores[i] }); });
    const results = scored.filter(x => passesFilters(x.r));
    sortResults(results);

    renderFilters(scored.map(x => x.r));
    renderGrid(results.map(x => x.r), all.length);

    const active = state.query.trim() || state.favOnly || state.reviewOnly || state.onePotOnly || state.ings.length || FACETS.some(f => state.filters[f.key].size);
    $('#count').textContent = results.length === 1 ? '1 Rezept' : results.length + ' Rezepte';
    $('#btnReset').hidden = !active;
    // Anzahl aktiver Filter am Filter-Knopf (wichtig, wenn zugeklappt)
    const nActive = (state.favOnly ? 1 : 0) + (state.reviewOnly ? 1 : 0) + (state.onePotOnly ? 1 : 0) + state.ings.length + FACETS.reduce((n, f) => n + state.filters[f.key].size, 0);
    $('#filterBadge').textContent = nActive ? String(nActive) : '';
    $('#filterBadge').hidden = !nActive;
    $('#qClear').hidden = !state.query;
    $('#storageWarning').hidden = Store.storageOk;
    rememberView();
  }

  // Filterzeile "Zutaten": Zutat eintippen, Vorschlag antippen; Rezepte müssen alle gewählten Zutaten enthalten
  let ingFocus = false;
  function ingredientRow(searchHits) {
    const I = window.RecipeIngredients;
    const input = h('input', { type: 'search', id: 'ingInput', class: 'ing-input', placeholder: '+ Zutat', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Zutat hinzufügen' });
    const suggest = h('div', { class: 'chips ing-suggest', id: 'ingSuggest', 'data-key': 'ings-suggest', hidden: true });
    const add = item => {
      if (!state.ings.some(i => i.key === item.key)) state.ings.push({ key: item.key, label: item.label });
      ingFocus = true; render();
    };
    function update() {
      const q = input.value.trim();
      suggest.textContent = '';
      if (!q) { suggest.hidden = true; return; }
      const qs = I.stem(q), ql = q.toLowerCase();
      // Vorschläge aus den Rezepten, die zu Suche und übrigen Filtern passen; Zahl = Treffer nach dem Hinzufügen
      const pool = searchHits.filter(r => passesFilters(r));
      const list = I.vocabulary(pool)
        .filter(v => !state.ings.some(i => i.key === v.key))
        .filter(v => v.key.startsWith(qs) || v.label.toLowerCase().split(/[\s-]/).some(w => w.startsWith(ql)) || v.label.toLowerCase().includes(ql))
        .sort((a, b) => (b.key.startsWith(qs) - a.key.startsWith(qs)) || b.count - a.count || a.label.localeCompare(b.label, 'de'))
        .slice(0, 8);
      if (!list.length) { suggest.append(h('span', { class: 'hint', text: 'Keine passende Zutat in deinen Rezepten.' })); suggest.hidden = false; return; }
      list.forEach(v => suggest.append(h('button', { type: 'button', class: 'chip', onclick: () => add(v) }, v.label, h('span', { class: 'n', text: String(v.count) }))));
      suggest.hidden = false;
    }
    input.addEventListener('input', update);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const first = suggest.querySelector('button.chip'); if (first) first.click(); }
    });
    const chips = h('div', { class: 'chips', 'data-key': 'ings', role: 'group', 'aria-label': 'Zutaten' },
      state.ings.map(i => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'true', 'aria-label': i.label + ' entfernen',
        onclick: () => { state.ings = state.ings.filter(x => x.key !== i.key); render(); } }, i.label, h('span', { class: 'x', 'aria-hidden': 'true', text: '×' }))),
      input);
    if (ingFocus) { ingFocus = false; setTimeout(() => { const el = document.getElementById('ingInput'); if (el) el.focus(); }, 0); }
    return h('div', { class: 'facet facet-ings', 'data-key': 'ings' }, h('span', { class: 'facet-label', text: 'Zutaten' }), chips, suggest);
  }

  function renderFilters(searchHits) {
    const box = $('#filters');
    const scrollPos = {};
    box.querySelectorAll('.chips').forEach(c => { scrollPos[c.dataset.key] = c.scrollLeft; });
    box.textContent = '';

    const ordered = facetOrder.map(k => FACETS.find(f => f.key === k));
    for (const f of ordered) {
      // Anzahl je Wert, unter Berücksichtigung der Suche und der anderen Filter
      const counts = new Map();
      const labels = new Map();
      for (const r of searchHits) {
        const v = facetValue(r, f.key);
        if (!v) continue;
        if (!labels.has(v)) labels.set(v, facetLabel(r, f.key));
        if (passesFilters(r, f.key)) counts.set(v, (counts.get(v) || 0) + 1);
      }
      // Ausgewählte Werte immer zeigen, auch wenn sie gerade 0 Treffer haben
      for (const v of state.filters[f.key]) {
        if (!labels.has(v)) {
          const any = Store.recipes().find(r => facetValue(r, f.key) === v);
          labels.set(v, f.key === 'collectionId' ? collectionName(v) : (any ? facetLabel(any, f.key) : v));
        }
      }
      let values = [...labels.keys()].filter(v => counts.get(v) || state.filters[f.key].has(v));
      if (!values.length && f.key !== 'collectionId' && !arranging) continue;

      const orderIdx = v => {
        if (f.key === 'collectionId') return window.RecipeCollections.order(v); // Ofen, Pfanne, Topf, Grill, Kalt
        if (!f.order) return 999;
        const i = f.order.findIndex(o => facetKey(o) === v);
        return i < 0 ? 999 : i;
      };
      values.sort((a, b) =>
        orderIdx(a) - orderIdx(b) ||
        (f.key === 'collectionId' ? 0 : (counts.get(b) || 0) - (counts.get(a) || 0)) ||
        labels.get(a).localeCompare(labels.get(b), 'de'));

      const chips = h('div', { class: 'chips', role: 'group', 'aria-label': f.label, 'data-key': f.key },
        values.map(v => {
          const on = state.filters[f.key].has(v);
          return h('button', {
            type: 'button', class: 'chip', 'aria-pressed': on ? 'true' : 'false',
            onclick: () => {
              const set = state.filters[f.key];
              if (set.has(v)) set.delete(v); else set.add(v);
              render();
            }
          }, labels.get(v), h('span', { class: 'n', text: String(counts.get(v) || 0) }));
        }));
      // Favoriten: fest ganz vorn bei den Sammlungen
      if (f.key === 'collectionId') {
        const favCount = searchHits.filter(r => r.favorite && passesFilters(r, 'fav')).length;
        chips.prepend(h('button', {
          type: 'button', class: 'chip chip-fav', 'aria-pressed': state.favOnly ? 'true' : 'false',
          onclick: () => { state.favOnly = !state.favOnly; render(); }
        }, h('span', { class: 'star', 'aria-hidden': 'true', text: '★' }), 'Favoriten', h('span', { class: 'n', text: String(favCount) })));
        // "One Pot": zusätzlich zur Sammlung, erscheint sobald es solche Rezepte gibt
        const onePotCount = searchHits.filter(r => window.RecipeCollections.isOnePot(r) && passesFilters(r, 'onepot')).length;
        if (onePotCount || state.onePotOnly) {
          chips.children[0].after(h('button', {
            type: 'button', class: 'chip chip-onepot', id: 'chipOnePot', 'aria-pressed': state.onePotOnly ? 'true' : 'false',
            onclick: () => { state.onePotOnly = !state.onePotOnly; render(); }
          }, 'One Pot', h('span', { class: 'n', text: String(onePotCount) })));
        }
        // "Zu prüfen": nur sichtbar, solange es automatisch importierte, ungeprüfte Rezepte gibt
        if (Store.recipes().some(r => r.review) || state.reviewOnly) {
          const revCount = searchHits.filter(r => r.review && passesFilters(r, 'review')).length;
          chips.children[0].after(h('button', {
            type: 'button', class: 'chip chip-review', id: 'chipReview', 'aria-pressed': state.reviewOnly ? 'true' : 'false',
            onclick: () => { state.reviewOnly = !state.reviewOnly; render(); }
          }, 'Zu prüfen', h('span', { class: 'n', text: String(revCount) })));
        }
      }
      const pos = facetOrder.indexOf(f.key);
      const label = arranging
        ? h('span', { class: 'facet-label facet-move' }, f.label,
            h('button', { type: 'button', class: 'icon-btn move-up', 'aria-label': f.label + ' nach oben', disabled: pos === 0, onclick: () => moveFacet(f.key, -1) }, '▲'),
            h('button', { type: 'button', class: 'icon-btn move-down', 'aria-label': f.label + ' nach unten', disabled: pos === facetOrder.length - 1, onclick: () => moveFacet(f.key, 1) }, '▼'))
        : h('span', { class: 'facet-label', text: f.label });
      box.append(h('div', { class: 'facet' + (arranging ? ' arranging' : ''), 'data-key': f.key }, label, chips));
      if (scrollPos[f.key]) chips.scrollLeft = scrollPos[f.key];
    }
    box.append(ingredientRow(searchHits));
    box.prepend(h('div', { class: 'facet-tools' }, h('button', {
      type: 'button', class: 'btn-link', id: 'btnArrange', onclick: () => { arranging = !arranging; render(); }
    }, arranging ? 'Fertig' : 'Reihenfolge ändern')));
  }

  // ---------- Startassistent "Rezepte zusammentragen" ----------
  // Erscheint, bis man auf "Fertig" tippt; unter Einstellungen jederzeit wieder einblendbar.
  const START_DONE = 'rezepte.start.fertig';
  function startDone() { try { return localStorage.getItem(START_DONE) === '1'; } catch (e) { return false; } }
  function renderStart() {
    const box = $('#start');
    if (!box) return false;
    const all = Store.recipes();
    const own = all.filter(r => !r.example).length;
    // Nur am Anfang: sobald eigene Rezepte da sind, gibt es alle Wege im Import-Fenster
    if (startDone() || own) { box.hidden = true; box.textContent = ''; return false; }
    const review = all.filter(r => r.review).length;
    const tile = (id, icon, name, sub, onclick) => h('button', { type: 'button', class: 'import-tile', id, onclick },
      h('span', { class: 'import-tile-icon', 'aria-hidden': 'true', text: icon }), h('span', { class: 'import-tile-name', text: name }), h('span', { class: 'import-tile-sub', text: sub }));
    box.textContent = '';
    box.hidden = false;
    const dismiss = () => {
      try { localStorage.setItem(START_DONE, '1'); } catch (e) { /* egal */ }
      render(); toast('Ausgeblendet – unter Einstellungen wieder einblendbar');
    };
    const toReview = () => { resetAll(); state.reviewOnly = true; setFiltersOpen(true); render(); };
    box.append(...[
      h('h2', { id: 'startTitle', text: own ? 'Rezepte zusammentragen' : 'Willkommen! Woher kommen deine Rezepte?' }),
      h('p', { class: 'hint', text: 'Hol deine Rezepte von überall an einen Ort. Danach kommen neue einfach dazu – über „+ Hinzufügen“ oder das Teilen-Menü.' }),
      own ? h('p', { class: 'start-progress', id: 'startProgress' },
        h('b', { text: own === 1 ? '1 Rezept gesammelt' : own + ' Rezepte gesammelt' }),
        review ? ', ' + review + ' noch zu prüfen. ' : '.',
        review ? h('button', { type: 'button', class: 'btn-link', onclick: toReview }, 'Jetzt prüfen') : null) : null,
      h('div', { class: 'import-tiles start-tiles' },
        tile('startApp', '📦', 'Aus anderer App', 'z. B. Recipe Keeper', () => openImport('', false, 'app')),
        tile('startBoard', '📌', 'Pinterest', 'Bis zu 50 Pins je Pinnwand', () => openImport('', false, 'board')),
        tile('startShare', '📲', 'TikTok, Instagram & Co.', 'Über „Teilen“ sammeln', openShareGuide),
        tile('startPhotos', '📷', 'Bildschirmfotos', 'Viele auf einmal', () => openImport('', false, 'photos')),
        tile('startLink', '🔗', 'Link oder Text', 'Webseite, WhatsApp …', () => openImport('')),
        tile('startManual', '✍️', 'Selbst eintragen', 'Omas Rezeptbuch', () => openEdit(null))),
      h('div', { class: 'pick-actions' },
        Store.exampleCount() ? null : h('button', { type: 'button', class: 'btn', onclick: () => {
          try { const n = Store.loadExamples(); toast(n + ' Beispielrezepte geladen'); } catch (e) { toast(e.message); }
        } }, 'Beispielrezepte laden'),
        h('button', { type: 'button', class: 'btn', id: 'startDone', onclick: dismiss }, own ? 'Fertig – ausblenden' : 'Ausblenden'))
    ].filter(Boolean));
    return true;
  }

  // Anleitung: Teilen-Menü einrichten (Apple-Kurzbefehl "zu Rezepten")
  function openShareGuide() {
    const li = t => h('li', { text: t });
    const keyBox = shareBox();
    const content = h('div', { class: 'form' },
      h('p', { class: 'hint', text: 'Damit schickst du Rezepte aus TikTok, Instagram, Facebook, Pinterest oder Safari mit „Teilen → zu Rezepten“ direkt in die App. Einmal pro Gerät einrichten, dauert etwa 5 Minuten.' }),
      h('div', { class: 'import-choice' }, h('p', { class: 'import-choice-name', text: '1. Schlüssel erstellen' }),
        keyBox || h('p', { class: 'hint', text: 'Dafür bitte zuerst anmelden (Online-Speicher).' })),
      h('div', { class: 'import-choice' }, h('p', { class: 'import-choice-name', text: '2. Kurzbefehl anlegen' }),
        h('ol', { class: 'import-steps' },
          li('App „Kurzbefehle“ öffnen, unten „Kurzbefehle“, oben rechts „+“.'),
          li('Oben auf den Namen tippen → „Umbenennen“ → zu Rezepten.'),
          li('Unten auf ⓘ → „Im Share-Sheet anzeigen“ einschalten. Oben „Alle“ antippen und nur „URLs“ und „Text“ lassen.'),
          li('Unten „Suchen“ → „Inhalte von URL abrufen“. Blaues „URL“ antippen → Adresse von oben einfügen.'),
          li('Pfeil ⌄ in der Aktion: Methode POST. „Neue Überschrift hinzufügen“: Schlüssel apikey, Text = apikey von oben.'),
          li('„Haupttext anfordern: JSON“ → „Neues Feld“ → Text: p_key = Schlüssel von oben. Noch ein Feld: p_input = „Variable auswählen“ → Kurzbefehleingabe.'),
          li('Unten „Suchen“ → „Mitteilung anzeigen“, Text löschen → „Variable auswählen“ → Inhalte der URL. Fertig.'))),
      h('div', { class: 'import-choice' }, h('p', { class: 'import-choice-name', text: '3. Sammeln' }),
        h('ol', { class: 'import-steps' },
          li('In TikTok & Co. bei einem Rezept auf „Teilen“ → „Mehr“ → zu Rezepten. Beim ersten Mal „Immer erlauben“.'),
          li('Beliebig viele so teilen – sie warten im Eingangsfach.'),
          li('In der App erscheint „📥 … geteilte Rezepte“ → „Alle importieren“.'))));
    showDialog('share-guide', h('div', { style: 'display:contents' }, head('Teilen einrichten', closeDialog), h('div', { class: 'dlg-scroll' }, content)));
  }

  function placeholder(title) {
    return h('div', { class: 'ph', 'aria-hidden': 'true', text: (title.trim()[0] || '?').toUpperCase() });
  }

  // Zeigt eigenes Foto (Bildspeicher) oder Bild-Adresse; sonst Anfangsbuchstabe
  function setImage(img, recipe, onFail) {
    if (recipe.imageId) {
      window.RecipeImages.url(recipe.imageId).then(u => { if (u) img.src = u; else onFail(); }).catch(onFail);
    } else if (safeUrl(recipe.imageUrl)) {
      img.src = safeUrl(recipe.imageUrl);
    } else return false;
    img.addEventListener('error', onFail);
    return true;
  }

  function imageBox(cls, recipe) {
    const box = h('div', { class: cls });
    const img = h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    const fail = () => { if (img.isConnected) { img.remove(); box.append(placeholder(recipe.title)); } };
    if (setImage(img, recipe, fail)) box.append(img); else box.append(placeholder(recipe.title));
    return box;
  }


  function renderGrid(list, total) {
    const grid = $('#grid');
    const empty = $('#empty');
    grid.textContent = '';
    empty.textContent = '';

    const startShown = renderStart();
    if (!total && startShown) { empty.hidden = true; return; }
    if (!total) {
      empty.hidden = false;
      empty.append(
        h('h2', { text: 'Noch keine Rezepte' }),
        h('p', { text: 'Lege dein erstes Rezept an. Zum Ausprobieren kannst du auch ' + (window.EXAMPLE_RECIPES || []).length + ' Beispielrezepte laden. Unter „Einstellungen“ lassen sie sich später mit einem Tipp wieder entfernen.' }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openEdit(null) }, '+ Neues Rezept'),
          h('button', {
            type: 'button', class: 'btn', onclick: () => {
              try { const n = Store.loadExamples(); toast(n + ' Beispielrezepte geladen'); } catch (e) { toast(e.message); }
            }
          }, 'Beispielrezepte laden')));
      return;
    }
    if (!list.length && state.favOnly && !Store.recipes().some(r => r.favorite)) {
      empty.hidden = false;
      empty.append(
        h('h2', { text: 'Noch keine Favoriten' }),
        h('p', { text: 'Öffne ein Rezept und tippe oben rechts auf den Stern ☆. Dann erscheint es hier.' }),
        h('button', { type: 'button', class: 'btn', onclick: resetAll }, 'Alle Rezepte zeigen'));
      return;
    }
    if (!list.length) {
      empty.hidden = false;
      empty.append(
        h('h2', { text: 'Keine Treffer' }),
        h('p', { text: state.query.trim() ? 'Für „' + state.query.trim() + '“ mit den gewählten Filtern wurde nichts gefunden.' : 'Mit diesen Filtern wurde nichts gefunden.' }),
        h('button', { type: 'button', class: 'btn', onclick: resetAll }, 'Suche und Filter zurücksetzen'));
      return;
    }
    empty.hidden = true;
    const frag = document.createDocumentFragment();
    for (const r of list) {
      const meta = [window.RecipeTime.label(r), collectionName(r.collectionId)].filter(Boolean).join(' · ');
      const img = imageBox('tile-img', r);
      if (r.favorite) img.append(h('span', { class: 'fav-badge', 'aria-label': 'Favorit', text: '★' }));
      if (r.review) img.append(h('span', { class: 'review-badge', text: 'neu' }));
      frag.append(h('button', { type: 'button', class: 'tile', 'data-id': r.id, onclick: () => openDetail(r.id) },
        img,
        h('div', { class: 'tile-body' },
          h('span', { class: 'tile-title', text: r.title }),
          meta ? h('span', { class: 'tile-meta', text: meta }) : null)));
    }
    grid.append(frag);
  }

  function resetAll() {
    state.query = '';
    state.favOnly = false;
    state.reviewOnly = false;
    state.onePotOnly = false;
    state.ings = [];
    $('#q').value = '';
    for (const k in state.filters) state.filters[k].clear();
    render();
  }

  // ---------- Fenster (Dialog) ----------
  const dlg = $('#dlg');
  const body = $('#dlgBody');

  function showDialog(mode, content) {
    state.mode = mode;
    body.textContent = '';
    body.append(content);
    if (!dlg.open) {
      dlg.showModal();
      document.body.classList.add('modal-open');
    }
    const scroller = body.querySelector('.dlg-scroll');
    if (scroller) scroller.scrollTop = 0;
  }

  function hideDialog() {
    if (dlg.open) dlg.close();
    if (slideReset) resetSlide();
    document.body.classList.remove('modal-open');
    state.mode = null;
  }

  const HASH = /^#rezept-(.+)$/;
  function hashId() { const m = location.hash.match(HASH); return m ? decodeURIComponent(m[1]) : null; }
  function clearHash() {
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { location.hash = ''; }
  }

  // Im verlinkten Rezept geht es einen Schritt zurück, sonst schließt sich das Fenster
  function closeDetail() {
    if (state.mode === 'detail' && state.depth > 1) history.back();
    else closeDialog();
  }

  function closeDialog() {
    if (hashId()) {
      if (state.depth > 0) { const d = state.depth; state.depth = 0; history.go(-d); return; } // hashchange schließt
      clearHash();
    }
    hideDialog();
  }

  dlg.addEventListener('cancel', e => { e.preventDefault(); const ex = body.querySelector('.explain'); if (ex) { ex.remove(); return; } if (state.mode === 'detail') closeDetail(); else if (state.mode !== 'edit') closeDialog(); });
  dlg.addEventListener('click', e => { if (e.target === dlg && state.mode === 'detail') closeDetail(); });

  // Wischen vom linken Rand = zurück (wie in iOS-Apps).
  // Im Browser hat Safari dafür eine eigene Geste mit eigener Animation; dort bewegt
  // die App nichts selbst. Nur als Home-Bildschirm-App (ohne eingebaute Geste) gleitet
  // das Rezept mit dem Finger und beim Loslassen ganz nach rechts hinaus.
  const standalone = () => window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  let swipe = null;
  let lastHashChange = 0;
  let slideReset = null;
  window.addEventListener('hashchange', () => { lastHashChange = Date.now(); });
  function resetSlide() {
    clearTimeout(slideReset);
    slideReset = null;
    dlg.style.transition = 'none';
    dlg.style.transform = '';
    requestAnimationFrame(() => { dlg.style.transition = ''; });
  }
  document.addEventListener('touchstart', e => {
    if (!dlg.open || state.mode !== 'detail' || e.touches.length !== 1) { swipe = null; return; }
    const t = e.touches[0];
    swipe = t.clientX <= 30 ? { x: t.clientX, y: t.clientY, start: Date.now(), dx: 0, own: standalone() } : null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!swipe) return;
    const t = e.touches[0];
    swipe.dx = t.clientX - swipe.x;
    if (Math.abs(t.clientY - swipe.y) > Math.max(40, swipe.dx)) {
      if (swipe.own) { dlg.style.transition = 'transform .15s ease'; dlg.style.transform = ''; }
      swipe = null;
      return;
    }
    if (swipe.own && swipe.dx > 0) { dlg.style.transition = 'none'; dlg.style.transform = 'translateX(' + swipe.dx + 'px)'; }
  }, { passive: true });
  const endSwipe = cancelled => {
    if (!swipe) return;
    const s = swipe;
    swipe = null;
    const done = !cancelled && s.dx >= 80;
    if (!s.own) {
      // Browser: Falls Safari nicht schon selbst zurückgegangen ist, jetzt zurück – ohne Animation
      if (done) setTimeout(() => { if (lastHashChange < s.start && state.mode === 'detail') closeDetail(); }, 300);
      return;
    }
    if (!done) {
      dlg.style.transition = 'transform .15s ease';
      dlg.style.transform = '';
      return;
    }
    // Ganz nach rechts hinausgleiten, dann zurück; danach Position ohne Animation zurücksetzen
    dlg.style.transition = 'transform .18s ease-out';
    dlg.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (state.mode === 'detail') closeDetail();
      slideReset = setTimeout(resetSlide, 600); // Sicherheitsnetz
    }, 180);
  };
  document.addEventListener('touchend', () => endSwipe(false));
  document.addEventListener('touchcancel', () => endSwipe(true));

  window.addEventListener('hashchange', syncFromHash);
  function syncFromHash() {
    const id = hashId();
    if (id) {
      // Ohne eigenes Öffnen ist das die Zurück-Taste (z. B. vom verlinkten Rezept zurück)
      if (!state.pushing && state.depth > 0) state.depth--;
      state.pushing = false;
      if (Store.recipe(id)) {
        if (!(state.mode === 'detail' && body.dataset.id === id)) renderDetail(id);
        if (slideReset) resetSlide();
      } else { clearHash(); hideDialog(); toast('Dieses Rezept gibt es nicht mehr.'); }
    } else {
      state.depth = 0;
      state.pushing = false;
      if (state.mode === 'detail') hideDialog();
    }
  }

  function openDetail(id) {
    if (hashId() === id) { renderDetail(id); return; }
    state.depth++;
    state.pushing = true;
    location.hash = 'rezept-' + encodeURIComponent(id); // hashchange zeigt das Rezept
  }

  function head(title, onClose, extra) {
    return h('div', { class: 'dlg-head' },
      h('h2', { id: 'dlgTitle', text: title }),
      h('div', { class: 'dlg-head-actions' }, extra || null,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schließen', onclick: onClose }, '×')));
  }

  function favButton(id) {
    const btn = h('button', { type: 'button', class: 'icon-btn fav-btn' });
    const show = () => {
      const on = !!(Store.recipe(id) || {}).favorite;
      btn.textContent = on ? '★' : '☆';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen');
    };
    btn.addEventListener('click', () => {
      try { const on = Store.toggleFavorite(id); show(); toast(on ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt'); }
      catch (e) { toast(e.message); }
    });
    show();
    return btn;
  }

  // ---------- Fachbegriffe: markieren und auf Antippen erklären ----------
  let glossSeen = new Set();
  function withTerms(text, seen) {
    return window.RecipeGlossary.split(text, seen).map(part => part.term
      ? h('button', { type: 'button', class: 'term', 'data-term': part.term, 'aria-haspopup': 'dialog', onclick: e => { e.stopPropagation(); explain(part.term, part.text); } }, part.t)
      : part.t);
  }
  function explain(term, text) {
    const old = body.querySelector('.explain');
    if (old) old.remove();
    const box = h('div', { class: 'explain', role: 'status', 'aria-live': 'polite' },
      h('b', { text: term }), h('p', { text: text }));
    body.append(box);
    // Ein Tipp irgendwohin schließt die Erklärung (pointerdown, weil iOS bei Text keinen Klick meldet)
    setTimeout(() => document.addEventListener('pointerdown', () => box.remove(), { capture: true, once: true }), 0);
  }

  function renderDetail(id) {
    glossSeen = new Set();
    const r = Store.recipe(id);
    if (!r) return;
    body.dataset.id = id;

    const tags = [r.course, r.mainIngredient, r.method].filter(Boolean);
    const facts = [];
    const time = window.RecipeTime.label(r);
    if (time) facts.push(h('span', null, 'Zeit: ', h('b', { text: time })));
    facts.push(h('span', null, 'Sammlung: ', h('b', { text: collectionName(r.collectionId) })));

    const src = safeUrl(r.sourceUrl);
    // Quelle gut sichtbar oben bei den Eckdaten ("Original: tiktok.com ↗")
    if (src) {
      let host = 'Internetseite';
      try { host = new URL(src).hostname.replace(/^(www|m|vm)\./, ''); } catch (e) { /* egal */ }
      facts.push(h('span', null, 'Original: ', h('a', { href: src, target: '_blank', rel: 'noopener noreferrer', class: 'source-link', text: host + ' ↗' })));
    }
    const hints = r.review ? window.RecipeImporter.reviewHints(r) : [];
    const reviewBar = r.review ? h('div', { class: 'notice review-notice', id: 'reviewNotice' },
      h('p', null, h('b', { text: hints.length ? 'Bitte prüfen:' : 'Sieht vollständig aus.' }),
        hints.length ? '' : ' Nur kurz drüberschauen und unten auf „Passt ✓“ tippen.'),
      hints.length ? h('ul', { class: 'review-hints' }, hints.map(x => h('li', { text: x }))) : null,
      hints.length ? h('p', { class: 'hint', text: 'Passt alles? Unten auf „Passt ✓“ tippen, sonst „Bearbeiten“.' }) : null,
      (hints.minor || []).length ? h('p', { class: 'review-minor', text: hints.minor.join(' ') }) : null) : null;
    function markReviewed() {
        // Nächstes ungeprüftes Rezept (in der Reihenfolge der Übersicht) direkt öffnen
        const order = [...document.querySelectorAll('#grid .tile[data-id]')].map(t => t.dataset.id);
        const pending = new Set(Store.recipes().filter(x => x.review && x.id !== id).map(x => x.id));
        const after = order.slice(order.indexOf(id) + 1).concat(order.slice(0, Math.max(0, order.indexOf(id))));
        const next = after.find(x => pending.has(x)) || [...pending][0];
        try { Store.setReviewed(id); } catch (e) { toast(e.message); return; }
        if (next) {
          toast('Geprüft ✓ – noch ' + pending.size);
          location.replace(location.pathname + location.search + '#rezept-' + encodeURIComponent(next));
        } else {
          closeDialog();
          toast('Alles geprüft ✓');
        }
    }
    const content = h('div', { class: 'detail' }, reviewBar,
      (r.imageId || safeUrl(r.imageUrl)) ? (() => {
        const img = h('img', { class: 'detail-img', alt: '', referrerpolicy: 'no-referrer' });
        setImage(img, r, () => img.remove());
        return img;
      })() : null,
      tags.length ? h('div', { class: 'tags' }, tags.map(t => h('span', { class: 'tag', text: t }))) : null,
      h('div', { class: 'facts' }, facts),
      r.ingredients.length ? ingredientsSection(r) : null,
      r.steps.length ? h('section', null, h('h3', { text: 'Zubereitung' }),
        h('ol', null, r.steps.map(s => h('li', null, withTerms(s, glossSeen))))) : null,
      r.notes ? notesSection(r) : null,
      !src && r.deadSourceUrl ? h('p', { class: 'source gone-source', text: (/tiktok\.com/i.test(r.deadSourceUrl) ? 'TikTok-Video' : 'Quelle (' + (() => { try { return new URL(r.deadSourceUrl).hostname.replace(/^www\./, ''); } catch (e) { return 'Internetseite'; } })() + ')') + ' nicht mehr verfügbar' }) : null
    );

    const foot = h('div', { class: 'dlg-foot' });
    const normalFoot = () => {
      foot.textContent = '';
      const reviewing = !!(Store.recipe(id) || {}).review;
      foot.append(
        h('button', { type: 'button', class: 'btn btn-danger', onclick: askDelete }, 'Löschen'),
        h('button', { type: 'button', class: 'btn' + (reviewing ? '' : ' btn-primary'), onclick: () => openEdit(id) }, 'Bearbeiten'),
        // Beim Prüfen immer unten sichtbar
        ...(reviewing ? [h('button', { type: 'button', class: 'btn btn-primary', id: 'btnReviewed', onclick: markReviewed }, 'Passt ✓')] : []));
    };
    function askDelete() {
      foot.textContent = '';
      foot.append(h('div', { class: 'confirm' },
        h('p', { text: '„' + r.title + '“ wirklich löschen?' }),
        h('button', { type: 'button', class: 'btn', onclick: normalFoot }, 'Abbrechen'),
        h('button', {
          type: 'button', class: 'btn btn-danger-solid', onclick: () => {
            try { Store.deleteRecipe(id); toast('Rezept gelöscht'); } // schließt sich über onChange
            catch (e) { toast(e.message); }
          }
        }, 'Ja, löschen')));
    }
    normalFoot();

    showDialog('detail', h('div', { style: 'display:contents' },
      head(r.title, closeDetail, favButton(id)), h('div', { class: 'dlg-scroll' }, content), foot));
  }

  // ---------- Notizen, darunter passende eigene Rezepte ----------
  function notesSection(r) {
    const ids = [...new Set(window.RecipeLinks.findLinks(r, Store.recipes()).map(l => l.id))].filter(id => Store.recipe(id));
    return h('section', null, h('h3', { text: 'Notizen' }), h('p', { class: 'notes' }, withTerms(r.notes, glossSeen)),
      ids.length ? h('div', { class: 'related' }, h('span', { class: 'related-label', text: 'Passt dazu:' }),
        ids.map(id => h('button', { type: 'button', class: 'btn related-btn', onclick: () => openDetail(id) },
          Store.recipe(id).title, h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })))) : null);
  }

  // ---------- Zutaten mit Reglern ----------
  function stepper(label, onMinus, onPlus) {
    const value = h('span', { class: 'stepper-value', 'aria-live': 'polite' });
    const minus = h('button', { type: 'button', class: 'icon-btn', 'aria-label': label + ': weniger', onclick: onMinus }, '−');
    const plus = h('button', { type: 'button', class: 'icon-btn', 'aria-label': label + ': mehr', onclick: onPlus }, '+');
    return { el: h('div', { class: 'stepper', role: 'group', 'aria-label': label }, minus, value, plus), value, minus, plus };
  }

  function ingredientsSection(r) {
    const Sc = window.RecipeScale;
    const F = window.RecipeForms;
    const base = r.servings;
    const unit = F.normalizeUnit(r.servingsUnit);
    const section = h('section', { class: 'ingredients' });
    const list = h('ul');
    const controls = h('div', { class: 'ing-controls' });
    let factor = () => 1;
    let refresh = () => {};

    // Springform ↔ Blech nur bei Kuchen (nicht bei Granola, Ofengemüse, Pizza …)
    const cakeLike = unit === 'Springform' || /kuchen|torte|tarte|cheesecake|brownie|schnitten|streusel|blondie|biskuit|crumble/i.test(r.title || '');
    if (base && F.switchable(unit) && cakeLike) {
      // Kuchen: zwischen Springform und Blech wechseln, Mengen nach Bodenfläche
      const baseSize = F.parseSize(unit, r.formSize);
      const baseArea = F.area(unit, baseSize) * base;
      let cur = unit;
      let d = unit === 'Springform' ? baseSize.d : F.DEFAULTS.Springform.d;
      const blech = unit === 'Blech' ? baseSize : F.DEFAULTS.Blech;
      const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Backform' });
      const segBtns = ['Springform', 'Blech'].map(u => h('button', {
        type: 'button', class: 'seg', 'aria-pressed': 'false', onclick: () => { cur = u; update(); }
      }, u));
      seg.append(...segBtns);
      const dia = stepper('Durchmesser', () => { d = Math.max(12, d - 2); update(); }, () => { d = Math.min(32, d + 2); update(); });
      const blechInfo = h('span', { class: 'size-info' });
      controls.append(seg, dia.el, blechInfo);
      factor = () => (cur === 'Springform' ? F.area('Springform', { d }) : F.area('Blech', blech)) / baseArea;
      refresh = () => {
        segBtns.forEach(b => b.setAttribute('aria-pressed', b.textContent === cur ? 'true' : 'false'));
        dia.el.hidden = cur !== 'Springform';
        blechInfo.hidden = cur !== 'Blech';
        dia.value.textContent = 'Ø ' + Sc.formatCount(d) + ' cm';
        dia.minus.disabled = d <= 12;
        dia.plus.disabled = d >= 32;
        blechInfo.textContent = 'Blech ' + F.formatSize('Blech', blech);
      };
    } else if (base) {
      // Personen starten immer bei 4, Stück/Kastenform bei ihrer eigenen Menge
      let target = unit === 'Personen' ? 4 : base;
      const count = stepper('Menge', () => { target = Math.max(1, Math.ceil(target - 1e-9) - 1); update(); },
        () => { target = Math.floor(target + 1e-9) + 1; update(); });
      controls.append(count.el);
      if (unit === 'Blech') controls.append(h('span', { class: 'size-info', text: 'Blech ' + F.formatSize('Blech', F.parseSize('Blech', r.formSize)) }));
      if (unit === 'Kastenform') controls.append(h('span', { class: 'size-info', text: 'Kastenform ' + F.formatSize('Kastenform', F.parseSize('Kastenform', r.formSize)) }));
      // Gläser: Glasgröße umstellbar, Mengen nach Gesamtinhalt
      let glassFactor = () => 1;
      let glassRefresh = () => {};
      if (unit === 'Gläser') {
        const sizes = F.GLASSES.map(g => g[0]);
        const baseMl = F.parseSize('Gläser', r.formSize).ml;
        if (!sizes.includes(baseMl)) { sizes.push(baseMl); sizes.sort((a, b) => a - b); }
        let i = sizes.indexOf(baseMl);
        const glass = stepper('Glasgröße', () => { i = Math.max(0, i - 1); update(); }, () => { i = Math.min(sizes.length - 1, i + 1); update(); });
        controls.append(h('div', { class: 'form-size' }, h('span', { class: 'form-size-label', text: 'je Glas' }), glass.el));
        glassFactor = () => sizes[i] / baseMl;
        glassRefresh = () => {
          glass.value.textContent = F.formatSize('Gläser', { ml: sizes[i] });
          glass.minus.disabled = i === 0;
          glass.plus.disabled = i === sizes.length - 1;
        };
      }
      factor = () => target / base * glassFactor();
      refresh = () => {
        count.value.textContent = Sc.servingsLabel(target, unit);
        count.minus.disabled = target <= 1;
        glassRefresh();
      };
    }

    function update() {
      refresh();
      const f = factor();
      list.textContent = '';
      const ingSeen = new Set(); // jeder Begriff nur einmal markieren
      for (const line of r.ingredients) {
        const alt = window.RecipeSubstitutes.alternativeFor(line);
        list.append(h('li', null, Sc.scaleIngredient(line, f).map(p => p.amount ? h('b', null, withTerms(p.t, ingSeen)) : withTerms(p.t, ingSeen)),
          alt ? h('span', { class: 'alt', text: 'Alternative: ' + alt }) : null));
      }
    }
    update();
    // Begriffe aus den Zutaten in Schritten/Notizen nicht noch einmal markieren
    list.querySelectorAll('.term').forEach(t => glossSeen.add(t.dataset.term));

    section.append(h('div', { class: 'ing-head' }, h('h3', { text: 'Zutaten' }), controls), list);
    if (!base) section.append(h('p', { class: 'hint', text: 'Zum Umrechnen: Tippe auf „Bearbeiten“ und trage ein, für wie viele Personen das Rezept ist.' }));
    if (r.ingredients.length && (window.APP_CONFIG || {}).supabaseUrl) section.append(bringBox(r, () => r.ingredients.map(l => Sc.scaleText(l, factor()))));
    return section;
  }

  // ---------- Zutaten an Bring! schicken ----------
  // Bring! liest Rezepte von Webseiten (schema.org). Das Server-Programm erzeugt dafür eine Seite
  // aus den Daten im Link (nichts wird gespeichert); Bring! öffnet sich dann mit den Zutaten zum Übernehmen.
  // Vorrat, den man meist zu Hause hat: wird nicht automatisch mitgeschickt, sondern abgefragt
  const PANTRY = /(salz|pfeffer|gewürz|paprikapulver|edelsüß|rosenscharf|currypulver|curry\b|kurkuma|kreuzkümmel|kümmel|zimt|muskat|oregano|thymian\b|rosmarin\b|basilikum\b|majoran|chiliflocken|chilipulver|cayenne|knoblauchpulver|zwiebelpulver|lorbeer|nelken|piment|vanillezucker|vanilleextrakt|backpulver|natron|speisestärke|stärke\b|\böl\b|öl\s*\(|olivenöl|rapsöl|sonnenblumenöl|pflanzenöl|kokosöl|sesamöl|essig|balsamico|sojasauce|sojasoße|senf|ketchup|honig|zucker|mehl\b|weizenmehl|butter\b|margarine|milch\b|wasser|brühe|fond|gemüsebrühe|hühnerbrühe|brühpulver|semmelbrösel|paniermehl)/i;
  const FRESH_EXCEPTIONS = /(frisch|bund|zweig|knolle|stange)/i; // "1 Bund frischer Thymian" kauft man
  const isPantry = l => PANTRY.test(l) && !FRESH_EXCEPTIONS.test(l);
  function bringLink(title, lines) {
    const cfg = window.APP_CONFIG || {};
    const json = JSON.stringify({ t: title, i: lines });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    const data = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const page = String(cfg.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/import?bring=' + data;
    return 'https://api.getbring.com/rest/bringrecipes/deeplink?url=' + encodeURIComponent(page) + '&source=web&baseQuantity=1&requestedQuantity=1';
  }
  function bringBox(r, currentLines) {
    const box = h('div', { class: 'bring' });
    const open = h('button', { type: 'button', class: 'btn', id: 'btnBring' }, '🛒 Auf die Einkaufsliste (Bring!)');
    function closed() { box.textContent = ''; box.append(open); }
    open.addEventListener('click', () => {
      const lines = currentLines();
      box.textContent = '';
      const checks = lines.map((l, i) => {
        const pantry = isPantry(l);
        const cb = h('input', { type: 'checkbox', id: 'bring' + i, checked: !pantry });
        return { l, cb, pantry, row: h('label', { class: 'bring-row', for: 'bring' + i }, cb, h('span', { text: l })) };
      });
      const buy = checks.filter(c => !c.pantry), home = checks.filter(c => c.pantry);
      const send = h('button', { type: 'button', class: 'btn btn-primary', id: 'bringSend' }, 'An Bring! schicken');
      send.addEventListener('click', () => {
        const chosen = checks.filter(c => c.cb.checked).map(c => c.l);
        if (!chosen.length) { toast('Bitte mindestens eine Zutat auswählen'); return; }
        const link = bringLink(r.title, chosen);
        window.RecipeBringLast = link; // für Tests
        window.open(link, '_blank', 'noopener');
        toast('Bring! wird geöffnet …');
        closed();
      });
      box.append(
        buy.length ? h('div', { class: 'bring-group' },
          h('p', { class: 'bring-head', text: 'Einkaufen' }),
          h('p', { class: 'hint', text: 'Mengen wie gerade eingestellt. Abhaken, was du nicht brauchst.' }),
          h('div', { class: 'bring-list', id: 'bringBuy' }, buy.map(c => c.row))) : null,
        home.length ? h('div', { class: 'bring-group' },
          h('p', { class: 'bring-head', text: 'Hast du das zu Hause?' }),
          h('p', { class: 'hint', text: 'Vorratssachen werden nicht automatisch mitgeschickt. Antippen, was du brauchst.' }),
          h('div', { class: 'bring-list', id: 'bringHome' }, home.map(c => c.row))) : null,
        h('div', { class: 'pick-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => checks.forEach(c => { c.cb.checked = !c.cb.checked; }) }, 'Alle umkehren'),
          h('button', { type: 'button', class: 'btn', onclick: closed }, 'Abbrechen'), send));
    });
    closed();
    return box;
  }

  // ---------- Import über Link ----------
  // ---------- Import: Startseite (Link oder Text) + Kacheln für die anderen Wege ----------
  function openImport(prefill, autoRun, startView) {
    const S = window.RecipeSync;
    const msg = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const status = h('p', { class: 'hint', 'aria-live': 'polite', hidden: true });
    const manual = h('button', { type: 'button', class: 'btn', hidden: true }, 'Selbst eintragen');
    const say = (el, t) => { el.textContent = t || ''; el.hidden = !t; };
    const reset = () => { say(msg, ''); say(status, ''); manual.hidden = true; };
    const scroll = h('div', { class: 'dlg-scroll' });
    const title = h('h2', { id: 'dlgTitle', text: 'Rezept hinzufügen' });
    const back = h('button', { type: 'button', class: 'btn-link import-back', id: 'importBack', hidden: true, onclick: () => show('home') }, '‹ Zurück');
    const header = h('div', { class: 'dlg-head' }, h('div', { class: 'import-title' }, back, title),
      h('div', { class: 'dlg-head-actions' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schließen', onclick: closeDialog }, '×')));

    // ---- Link laden ----
    const input = h('textarea', { id: 'importUrl', rows: 3, placeholder: 'Link (Webseite, TikTok, Pinterest, Facebook) oder Rezepttext hier einfügen …', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    input.value = prefill || '';
    const go = h('button', { type: 'submit', class: 'btn btn-primary', id: 'importGo' }, 'Importieren');
    async function runLink(url) {
      // Schon vorhanden?
      const same = Store.recipes().find(x => x.sourceUrl && x.sourceUrl.replace(/[?#].*$/, '').replace(/\/$/, '') === url.replace(/[?#].*$/, '').replace(/\/$/, ''));
      if (same) {
        msg.textContent = '';
        msg.append('Dieses Rezept hast du schon: „' + same.title + '“. ',
          h('button', { type: 'button', class: 'btn-link', onclick: () => openDetail(same.id) }, 'Öffnen'));
        msg.hidden = false;
        return;
      }
      if (!S || !S.enabled || !S.fetchPage) { say(msg, 'Der Import braucht den Online-Speicher. In dieser Vorschau ist er nicht verfügbar.'); return; }
      go.disabled = true; say(status, 'Rezept wird geladen …');
      try {
        const res = await S.fetchPage(url);
        const r = window.RecipeImporter.toDraft(res);
        if (!r || r.how === 'tiktok-empty' || r.how === 'pin-empty') {
          say(status, '');
          say(msg, r && r.how === 'tiktok-empty' ? 'In der Beschreibung dieses TikTok-Videos steht kein Rezept. Mach ein Bildschirmfoto vom Rezept im Video und nimm „Bildschirmfotos“.'
            : r ? 'Dieser Pin führt zu keiner Rezeptseite und in seiner Beschreibung steht kein Rezept. Mach ein Bildschirmfoto vom Pin und nimm „Bildschirmfotos“.'
            : 'Auf dieser Seite wurde kein Rezept gefunden.');
          manual.hidden = false;
          manual.onclick = () => openEdit(null, { title: (res && res.title) || '', sourceUrl: url, imageUrl: (res && res.image) || '' });
          return;
        }
        openEdit(null, { ...r.draft, importHow: r.how });
      } catch (e) {
        say(status, '');
        say(msg, e.message);
        manual.hidden = false;
        manual.onclick = () => openEdit(null, { sourceUrl: url });
      } finally {
        go.disabled = false;
      }
    }
    // Ein Feld für alles: Link (auch mit etwas Text drumherum) oder Rezepttext
    function run() {
      reset();
      const text = input.value.trim();
      if (!text) { say(msg, 'Bitte einen Link oder einen Rezepttext einfügen.'); input.focus(); return; }
      const link = (text.match(/https?:\/\/[^\s<>"']+/i) || [''])[0].replace(/[).,;!?]+$/, '');
      const rest = text.replace(link, ' ').replace(/\s+/g, ' ').trim();
      if (link && rest.length < 80 && !/\n/.test(text.replace(link, ''))) { input.value = link; runLink(link); return; }
      if (!link && text.length < 40 && !/\n/.test(text)) { say(msg, 'Bitte einen Link einfügen, der mit https:// beginnt – oder einen ganzen Rezepttext.'); input.focus(); return; }
      const d = window.RecipeImporter.fromText(text.replace(link, ' '), { url: link });
      if (!d.ingredients.length && !d.steps.length) {
        say(msg, 'In diesem Text wurde kein Rezept erkannt. Stehen Zutaten (mit Mengen) oder Arbeitsschritte darin?');
        manual.hidden = false;
        manual.onclick = () => openEdit(null, { title: '', notes: text.slice(0, 3000), sourceUrl: link, fromText: true });
        return;
      }
      if (d.title === 'Importiertes Rezept') d.title = '';
      openEdit(null, { ...d, fromText: true });
    }
    // Eingesetzt (lange tippen -> "Einsetzen"): gleich loslegen
    input.addEventListener('paste', e => {
      const hasFiles = e.clipboardData && e.clipboardData.files && e.clipboardData.files.length;
      if (!hasFiles) setTimeout(() => { if (input.value.trim()) run(); }, 0);
    });

    // ---- Bildschirmfotos ----
    const photos = h('input', { type: 'file', id: 'importPhotos', accept: 'image/*', multiple: true, class: 'visually-hidden' });
    const photosMany = h('input', { type: 'file', id: 'importPhotosMany', accept: 'image/*', multiple: true, class: 'visually-hidden' });
    async function fromPhotos(files) {
      files = [...files].filter(f => /^image\//.test(f.type || 'image/'));
      if (!files.length) return;
      reset(); say(status, 'Fotos werden gelesen …');
      try {
        const text = await window.RecipeOCR.recognize(files, t => say(status, t));
        say(status, '');
        const d = window.RecipeImporter.fromText(text, { ocr: true });
        if (!d.ingredients.length && !d.steps.length) {
          say(msg, 'Auf ' + (files.length > 1 ? 'den Fotos' : 'dem Foto') + ' wurde kein Rezept erkannt. Tipp: ein Bildschirmfoto machen, wenn die Zutaten groß im Bild stehen.');
          manual.hidden = false;
          manual.onclick = () => openEdit(null, { title: '', notes: text.slice(0, 1000), fromPhoto: true });
          return;
        }
        if (d.title === 'Importiertes Rezept') d.title = '';
        openEdit(null, { ...d, fromPhoto: true });
      } catch (e) {
        say(status, '');
        say(msg, e.message || 'Die Fotos konnten nicht gelesen werden.');
      } finally { photos.value = ''; }
    }
    photos.addEventListener('change', () => fromPhotos(photos.files));
    // Viele Rezepte auf einmal: jedes Foto ein eigenes Rezept
    photosMany.addEventListener('change', () => {
      const files = [...photosMany.files].filter(f => /^image\//.test(f.type || 'image/'));
      photosMany.value = '';
      if (!files.length) return;
      const pins = files.map((f, i) => ({
        id: 'foto' + i, text: 'Foto ' + (i + 1),
        makeDraft: async () => {
          const d = window.RecipeImporter.fromText(await window.RecipeOCR.recognize([f]), { ocr: true });
          if (!d.title || d.title === 'Importiertes Rezept') { d.title = 'Rezept vom Bildschirmfoto ' + (i + 1); d.titleMissing = true; }
          d.importHow = 'photo';
          return d;
        }
      }));
      openBoardImport({ pins }, {
        title: 'Bildschirmfotos importieren', word: 'Fotos', batchPrefix: 'foto-', workers: 1,
        info: files.length + ' Bildschirmfotos ausgewählt – jedes wird ein eigenes Rezept.',
        complete: d => !!(d && (d.ingredients.length >= 2 || d.steps.length >= 1))
      });
    });

    // ---- Pinterest-Pinnwand (neueste 50 Pins) ----
    let pinName = '';
    try { pinName = localStorage.getItem('rezepte.pinterestName') || ''; } catch (e) { /* egal */ }
    const pinUser = h('input', { id: 'pinUser', type: 'text', placeholder: 'z. B. oopusteblumeoo', value: pinName, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const pinBoard = h('input', { id: 'pinBoard', type: 'text', placeholder: 'z. B. Rezepte', autocomplete: 'off' });
    const pinBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'pinLoad' }, 'Pins laden');
    pinBtn.addEventListener('click', async () => {
      reset();
      const user = pinUser.value.trim().replace(/^@/, ''), board = pinBoard.value.trim();
      if (!user || !board) { say(msg, 'Bitte deinen Pinterest-Namen und den Namen der Pinnwand eintragen.'); (user ? pinBoard : pinUser).focus(); return; }
      if (!S || !S.enabled || !S.fetchPage) { say(msg, 'Der Import braucht den Online-Speicher.'); return; }
      try { localStorage.setItem('rezepte.pinterestName', user); } catch (e) { /* egal */ }
      pinBtn.disabled = true; say(status, 'Pinnwand wird geladen …');
      try {
        const res = await window.RecipeImporter.loadBoard(user, board, S.pinterestBoard);
        say(status, '');
        if (!res.pins || !res.pins.length) { say(msg, 'Auf dieser Pinnwand wurden keine Pins gefunden.'); return; }
        openBoardImport(res);
      } catch (e) { say(status, ''); say(msg, e.message); } finally { pinBtn.disabled = false; }
    });

    // ---- Aus einer anderen App (Recipe Keeper) ----
    const appFile = h('input', { type: 'file', id: 'importApp', accept: '.zip,.html,.htm,application/zip,text/html', class: 'visually-hidden' });
    appFile.addEventListener('change', async () => {
      const f = appFile.files[0];
      appFile.value = '';
      if (!f) return;
      reset(); say(status, 'Datei wird gelesen …');
      try {
        const list = await window.RecipeKeeper.read(f);
        say(status, '');
        if (!list.length) { say(msg, 'In der Datei wurden keine Rezepte gefunden.'); return; }
        const pins = list.map((x, i) => ({ id: 'rk' + i, draft: x.draft, getImage: x.getImage, url: x.draft.sourceUrl || '', text: x.raw.name }));
        openBoardImport({ pins }, {
          title: 'Aus Recipe Keeper importieren', word: 'Rezepte', batchPrefix: 'rk-',
          info: list.length + ' Rezepte gefunden' + (list.some(x => x.getImage) ? ', mit Fotos.' : '.'),
          complete: d => !!(d && d.title)
        });
      } catch (e) { say(status, ''); say(msg, e.message || 'Die Datei konnte nicht gelesen werden.'); }
    });

    // ---- Bausteine der Ansichten ----
    const pickBtn = (forId, text, cls) => {
      const l = h('label', { for: forId, class: 'btn pick-btn ' + (cls || ''), role: 'button', tabindex: '0' }, text);
      l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById(forId).click(); } });
      return l;
    };
    const tile = (id, icon, name, sub, onclick) => h('button', { type: 'button', class: 'import-tile', id, onclick },
      h('span', { class: 'import-tile-icon', 'aria-hidden': 'true', text: icon }), h('span', { class: 'import-tile-name', text: name }), h('span', { class: 'import-tile-sub', text: sub }));
    const step = (n, t) => h('li', { text: t });

    function viewHome() {
      const inbox = window.RecipeInbox && window.RecipeInbox.count ? window.RecipeInbox.count() : 0;
      const form = h('form', { class: 'form', novalidate: true, onsubmit: e => { e.preventDefault(); run(); } },
        inbox ? h('div', { class: 'notice import-inbox' },
          h('p', null, h('b', { text: '📥 ' + (inbox === 1 ? '1 geteiltes Rezept' : inbox + ' geteilte Rezepte') }), ' warten im Eingangsfach.'),
          h('button', { type: 'button', class: 'btn btn-primary', id: 'importInbox', onclick: () => window.RecipeInbox.importAll() }, inbox === 1 ? 'Jetzt importieren' : 'Alle importieren')) : null,
        h('div', { class: 'field' },
          h('label', { for: 'importUrl', text: 'Link oder Rezepttext' }), input,
          h('span', { class: 'hint', text: 'Lange ins Feld tippen und „Einsetzen“ – der Import startet dann von selbst. Die App erkennt, ob es ein Link oder ein Rezepttext ist (z. B. aus WhatsApp).' })),
        h('div', { class: 'pick-actions' }, go, manual),
        msg, status,
        h('h3', { class: 'import-more', text: 'Weitere Wege' }),
        h('div', { class: 'import-tiles' },
          tile('tileManual', '✍️', 'Selbst eintragen', 'Leeres Rezept', () => openEdit(null)),
          tile('tilePhotos', '📷', 'Bildschirmfotos', 'Rezept aus Video oder Bild', () => show('photos')),
          tile('tileBoard', '📌', 'Pinterest-Pinnwand', 'Bis zu 50 Pins auf einmal', () => show('board')),
          tile('tileApp', '📦', 'Aus anderer App', 'z. B. Recipe Keeper', () => show('app')),
          tile('tileShare', '📲', 'Über Teilen', 'TikTok, Instagram & Co.', openShareGuide)));
      form.addEventListener('paste', e => { // Bild einfügen -> Texterkennung
        const imgs = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type));
        if (imgs.length) { e.preventDefault(); fromPhotos(imgs); }
      });
      return form;
    }
    function viewPhotos() {
      return h('div', { class: 'form' },
        h('p', { class: 'hint', text: 'Der Text wird direkt auf deinem Gerät erkannt, kostenlos. Am besten ein Bildschirmfoto machen, wenn Zutaten und Schritte gut lesbar im Bild stehen.' }),
        h('div', { class: 'import-choice' },
          h('p', { class: 'import-choice-name', text: 'Ein Rezept' }),
          h('p', { class: 'hint', text: 'Ein oder mehrere Fotos, die zusammen ein Rezept ergeben (z. B. Zutaten und Zubereitung auf zwei Bildern).' }),
          pickBtn('importPhotos', 'Fotos für ein Rezept auswählen', 'btn-primary'), photos),
        h('div', { class: 'import-choice' },
          h('p', { class: 'import-choice-name', text: 'Viele Rezepte auf einmal' }),
          h('p', { class: 'hint', text: 'Jedes Foto wird ein eigenes Rezept – praktisch zum Zusammentragen. Die Rezepte werden gespeichert und als „Zu prüfen“ markiert.' }),
          pickBtn('importPhotosMany', 'Fotos auswählen (je Rezept eins)'), photosMany),
        msg, status, h('div', { class: 'pick-actions' }, manual));
    }
    function viewBoard() {
      return h('div', { class: 'form' },
        h('p', { class: 'hint', text: 'Holt die neuesten 50 Pins einer öffentlichen Pinnwand. Jeder Pin wird zur Rezeptseite verfolgt, gespeichert und als „Zu prüfen“ markiert.' }),
        h('div', { class: 'field' }, h('label', { for: 'pinUser', text: 'Dein Pinterest-Name (ohne @)' }), pinUser,
          h('span', { class: 'hint', text: 'Steht in Pinterest auf deinem Profil unter deinem Namen.' })),
        h('div', { class: 'field' }, h('label', { for: 'pinBoard', text: 'Name der Pinnwand' }), pinBoard),
        h('div', { class: 'pick-actions' }, pinBtn), msg, status,
        h('details', { class: 'import-tip' }, h('summary', { text: 'Mehr als 50 Pins?' }),
          h('ol', null,
            step(1, 'In Pinterest eine neue Pinnwand anlegen, z. B. „Importiert“.'),
            step(2, 'Die importierten Pins aus der großen Pinnwand dorthin verschieben (Pinnwand öffnen → Organisieren).'),
            step(3, 'Hier noch einmal „Pins laden“ – jetzt kommen die nächsten 50. Doppelte werden übersprungen.'))));
    }
    function viewApp() {
      return h('div', { class: 'form' },
        h('div', { class: 'import-choice' },
          h('p', { class: 'import-choice-name', text: 'Recipe Keeper' }),
          h('ol', { class: 'import-steps' },
            step(1, 'In Recipe Keeper: Einstellungen → Exportieren.'),
            step(2, 'Die Datei mit „In Dateien sichern“ speichern.'),
            step(3, 'Hier die Datei auswählen.')),
          pickBtn('importApp', 'Export-Datei auswählen', 'btn-primary'), appFile),
        h('p', { class: 'hint', text: 'Alle Rezepte kommen auf einmal, mit Fotos, und werden als „Zu prüfen“ markiert. Doppelte werden übersprungen.' }),
        msg, status);
    }
    const VIEWS = {
      home: ['Rezept hinzufügen', viewHome],
      photos: ['Bildschirmfotos', viewPhotos],
      board: ['Pinterest-Pinnwand', viewBoard],
      app: ['Aus anderer App', viewApp]
    };
    function show(name) {
      reset();
      const [t, make] = VIEWS[name] || VIEWS.home;
      title.textContent = t;
      back.hidden = name === 'home';
      scroll.textContent = '';
      scroll.append(make());
      scroll.scrollTop = 0;
      if (name === 'home' && !autoRun) setTimeout(() => { if (!input.value) input.focus(); }, 50);
    }
    showDialog('import', h('div', { style: 'display:contents' }, header, scroll));
    show(startView || 'home');
    if (autoRun && prefill) run();
  }

  // ---------- Pinnwand-Import: alle Pins nacheinander ----------
  // Sammel-Import: Pinterest-Pinnwand oder alle geteilten Rezepte aus dem Eingangsfach
  function openBoardImport(res, opts) {
    opts = opts || {};
    const S = window.RecipeSync;
    const pins = res.pins;
    const total = res.board && res.board.count || pins.length;
    const word = opts.word || 'Pins';
    const info = h('p', { text: opts.info || ('Pinnwand „' + (res.board && res.board.name || '') + '“: ' + pins.length + (total > pins.length ? ' von ' + total + ' Pins (die neuesten; mehr gibt Pinterest nicht heraus).' : ' Pins.')) });
    const go = h('button', { type: 'button', class: 'btn btn-primary', id: 'boardGo' }, pins.length + ' ' + word + ' importieren');
    const progress = h('p', { class: 'hint', id: 'boardProgress', 'aria-live': 'polite' });
    const out = h('div', { id: 'boardResult' });
    const box = h('div', { class: 'form' }, info,
      h('p', { class: 'hint', text: 'Das dauert ein paar Minuten. Rezepte, die vollständig aussehen (Name, mindestens 2 Zutaten und 1 Schritt), werden gespeichert und als „Zu prüfen“ markiert. Doppelte werden übersprungen.' }),
      h('div', { class: 'pick-actions' }, go), progress, out);
    showDialog('board', h('div', { style: 'display:contents' }, head(opts.title || 'Pinnwand importieren', closeDialog), h('div', { class: 'dlg-scroll' }, box)));
    if (opts.autoStart) setTimeout(() => go.click(), 0);

    const complete = opts.complete || (d => d && d.title && d.title !== 'Importiertes Rezept' && d.ingredients.length >= 2 && d.steps.length >= 1);
    const norm = u => String(u || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    go.addEventListener('click', async () => {
      go.remove();
      const batch = (opts.batchPrefix || 'pin-') + Date.now().toString(36);
      const saved = [], dup = [], failed = [];
      let done = 0;
      const queue = pins.slice();
      const one = async pin => {
        let d = pin.draft ? { ...pin.draft } : null; // schon fertig gelesen (z. B. aus Recipe Keeper)
        if (!d && pin.makeDraft) { try { d = await pin.makeDraft(); } catch (e) { d = null; } } // z. B. Texterkennung je Foto
        if (!d && pin.link) {
          try { const r = window.RecipeImporter.toDraft(await S.fetchPage(pin.link)); d = r && r.draft; if (d) d.importHow = r.how; } catch (e) { d = null; }
        }
        if (!complete(d) && pin.text) {
          const t = window.RecipeImporter.fromText(pin.text, { image: pin.image, url: pin.link || pin.url });
          if (complete(t)) { d = t; d.importHow = opts.textHow || 'pin'; }
        }
        const label = (d && d.title && d.title !== 'Importiertes Rezept' ? d.title : (pin.text || pin.link || '').split('\n')[0].slice(0, 60)) || 'Ohne Text';
        if (!complete(d)) { failed.push({ pin, label }); return; }
        d.sourceUrl = d.sourceUrl || pin.link || pin.url;
        d.imageUrl = d.imageUrl || pin.image;
        const same = Store.recipes().find(x => (x.sourceUrl && norm(x.sourceUrl) === norm(d.sourceUrl)) || (x.sourceUrl && pin.link && norm(x.sourceUrl) === norm(pin.link)))
          || window.RecipeDupes.findDuplicate(d, Store.recipes());
        if (same) { dup.push({ pin, label, same }); return; }
        // Foto aus der Datei: verkleinern und im Bildspeicher ablegen
        if (pin.getImage) {
          try { const b = await pin.getImage(); if (b) d.imageId = await window.RecipeImages.save(await window.RecipeImages.resize(b)); } catch (e) { /* ohne Foto weiter */ }
        }
        try { Store.saveRecipe({ ...d, review: true, importBatch: batch }); saved.push(label); }
        catch (e) { if (d.imageId) window.RecipeImages.remove(d.imageId); failed.push({ pin, label }); }
      };
      const worker = async () => {
        while (queue.length) {
          const pin = queue.shift();
          await one(pin);
          if (opts.afterEach) { try { await opts.afterEach(pin); } catch (e) { /* egal */ } }
          done++;
          progress.textContent = done + ' von ' + pins.length + ' ' + word + ' … (' + saved.length + ' gespeichert)';
        }
      };
      await Promise.all(Array.from({ length: opts.workers || 3 }, worker));
      progress.textContent = '';
      showResult();

      function showResult() {
        out.textContent = '';
        out.append(
          h('p', null, h('b', { text: saved.length + ' importiert' }), ', ' + dup.length + ' schon vorhanden, ' + failed.length + ' nicht geklappt.'),
          h('div', { class: 'pick-actions' },
            saved.length ? h('button', { type: 'button', class: 'btn btn-primary', id: 'boardShowReview', onclick: () => { closeDialog(); resetAll(); state.reviewOnly = true; setFiltersOpen(true); render(); } }, '„Zu prüfen“ ansehen') : null,
            saved.length ? h('button', { type: 'button', class: 'btn btn-danger', id: 'boardUndo', onclick: askUndo }, 'Import rückgängig') : null),
          failed.length ? h('div', { class: 'field' },
            h('span', { class: 'label', text: 'Nicht geklappt' }),
            h('p', { class: 'hint', text: 'Hier stand kein vollständiges Rezept. Tippen öffnet das Original; dann z. B. ein Bildschirmfoto vom Rezept importieren.' }),
            h('ul', { class: 'board-failed' }, failed.map(f => h('li', null, f.pin.url ? h('a', { href: f.pin.url, target: '_blank', rel: 'noopener noreferrer', text: f.label }) : f.label)))) : '');
      }
      function askUndo() {
        out.querySelector('#boardUndo').replaceWith(h('div', { class: 'confirm' },
          h('p', { text: 'Alle ' + saved.length + ' Rezepte aus diesem Import wieder löschen?' }),
          h('button', { type: 'button', class: 'btn', onclick: showResult }, 'Abbrechen'),
          h('button', { type: 'button', class: 'btn btn-danger-solid', id: 'boardUndoYes', onclick: () => {
            const n = Store.deleteBatch(batch);
            saved.length = 0;
            toast(n + ' Rezepte gelöscht');
            showResult();
          } }, 'Ja, löschen')));
      }
    });
  }

  // ---------- Formular-Baustein: Foto ----------
  function imagePicker(v) {
    const preview = h('img', { class: 'pick-preview', alt: 'Foto des Rezepts' });
    const status = h('span', { class: 'hint', 'aria-live': 'polite' });
    const file = h('input', { type: 'file', id: 'fPhoto', accept: 'image/*', class: 'visually-hidden' });
    const choose = h('label', { for: 'fPhoto', class: 'btn btn-primary pick-btn', role: 'button', tabindex: '0' }, 'Foto aufnehmen oder auswählen');
    const remove = h('button', { type: 'button', class: 'btn btn-danger', id: 'fPhotoRemove' }, 'Foto entfernen');
    const urlInput = h('input', { id: 'fImage', type: 'url', inputmode: 'url', placeholder: 'https://…', value: v.imageUrl || '', autocomplete: 'off' });
    const el = h('div', { class: 'field pick' },
      h('span', { class: 'label', text: 'Foto' }), preview,
      h('div', { class: 'pick-actions' }, choose, file, remove), status,
      h('label', { for: 'fImage', class: 'pick-url-label', text: 'Oder Bild-Adresse aus dem Internet' }), urlInput);
    el.blob = null;
    el.removed = false;
    let objUrl = null;

    function showPreview(src) {
      preview.hidden = !src;
      remove.hidden = !src;
      if (src) preview.src = src; else preview.removeAttribute('src');
    }
    showPreview(null);
    if (v.imageId) window.RecipeImages.url(v.imageId).then(u => { if (u && !el.blob && !el.removed) showPreview(u); }).catch(() => {});
    else if (safeUrl(v.imageUrl)) showPreview(safeUrl(v.imageUrl));
    preview.addEventListener('error', () => showPreview(null));

    el.useFile = f => {
      status.textContent = 'Foto wird vorbereitet …';
      return window.RecipeImages.resize(f).then(blob => {
        el.blob = blob;
        el.removed = false;
        if (objUrl) URL.revokeObjectURL(objUrl);
        objUrl = URL.createObjectURL(blob);
        showPreview(objUrl);
        status.textContent = 'Foto übernommen. Es wird beim Speichern gesichert.';
      }).catch(e => { status.textContent = e.message; });
    };
    file.addEventListener('change', () => { if (file.files[0]) el.useFile(file.files[0]); file.value = ''; });
    choose.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    remove.addEventListener('click', () => {
      el.blob = null; el.removed = true; urlInput.value = '';
      showPreview(null);
      status.textContent = 'Foto wird beim Speichern entfernt.';
    });
    return el;
  }

  // ---------- Formular-Baustein: Zutaten als Text, mit Vorschau der Erkennung ----------
  function ingredientInput(initial) {
    const Sc = window.RecipeScale;
    const area = h('textarea', { id: 'fIngredients', rows: 8, placeholder: '200 g Mehl\nEier 3\nZucker: 100g\neine Prise Salz' });
    area.value = (initial || []).join('\n');
    const preview = h('ul', { class: 'ing-preview', 'aria-live': 'polite' });
    const api = { onChange: () => {} };
    api.lines = () => area.value.split('\n').map(l => Sc.normalizeIngredient(l)).filter(Boolean);
    function show() {
      preview.textContent = '';
      for (const line of api.lines()) {
        const p = Sc.parseIngredient(line);
        preview.append(h('li', null, p.amount
          ? [h('b', { text: [p.amount, p.unit].filter(Boolean).join(' ') }), ' ', p.name]
          : [h('span', { class: 'muted', text: 'ohne Menge: ' }), p.name]));
      }
      previewBox.hidden = !preview.children.length;
    }
    const previewBox = h('div', { class: 'ing-preview-box' }, h('span', { class: 'hint', text: 'So erkennt die App deine Zutaten:' }), preview);
    area.addEventListener('input', () => { show(); api.onChange(); });
    show();
    api.el = h('div', { class: 'field' },
      h('label', { for: 'fIngredients', text: 'Zutaten' }),
      h('span', { class: 'hint', text: 'Eine Zutat pro Zeile, Reihenfolge egal: „200 g Mehl“, „Mehl 200g“ oder „Eier 3“ wird alles erkannt. Mengen wie im Originalrezept.' }),
      area, previewBox);
    return api;
  }

  // ---------- Formular: neu / bearbeiten ----------
  /* Eingabefeld mit antippbaren Vorschlägen darunter: zuerst Werte aus den
     eigenen Rezepten (häufigste zuerst), dann die üblichen Standardwerte.
     Beim Tippen wird gefiltert. */
  function suggestField(label, id, value, placeholder, key, defaults) {
    const counts = new Map();
    const names = new Map();
    for (const r of Store.recipes()) {
      const v = (r[key] || '').trim();
      if (!v) continue;
      const k = facetKey(v);
      counts.set(k, (counts.get(k) || 0) + 1);
      if (!names.has(k)) names.set(k, v);
    }
    const own = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || names.get(a).localeCompare(names.get(b), 'de'));
    const all = own.map(k => names.get(k)).concat(defaults.filter(d => !names.has(facetKey(d))));

    const input = h('input', { id, type: 'text', value: value || '', placeholder, autocomplete: 'off', autocorrect: 'off' });
    const box = h('div', { class: 'suggest', role: 'group', 'aria-label': 'Vorschläge für ' + label });
    let typing = false; // erst filtern, wenn selbst getippt wird
    function show() {
      const q = facetKey(input.value);
      box.textContent = '';
      const hits = all.filter(v => facetKey(v) !== q && (!typing || !q || facetKey(v).includes(q))).slice(0, 12);
      hits.forEach(v => box.append(h('button', {
        type: 'button', class: 'chip', onclick: () => { input.value = v; typing = false; show(); }
      }, v)));
      box.hidden = !hits.length;
    }
    input.addEventListener('input', () => { typing = true; show(); });
    show();
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), input, box);
  }

  function field(label, input, hint) {
    const id = input.id || input.querySelector('[id]').id;
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null);
  }

  function openEdit(id, draft) {
    const r = id ? Store.recipe(id) : null;
    const v = r || { title: '', collectionId: '', course: '', mainIngredient: '', method: '', servings: 4, servingsUnit: 'Personen', formSize: '', totalTime: '', ingredients: [], steps: [], notes: '', imageUrl: '', sourceUrl: '', ...(draft || {}) };
    body.dataset.id = id || '';

    const err = h('div', { class: 'form-error', role: 'alert', hidden: true });

    // Einheit: genau fünf Möglichkeiten (plus eine eventuell ältere, eigene Angabe)
    const F = window.RecipeForms;
    const curUnit = F.normalizeUnit(v.servingsUnit);
    const unitOptions = F.UNITS.includes(curUnit) ? F.UNITS : F.UNITS.concat(curUnit);
    const unitSel = h('select', { id: 'fServUnit' }, unitOptions.map(u => h('option', { value: u, text: u, selected: u === curUnit })));
    const sizeOf = u => F.parseSize(u, F.normalizeUnit(v.servingsUnit) === u ? v.formSize : '');
    const numInp = (fid, value, label) => h('input', { id: fid, type: 'text', inputmode: 'decimal', value: String(value).replace('.', ','), 'aria-label': label, class: 'num' });
    const sizeRow = (label, inputs, hint) => h('div', { class: 'field' }, h('span', { class: 'label', text: label }), h('div', { class: 'size-row' }, inputs), hint ? h('span', { class: 'hint', text: hint }) : null);
    const sizeSpring = sizeRow('Durchmesser der Springform', [numInp('fSizeD', sizeOf('Springform').d, 'Durchmesser in cm'), ' cm']);
    const sizeBlech = sizeRow('Größe des Blechs', [numInp('fSizeL', sizeOf('Blech').l, 'Länge in cm'), ' × ', numInp('fSizeW', sizeOf('Blech').w, 'Breite in cm'), ' cm'], 'Ein normales Backblech ist etwa 30 × 40 cm.');
    const sizeKasten = sizeRow('Länge der Kastenform', [numInp('fSizeK', sizeOf('Kastenform').len, 'Länge in cm'), ' cm']);
    const glassMl = sizeOf('Gläser').ml;
    const glassOpts = F.GLASSES.some(g => g[0] === glassMl) ? F.GLASSES : F.GLASSES.concat([[glassMl, 'eigene Größe']]);
    const sizeGlass = field('Größe pro Glas', h('select', { id: 'fSizeG' },
      glassOpts.map(([ml, name]) => h('option', { value: ml, text: F.formatSize('Gläser', { ml }) + ' – ' + name, selected: ml === glassMl }))),
      'Steht meist auf dem Glasboden oder dem Etikett.');
    function syncSize() {
      sizeSpring.hidden = unitSel.value !== 'Springform';
      sizeBlech.hidden = unitSel.value !== 'Blech';
      sizeKasten.hidden = unitSel.value !== 'Kastenform';
      sizeGlass.hidden = unitSel.value !== 'Gläser';
    }
    unitSel.addEventListener('change', syncSize);

    // Sammlung ergibt sich aus der Zubereitung (Anzeige, aktualisiert sich beim Tippen)
    const autoColInfo = h('p', { class: 'hint auto-col', id: 'autoCol', 'aria-live': 'polite' });
    const updateAutoCol = () => {
      const m = form.querySelector('#fMethod').value;
      const c = window.RecipeCollections.forRecipe({ method: m, steps: form.querySelector('#fSteps').value.split('\n'), title: form.querySelector('#fTitle').value });
      autoColInfo.textContent = 'Sammlung: ' + c.name + (m.trim() ? '' : ' (aus den Schritten geschätzt)') + ' – ergibt sich aus der Zubereitung.';
    };
    const imageSection = imagePicker(v);
    const ingRows = ingredientInput(v.ingredients);
    const ingredientsEditor = ingRows.el;

    const inp = (fid, value, extra) => h('input', Object.assign({ id: fid, type: 'text', value: value || '', autocomplete: 'off' }, extra || {}));
    const ta = (fid, value, rows) => { const t = h('textarea', { id: fid, rows: rows || 6 }); t.value = value || ''; return t; };

    let importNote = null;
    if (draft) {
      let host = '';
      try { host = new URL(draft.sourceUrl).hostname.replace(/^www\./, ''); } catch (e) { /* egal */ }
      importNote = draft.fromText || draft.fromShare
        ? h('div', { class: 'notice', id: 'importNotice' },
            h('p', null, h('b', { text: 'Aus Text erkannt.' }),
              ' Bitte kurz prüfen und speichern.' + (draft.title ? '' : ' Den Namen bitte noch eintragen.')))
        : draft.fromPhoto
        ? h('div', { class: 'notice', id: 'importNotice' },
            h('p', null, h('b', { text: 'Aus Bildschirmfoto erkannt.' }),
              ' Bitte prüfen, vor allem die Mengen – die Texterkennung kann sich bei Zahlen vertun.' + (draft.title ? '' : ' Den Namen bitte noch eintragen.')))
        : h('div', { class: 'notice', id: 'importNotice' },
            h('p', null, h('b', { text: 'Importiert' + (host ? ' von ' + host : '') + '.' }),
              ' Bitte kurz prüfen ' + (draft.ingredients && draft.ingredients.length ? 'und speichern.' : ', die Zutaten ergänzen und speichern.')));
      // Konkret sagen, worauf zu achten ist
      const hs = window.RecipeImporter.reviewHints({ ...draft, how: draft.importHow || '' });
      if (hs.length) importNote.append(h('ul', { class: 'review-hints' }, hs.map(x => h('li', { text: x }))));
      if ((hs.minor || []).length) importNote.append(h('p', { class: 'review-minor', text: hs.minor.join(' ') }));
    }
    const form = h('form', { class: 'form', id: 'recipeForm', novalidate: true },
      importNote,
      err,
      field('Name des Rezepts', inp('fTitle', v.title, { required: true })),
      imageSection,
      h('div', { class: 'row3' },
        suggestField('Rezeptart', 'fCourse', v.course, 'z. B. Hauptgericht', 'course', COURSES),
        suggestField('Hauptzutat', 'fMain', v.mainIngredient, 'z. B. Hähnchen', 'mainIngredient', []),
        suggestField('Zubereitung', 'fMethod', v.method, 'z. B. Backen', 'method', METHODS)),
      autoColInfo,
      h('div', { class: 'row3' },
        field('Rezept ist für', inp('fServings', v.servings ? window.RecipeScale.formatCount(v.servings) : '', { inputmode: 'decimal', placeholder: 'z. B. 4' })),
        field('Einheit', unitSel),
        sizeSpring, sizeBlech, sizeKasten, sizeGlass,
        h('div', { class: 'field' }, h('span', { class: 'label', text: 'Zeit' }),
          h('output', { id: 'fTimeOut', class: 'time-out', for: 'fSteps fIngredients' }),
          h('span', { class: 'hint', text: 'Wird aus den Schritten berechnet.' }))),
      ingredientsEditor,
      field('Zubereitung (Schritte)', ta('fSteps', v.steps.join('\n'), 8), 'Ein Schritt pro Zeile.'),
      field('Notizen', ta('fNotes', v.notes, 3)),
      field('Quelle (optional)', inp('fSource', v.sourceUrl, { type: 'url', inputmode: 'url', placeholder: 'https://…' })),
    );
    syncSize();

    // Zeit live aus den Schritten berechnen
    const timeOut = form.querySelector('#fTimeOut');
    const updateTime = () => {
      const t = window.RecipeTime.label({ steps: form.querySelector('#fSteps').value.split('\n').filter(x => x.trim()), ingredients: ingRows.lines() });
      timeOut.textContent = t || 'Erscheint, sobald Schritte eingetragen sind';
    };
    form.querySelector('#fSteps').addEventListener('input', updateTime);
    ['#fMethod', '#fSteps', '#fTitle'].forEach(sel => form.querySelector(sel).addEventListener('input', updateAutoCol));
    form.querySelector('#fMethod').parentElement.addEventListener('click', () => setTimeout(updateAutoCol, 0)); // Vorschlag angetippt
    updateAutoCol();
    ingRows.onChange = updateTime;
    updateTime();

    const cancel = () => { if (id && Store.recipe(id)) renderDetail(id); else closeDialog(); };

    // Bild aus der Zwischenablage einfügen (z. B. lange auf ein Feld tippen -> Einfügen)
    form.addEventListener('paste', e => {
      const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(x => /^image\//.test(x.type));
      if (f) { e.preventDefault(); imageSection.useFile(f); }
    });

    // Hinweis auf ein schon vorhandenes, gleiches Rezept (auch mit anderem Namen)
    const dupBox = h('div', { class: 'notice', id: 'dupNotice', hidden: true, role: 'alert' });
    err.after(dupBox);
    let allowDuplicate = false;
    function showDuplicate(dup) {
      dupBox.textContent = '';
      dupBox.append(
        h('p', null, 'Dieses Rezept gibt es schon: ', h('b', { text: '„' + dup.title + '“' }), '. Zutaten und Zubereitung sind fast gleich.'),
        h('div', { class: 'notice-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => { allowDuplicate = true; dupBox.hidden = true; form.requestSubmit(); } }, 'Trotzdem speichern'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openDetail(dup.id) }, 'Vorhandenes öffnen')));
      dupBox.hidden = false;
      dupBox.scrollIntoView({ block: 'nearest' });
    }

    let saving = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (saving) return;
      err.hidden = true;
      const val = fid => form.querySelector('#' + fid).value;
      const lines = fid => val(fid).split('\n');
      const fail = (msg, fid) => { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); if (fid) form.querySelector('#' + fid).focus(); };

      if (!val('fTitle').trim()) return fail('Bitte gib dem Rezept einen Namen.', 'fTitle');
      for (const [fid, name] of [['fImage', 'Bild-Adresse'], ['fSource', 'Quelle']]) {
        if (val(fid).trim() && !safeUrl(val(fid).trim())) return fail('Die ' + name + ' muss mit https:// beginnen.', fid);
      }
      // Formgröße aus den passenden Feldern zusammensetzen
      const n = fid => parseFloat(val(fid).replace(',', '.'));
      let formSize = '';
      const u = unitSel.value;
      if (u === 'Springform') { if (!(n('fSizeD') > 0)) return fail('Bitte den Durchmesser der Springform in cm eintragen, z. B. 26.', 'fSizeD'); formSize = F.formatSize(u, { d: n('fSizeD') }); }
      if (u === 'Blech') { if (!(n('fSizeL') > 0 && n('fSizeW') > 0)) return fail('Bitte die Blechgröße in cm eintragen, z. B. 30 × 40.', 'fSizeL'); formSize = F.formatSize(u, { l: n('fSizeL'), w: n('fSizeW') }); }
      if (u === 'Gläser') formSize = F.formatSize(u, { ml: n('fSizeG') });
      if (u === 'Kastenform') { if (!(n('fSizeK') > 0)) return fail('Bitte die Länge der Kastenform in cm eintragen, z. B. 30.', 'fSizeK'); formSize = F.formatSize(u, { len: n('fSizeK') }); }
      // Gleiches Rezept schon vorhanden? (nur bei neuen Rezepten)
      if (!id && !allowDuplicate) {
        const dup = window.RecipeDupes.findDuplicate({ title: val('fTitle'), ingredients: ingRows.lines(), steps: lines('fSteps').filter(x => x.trim()) }, Store.recipes());
        if (dup) return showDuplicate(dup);
      }
      let imageId = v.imageId || '';
      try {
        saving = true;
        // Neues Foto zuerst in den Bildspeicher legen
        if (imageSection.blob) imageId = await window.RecipeImages.save(imageSection.blob);
        else if (imageSection.removed) imageId = '';
      } catch (ex) {
        saving = false;
        return fail('Das Foto konnte nicht gespeichert werden. Ist der Speicher des Geräts voll?');
      }
      try {
        const saved = Store.saveRecipe({
          id: id || undefined, title: val('fTitle'),
          course: val('fCourse'), mainIngredient: val('fMain'), method: val('fMethod'),
          servings: val('fServings'), servingsUnit: unitSel.value, formSize,
          ingredients: ingRows.lines(), steps: lines('fSteps'), notes: val('fNotes'),
          imageId, imageUrl: val('fImage'), sourceUrl: val('fSource'), dupOk: allowDuplicate, review: false
        });
        // Altes Foto aufräumen, wenn es ersetzt oder entfernt wurde
        if (v.imageId && v.imageId !== imageId) window.RecipeImages.remove(v.imageId);
        toast('Gespeichert');
        if (hashId() === saved.id) renderDetail(saved.id);
        else openDetail(saved.id);
      } catch (ex) {
        saving = false;
        if (imageSection.blob && imageId && imageId !== v.imageId) window.RecipeImages.remove(imageId);
        fail(ex.message);
      }
    });

    const foot = h('div', { class: 'dlg-foot' },
      h('button', { type: 'button', class: 'btn', onclick: cancel }, 'Abbrechen'),
      h('button', { type: 'submit', class: 'btn btn-primary', form: 'recipeForm' }, 'Speichern'));

    showDialog('edit', h('div', { style: 'display:contents' },
      head(r ? 'Rezept bearbeiten' : draft ? 'Importiertes Rezept' : 'Neues Rezept', cancel), h('div', { class: 'dlg-scroll' }, form), foot));
    if (!r) setTimeout(() => {
      const a = document.activeElement;
      if (!a || !form.contains(a)) form.querySelector('#fTitle').focus();
    }, 50);
  }

  // ---------- Sammlungen verwalten ----------
  // Beispielrezepte hinzufügen oder alle auf einmal entfernen
  function examplesBox() {
    const total = (window.EXAMPLE_RECIPES || []).length;
    const have = Store.exampleCount();
    const box = h('div', { class: 'field examples' }, h('span', { class: 'label', text: 'Beispielrezepte' }));
    const info = h('p', { class: 'hint', text: have ? have + ' Beispielrezepte sind geladen. Deine eigenen Rezepte sind davon nicht betroffen.' : 'Zum Ausprobieren: ' + total + ' Beispielrezepte mit vielen Funktionen.' });
    const row = h('div', { class: 'pick-actions' });
    if (have < total) row.append(h('button', {
      type: 'button', class: 'btn', onclick: () => {
        try { const n = Store.loadExamples(); toast(n === 1 ? '1 Beispielrezept hinzugefügt' : n + ' Beispielrezepte hinzugefügt'); openSettings(); }
        catch (e) { toast(e.message); }
      }
    }, have ? 'Fehlende Beispiele hinzufügen' : 'Beispielrezepte hinzufügen'));
    if (have) {
      const del = h('button', { type: 'button', class: 'btn btn-danger' }, 'Beispielrezepte entfernen');
      del.addEventListener('click', () => {
        row.textContent = '';
        row.append(h('p', { class: 'confirm-text', text: 'Alle ' + have + ' Beispielrezepte löschen?' }),
          h('button', { type: 'button', class: 'btn', onclick: () => openSettings() }, 'Abbrechen'),
          h('button', {
            type: 'button', class: 'btn btn-danger-solid', onclick: () => {
              try { const n = Store.removeExamples(); toast(n + ' Beispielrezepte entfernt'); openSettings(); }
              catch (e) { toast(e.message); }
            }
          }, 'Ja, entfernen'));
      });
      row.append(del);
    }
    box.append(info, row);
    return box;
  }

  // Tote Links: Stand und "Jetzt prüfen"
  function linksBox() {
    const L = window.RecipeLinkCheck, S = window.RecipeSync;
    if (!L || !S || !S.enabled || !S.email()) return null;
    const st = L.stats();
    if (!st.total && !st.removed) return null;
    const when = st.lastRun ? new Date(st.lastRun).toLocaleDateString('de-DE') + ', ' + new Date(st.lastRun).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'noch nie';
    const info = h('p', { class: 'hint', 'aria-live': 'polite', text: st.total + ' Rezepte mit Link. Zuletzt geprüft: ' + when + '. TikTok-Links werden alle 7 Tage geprüft, andere alle 30 Tage. Ein Link wird erst entfernt, wenn er zweimal im Abstand von einigen Stunden nicht mehr erreichbar war; das Rezept bleibt erhalten.' });
    const btn = h('button', { type: 'button', class: 'btn', id: 'btnCheckLinks' }, 'Jetzt prüfen');
    btn.addEventListener('click', async () => {
      btn.disabled = true; info.textContent = 'Links werden geprüft …';
      const r = await L.run({ force: true });
      btn.disabled = false;
      if (r.skipped === 'offline') { info.textContent = 'Keine Verbindung. Bitte später noch einmal versuchen.'; return; }
      info.textContent = r.checked + ' Links geprüft. ' + (r.removed.length ? r.removed.length + ' tote Links entfernt: ' + r.removed.join(', ') + '.' : 'Keine toten Links gefunden.') + ' Unsichere Links werden in einigen Stunden noch einmal geprüft.';
    });
    return h('div', { class: 'field examples' }, h('span', { class: 'label', text: 'Links prüfen' }), info, h('div', { class: 'pick-actions' }, btn));
  }

  // App-Version und Suche nach neuer Version
  const nWord = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  // Sicherung als Datei (Dateien/iCloud) und wieder einspielen
  function backupBox() {
    const B = window.RecipeBackup;
    if (!B) return null;
    const lastIso = B.last();
    const lastTxt = lastIso ? new Date(lastIso).toLocaleDateString('de-DE') : 'noch nie';
    const info = h('p', { class: 'hint', 'aria-live': 'polite', id: 'backupInfo', text: nWord(Store.recipes().length, 'Rezept', 'Rezepte') + '. Zuletzt gesichert: ' + lastTxt + '.' });
    const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const save = h('button', { type: 'button', class: 'btn btn-primary', id: 'btnBackup' }, 'Alle Rezepte sichern');
    save.addEventListener('click', async () => {
      save.disabled = true; err.hidden = true; info.textContent = 'Sicherung wird erstellt …';
      try {
        const r = await B.backup(t => { info.textContent = t; });
        info.textContent = r.how === 'abgebrochen' ? 'Abgebrochen – nichts gesichert.'
          : nWord(r.count, 'Rezept', 'Rezepte') + ' und ' + nWord(r.photos, 'Foto', 'Fotos') + ' gesichert. ' + (r.how === 'geteilt' ? 'Tipp: „In Dateien sichern“ wählen, am besten in iCloud Drive.' : 'Die Datei liegt bei den Downloads.');
      } catch (e) { err.textContent = e.message || 'Die Sicherung ist fehlgeschlagen.'; err.hidden = false; info.textContent = ''; }
      save.disabled = false;
    });
    const file = h('input', { type: 'file', id: 'restoreFile', accept: '.zip,application/zip', class: 'visually-hidden' });
    const load = h('label', { for: 'restoreFile', class: 'btn pick-btn', role: 'button', tabindex: '0' }, 'Sicherung einspielen');
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      err.hidden = true; info.textContent = 'Sicherung wird gelesen …';
      try {
        const r = await B.restore(f, t => { info.textContent = t; });
        info.textContent = r.added ? nWord(r.added, 'Rezept', 'Rezepte') + ' aus der Sicherung übernommen' + (r.skipped ? ', ' + r.skipped + (r.skipped === 1 ? ' war' : ' waren') + ' schon da.' : '.') : 'Alle ' + r.total + ' Rezepte aus der Sicherung sind schon vorhanden – nichts geändert.';
      } catch (e) { err.textContent = e.message || 'Die Sicherung konnte nicht eingespielt werden.'; err.hidden = false; info.textContent = ''; }
    });
    return h('div', { class: 'field examples', id: 'backupBox' }, h('span', { class: 'label', text: 'Sicherung' }),
      h('p', { class: 'hint', text: 'Speichert alle Rezepte mit Fotos als eine Datei – z. B. in iCloud Drive. Beim Einspielen kommen nur fehlende Rezepte dazu, vorhandene bleiben unverändert.' }),
      info, h('div', { class: 'pick-actions' }, save, load, file), err);
  }

  function versionBox() {
    const U = window.RecipeUpdate;
    if (!U) return null;
    const v = U.current && U.current !== '0' ? new Date(U.current + 'Z') : null;
    const label = v && !isNaN(v) ? v.toLocaleDateString('de-DE') + ', ' + v.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'Entwicklungsstand';
    const info = h('p', { class: 'hint', 'aria-live': 'polite', text: 'Stand: ' + label });
    const btn = h('button', { type: 'button', class: 'btn', id: 'btnCheckUpdate' }, 'Nach neuer Version suchen');
    btn.addEventListener('click', async () => {
      btn.disabled = true; info.textContent = 'Suche …';
      const r = await U.check(true);
      btn.disabled = false;
      info.textContent = r === 'neu' ? 'Eine neue Version ist da – oben auf „Jetzt laden“ tippen.' : r === 'offline' ? 'Keine Verbindung. Bitte später noch einmal versuchen.' : 'Du hast die neueste Version (Stand: ' + label + ').';
    });
    return h('div', { class: 'field examples' }, h('span', { class: 'label', text: 'App-Version' }), info, h('div', { class: 'pick-actions' }, btn));
  }

  // Konto (nur mit Online-Speicher)
  function accountBox() {
    const S = window.RecipeSync;
    if (!S || !S.enabled || !S.email()) return null;
    const out = h('button', { type: 'button', class: 'btn' }, 'Abmelden');
    out.addEventListener('click', () => {
      const row = out.parentElement;
      row.textContent = '';
      row.append(h('p', { class: 'confirm-text', text: 'Abmelden? Deine Rezepte bleiben online gespeichert. Auf diesem Gerät wird nicht mehr abgeglichen, bis du dich wieder anmeldest.' }),
        h('button', { type: 'button', class: 'btn', onclick: () => openSettings() }, 'Abbrechen'),
        h('button', { type: 'button', class: 'btn btn-danger-solid', onclick: async () => { closeDialog(); await S.signOut(); } }, 'Ja, abmelden'));
    });
    return h('div', { class: 'field examples' }, h('span', { class: 'label', text: 'Konto' }),
      h('p', { class: 'hint', text: 'Angemeldet als ' + S.email() + '. Deine Rezepte werden automatisch mit deinen anderen Geräten abgeglichen.' }),
      h('div', { class: 'pick-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => { S.syncNow(); toast('Abgleich gestartet'); } }, 'Jetzt abgleichen'), out));
  }

  // Teilen-Menü: Schlüssel für den Apple-Kurzbefehl "Zu Rezepten"
  function shareBox() {
    const S = window.RecipeSync;
    if (!S || !S.enabled || !S.email() || !S.createShareKey) return null;
    const box = h('div', { class: 'field examples', id: 'shareBox' });
    const copy = (text, what) => {
      const ok = () => toast(what + ' kopiert');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => toast('Bitte lange auf den Text drücken und „Kopieren“ wählen'));
      else toast('Bitte lange auf den Text drücken und „Kopieren“ wählen');
    };
    const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
    function draw() {
      box.textContent = '';
      const key = S.shareKey();
      box.append(h('span', { class: 'label', text: 'Teilen-Menü (Kurzbefehl)' }),
        h('p', { class: 'hint', text: 'Damit du Rezepte aus TikTok, Pinterest oder Safari über „Teilen“ schicken kannst. Pro Gerät einmal einen Kurzbefehl einrichten; dafür brauchst du den Schlüssel und die Adresse unten.' }));
      if (key) {
        box.append(
          h('p', { class: 'hint', text: 'Teilen-Schlüssel (geheim halten):' }),
          h('div', { class: 'share-key', id: 'shareKey', text: key }),
          h('div', { class: 'pick-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => copy(key, 'Schlüssel') }, 'Schlüssel kopieren')),
          h('p', { class: 'hint', text: 'Adresse:' }),
          h('div', { class: 'share-key', id: 'shareUrl', text: S.shareEndpoint() }),
          h('div', { class: 'pick-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => copy(S.shareEndpoint(), 'Adresse') }, 'Adresse kopieren')),
          h('p', { class: 'hint', text: 'apikey (öffentlich, kein Geheimnis):' }),
          h('div', { class: 'share-key', id: 'shareApikey', text: S.shareApiKey() }),
          h('div', { class: 'pick-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => copy(S.shareApiKey(), 'apikey') }, 'apikey kopieren')));
      } else {
        box.append(h('div', { class: 'pick-actions' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'btnShareKey', onclick: async e => {
          e.target.disabled = true; err.hidden = true;
          try { await S.createShareKey(/ipad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /mac/i.test(navigator.platform)) ? 'iPad' : 'iPhone'); draw(); }
          catch (x) { err.textContent = x.message; err.hidden = false; e.target.disabled = false; }
        } }, 'Teilen-Schlüssel erstellen')));
      }
      const revoke = h('button', { type: 'button', class: 'btn btn-danger' }, 'Alle Teilen-Schlüssel ungültig machen');
      revoke.addEventListener('click', () => {
        const row = revoke.parentElement;
        row.textContent = '';
        row.append(h('p', { class: 'confirm-text', text: 'Danach funktioniert kein Kurzbefehl mehr, bis du einen neuen Schlüssel erstellst und im Kurzbefehl einträgst.' }),
          h('button', { type: 'button', class: 'btn', onclick: draw }, 'Abbrechen'),
          h('button', { type: 'button', class: 'btn btn-danger-solid', onclick: async () => {
            try { await S.revokeShareKeys(); toast('Alle Teilen-Schlüssel gelöscht'); draw(); } catch (x) { err.textContent = x.message; err.hidden = false; }
          } }, 'Ja, ungültig machen'));
      });
      box.append(h('div', { class: 'pick-actions' }, revoke), err);
    }
    draw();
    return box;
  }

  function openSettings() {
    const content = h('div', { class: 'form' },
      h('p', { class: 'hint', text: 'Die Sammlungen Ofen, Pfanne, Topf, Grill und Kalt ergeben sich automatisch aus der Zubereitung.' }),
      examplesBox(),
      linksBox(),
      accountBox(),
      shareBox(),
      backupBox(),
      h('div', { class: 'field examples' }, h('span', { class: 'label', text: 'Teilen-Menü' }),
        h('p', { class: 'hint', text: 'Anleitung, um Rezepte aus TikTok, Instagram & Co. mit „Teilen → zu Rezepten“ zu schicken.' }),
        h('div', { class: 'pick-actions' }, h('button', { type: 'button', class: 'btn', id: 'btnShareGuide', onclick: openShareGuide }, 'Teilen einrichten'))),
      versionBox());
    showDialog('settings', h('div', { style: 'display:contents' },
      head('Einstellungen', closeDialog), h('div', { class: 'dlg-scroll' }, content)));
  }


  // ---------- Start ----------
  restoreView();
  const q = $('#q');
  q.value = state.query;
  q.addEventListener('input', () => { state.query = q.value; render(); });
  $('#qClear').addEventListener('click', () => { state.query = ''; q.value = ''; render(); q.focus(); });
  $('#btnReset').addEventListener('click', resetAll);
  $('#syncStatus').addEventListener('click', () => { if (window.RecipeSync && window.RecipeSync.syncNow) window.RecipeSync.syncNow(); });
  const sortSel = $('#sort');
  Object.keys(SORTS).forEach(k => sortSel.append(h('option', { value: k, text: SORTS[k], selected: k === sortBy })));
  sortSel.addEventListener('change', () => {
    sortBy = sortSel.value;
    try { localStorage.setItem('rezepte.sortierung', sortBy); } catch (e) { /* egal */ }
    render();
  });

  // Filter auf- und zuklappen; Zustand wird gemerkt (Handy: anfangs zu, iPad: offen)
  function setFiltersOpen(open) {
    $('#filters').hidden = !open;
    $('#btnFilter').setAttribute('aria-expanded', open ? 'true' : 'false');
    $('#btnFilter').classList.toggle('open', open);
    try { localStorage.setItem('rezepte.filterOffen', open ? '1' : '0'); } catch (e) { /* egal */ }
  }
  let filtersOpen = window.innerWidth > 600;
  try { const v = localStorage.getItem('rezepte.filterOffen'); if (v !== null) filtersOpen = v === '1'; } catch (e) { /* egal */ }
  setFiltersOpen(filtersOpen);
  $('#btnFilter').addEventListener('click', () => setFiltersOpen($('#filters').hidden));
  $('#btnImport').addEventListener('click', () => openImport(''));

  // Link beim Öffnen übergeben (Teilen-Menü / Kurzbefehl): ?url=… oder ?text=…
  (function importFromLaunch() {
    let p;
    try { p = new URLSearchParams(location.search); } catch (e) { return; }
    const shared = p.get('url') || p.get('import') || p.get('text') || '';
    if (!/https?:\/\//i.test(shared)) return;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* egal */ }
    const start = () => openImport(shared, true);
    // Der Online-Abgleich (sync.js) wird erst nach app.js geladen -> warten, bis alle Skripte da sind
    const go = () => {
      if (window.RecipeSync && window.RecipeSync.enabled && window.RecipeSync.whenSignedIn) window.RecipeSync.whenSignedIn().then(start);
      else start();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
    else go();
  })();
  $('#btnCollections').addEventListener('click', openSettings);

  Store.onChange(() => {
    render();
    if (state.mode === 'detail' && body.dataset.id && !Store.recipe(body.dataset.id)) closeDialog();
  });

  render();
  syncFromHash();

  // "Nach oben"-Knopf, sobald man weit genug gescrollt hat
  const toTop = $('#toTop');
  if (toTop) {
    const showTop = () => { toTop.hidden = window.scrollY < 600; };
    window.addEventListener('scroll', showTop, { passive: true });
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toTop.blur();
    });
    showTop();
  }

  window.RecipeToast = toast;
  window.RecipeApp = { openImport, openEdit, openBoardImport };

  // Für automatische Tests
  window.__app = { state, render };
})();
