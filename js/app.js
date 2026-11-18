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
    { key: 'mainIngredient', label: 'Hauptzutat' },
    { key: 'method', label: 'Zubereitung', order: METHODS }
  ];

  const state = {
    query: '',
    filters: { collectionId: new Set(), course: new Set(), mainIngredient: new Set(), method: new Set() },
    mode: null,          // 'detail' | 'edit' | 'collections' | null
    favOnly: false,      // nur Favoriten zeigen
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
    return key === 'collectionId' ? recipe.collectionId : facetKey(recipe[key]);
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
      sessionStorage.setItem('rezepte.ansicht', JSON.stringify({ q: state.query, f, fav: state.favOnly }));
    } catch (e) { /* nicht schlimm */ }
  }
  function restoreView() {
    try {
      const v = JSON.parse(sessionStorage.getItem('rezepte.ansicht') || 'null');
      if (!v) return;
      state.query = v.q || '';
      state.favOnly = !!v.fav;
      for (const k in state.filters) state.filters[k] = new Set((v.f && v.f[k]) || []);
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
    for (const f of FACETS) {
      if (f.key === skipKey) continue;
      const sel = state.filters[f.key];
      if (sel.size && !sel.has(facetValue(r, f.key))) return false;
    }
    return true;
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
    if (state.query.trim()) results.sort((a, b) => b.sc - a.sc || a.r.title.localeCompare(b.r.title, 'de'));
    else results.sort((a, b) => a.r.title.localeCompare(b.r.title, 'de'));

    renderFilters(scored.map(x => x.r));
    renderGrid(results.map(x => x.r), all.length);

    const active = state.query.trim() || state.favOnly || FACETS.some(f => state.filters[f.key].size);
    $('#count').textContent = results.length === 1 ? '1 Rezept' : results.length + ' Rezepte';
    $('#btnReset').hidden = !active;
    $('#qClear').hidden = !state.query;
    $('#storageWarning').hidden = Store.storageOk;
    rememberView();
  }

  function renderFilters(searchHits) {
    const box = $('#filters');
    const scrollPos = {};
    box.querySelectorAll('.chips').forEach(c => { scrollPos[c.dataset.key] = c.scrollLeft; });
    box.textContent = '';

    for (const f of FACETS) {
      // Anzahl je Wert, unter Berücksichtigung der Suche und der anderen Filter
      const counts = new Map();
      const labels = new Map();
      for (const r of searchHits) {
        const v = facetValue(r, f.key);
        if (!v) continue;
        if (!labels.has(v)) labels.set(v, f.key === 'collectionId' ? collectionName(v) : r[f.key].trim());
        if (passesFilters(r, f.key)) counts.set(v, (counts.get(v) || 0) + 1);
      }
      // Ausgewählte Werte immer zeigen, auch wenn sie gerade 0 Treffer haben
      for (const v of state.filters[f.key]) {
        if (!labels.has(v)) {
          const any = Store.recipes().find(r => facetValue(r, f.key) === v);
          labels.set(v, f.key === 'collectionId' ? collectionName(v) : (any ? any[f.key].trim() : v));
        }
      }
      let values = [...labels.keys()].filter(v => counts.get(v) || state.filters[f.key].has(v));
      if (!values.length && f.key !== 'collectionId') continue;

      const orderIdx = v => {
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
      }
      box.append(h('div', { class: 'facet' }, h('span', { class: 'facet-label', text: f.label }), chips));
      if (scrollPos[f.key]) chips.scrollLeft = scrollPos[f.key];
    }
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

    if (!total) {
      empty.hidden = false;
      empty.append(
        h('h2', { text: 'Noch keine Rezepte' }),
        h('p', { text: 'Lege dein erstes Rezept an. Zum Ausprobieren kannst du auch ' + (window.EXAMPLE_RECIPES || []).length + ' Beispielrezepte laden. Unter „Sammlungen“ lassen sie sich später mit einem Tipp wieder entfernen.' }),
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
      frag.append(h('button', { type: 'button', class: 'tile', onclick: () => openDetail(r.id) },
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
    // Hinweis: alte Sammlung ist nach dem Verschieben leer
    let emptyNotice = null;
    if (state.emptyCollection && Store.collection(state.emptyCollection)) {
      const cid = state.emptyCollection;
      state.emptyCollection = null;
      emptyNotice = h('div', { class: 'notice' },
        h('p', { text: 'Die Sammlung „' + collectionName(cid) + '“ ist jetzt leer.' }),
        h('div', { class: 'notice-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => emptyNotice.remove() }, 'Behalten'),
          h('button', {
            type: 'button', class: 'btn btn-danger-solid', onclick: () => {
              try { Store.deleteCollection(cid); emptyNotice.remove(); toast('Sammlung gelöscht'); } catch (e) { toast(e.message); }
            }
          }, 'Sammlung löschen')));
    }
    const content = h('div', { class: 'detail' }, emptyNotice,
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
      src ? h('p', { class: 'source' }, 'Quelle: ', h('a', { href: src, target: '_blank', rel: 'noopener noreferrer', text: src })) : null
    );

    const foot = h('div', { class: 'dlg-foot' });
    const normalFoot = () => {
      foot.textContent = '';
      foot.append(
        h('button', { type: 'button', class: 'btn btn-danger', onclick: askDelete }, 'Löschen'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openEdit(id) }, 'Bearbeiten'));
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

    if (base && F.switchable(unit)) {
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
    return section;
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

  function openEdit(id) {
    const r = id ? Store.recipe(id) : null;
    const v = r || { title: '', collectionId: '', course: '', mainIngredient: '', method: '', servings: 4, servingsUnit: 'Personen', formSize: '', totalTime: '', ingredients: [], steps: [], notes: '', imageUrl: '', sourceUrl: '' };
    const cols = Store.collections();
    body.dataset.id = id || '';

    // Bei neuem Rezept die gerade gefilterte Sammlung vorschlagen
    let preselect = v.collectionId;
    if (!preselect && state.filters.collectionId.size === 1) preselect = [...state.filters.collectionId][0];
    if (!preselect && cols.length === 1) preselect = cols[0].id;

    const sel = h('select', { id: 'fCollection' },
      h('option', { value: '', text: 'Bitte wählen …' }),
      cols.map(c => h('option', { value: c.id, text: c.name, selected: c.id === preselect })),
      h('option', { value: '__new', text: '+ Neue Sammlung anlegen …', selected: !cols.length }));
    const newCol = h('input', { id: 'fNewCollection', type: 'text', placeholder: 'Name der neuen Sammlung', autocomplete: 'off' });
    const newColField = field('Name der neuen Sammlung', newCol);
    newColField.hidden = sel.value !== '__new';
    sel.addEventListener('change', () => { newColField.hidden = sel.value !== '__new'; if (sel.value === '__new') newCol.focus(); });

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

    const imageSection = imagePicker(v);
    const ingRows = ingredientInput(v.ingredients);
    const ingredientsEditor = ingRows.el;

    const inp = (fid, value, extra) => h('input', Object.assign({ id: fid, type: 'text', value: value || '', autocomplete: 'off' }, extra || {}));
    const ta = (fid, value, rows) => { const t = h('textarea', { id: fid, rows: rows || 6 }); t.value = value || ''; return t; };

    const form = h('form', { class: 'form', id: 'recipeForm', novalidate: true },
      err,
      field('Name des Rezepts', inp('fTitle', v.title, { required: true })),
      imageSection,
      field('Sammlung', sel, 'Jedes Rezept liegt in genau einer Sammlung.'),
      newColField,
      h('div', { class: 'row3' },
        suggestField('Rezeptart', 'fCourse', v.course, 'z. B. Hauptgericht', 'course', COURSES),
        suggestField('Hauptzutat', 'fMain', v.mainIngredient, 'z. B. Hähnchen', 'mainIngredient', []),
        suggestField('Zubereitung', 'fMethod', v.method, 'z. B. Backen', 'method', METHODS)),
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
    ingRows.onChange = updateTime;
    updateTime();

    const cancel = () => { if (id && Store.recipe(id)) renderDetail(id); else closeDialog(); };

    // Bild aus der Zwischenablage einfügen (z. B. lange auf ein Feld tippen -> Einfügen)
    form.addEventListener('paste', e => {
      const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(x => /^image\//.test(x.type));
      if (f) { e.preventDefault(); imageSection.useFile(f); }
    });

    let saving = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (saving) return;
      err.hidden = true;
      const val = fid => form.querySelector('#' + fid).value;
      const lines = fid => val(fid).split('\n');
      const fail = (msg, fid) => { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); if (fid) form.querySelector('#' + fid).focus(); };

      if (!val('fTitle').trim()) return fail('Bitte gib dem Rezept einen Namen.', 'fTitle');
      if (!sel.value) return fail('Bitte wähle eine Sammlung aus.', 'fCollection');
      if (sel.value === '__new' && !newCol.value.trim()) return fail('Bitte gib der neuen Sammlung einen Namen.', 'fNewCollection');
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
        const collectionId = sel.value === '__new' ? Store.addCollection(newCol.value).id : sel.value;
        const oldCollection = r ? r.collectionId : null;
        const saved = Store.saveRecipe({
          id: id || undefined, title: val('fTitle'), collectionId,
          course: val('fCourse'), mainIngredient: val('fMain'), method: val('fMethod'),
          servings: val('fServings'), servingsUnit: unitSel.value, formSize,
          ingredients: ingRows.lines(), steps: lines('fSteps'), notes: val('fNotes'),
          imageId, imageUrl: val('fImage'), sourceUrl: val('fSource')
        });
        // Altes Foto aufräumen, wenn es ersetzt oder entfernt wurde
        if (v.imageId && v.imageId !== imageId) window.RecipeImages.remove(v.imageId);
        toast('Gespeichert');
        state.emptyCollection = null;
        if (oldCollection && oldCollection !== saved.collectionId && Store.collection(oldCollection) &&
            !Store.recipes().some(x => x.collectionId === oldCollection)) state.emptyCollection = oldCollection;
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
      head(r ? 'Rezept bearbeiten' : 'Neues Rezept', cancel), h('div', { class: 'dlg-scroll' }, form), foot));
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
        try { const n = Store.loadExamples(); toast(n === 1 ? '1 Beispielrezept hinzugefügt' : n + ' Beispielrezepte hinzugefügt'); openCollections(); }
        catch (e) { toast(e.message); }
      }
    }, have ? 'Fehlende Beispiele hinzufügen' : 'Beispielrezepte hinzufügen'));
    if (have) {
      const del = h('button', { type: 'button', class: 'btn btn-danger' }, 'Beispielrezepte entfernen');
      del.addEventListener('click', () => {
        row.textContent = '';
        row.append(h('p', { class: 'confirm-text', text: 'Alle ' + have + ' Beispielrezepte löschen?' }),
          h('button', { type: 'button', class: 'btn', onclick: () => openCollections() }, 'Abbrechen'),
          h('button', {
            type: 'button', class: 'btn btn-danger-solid', onclick: () => {
              try { const n = Store.removeExamples(); toast(n + ' Beispielrezepte entfernt'); openCollections(); }
              catch (e) { toast(e.message); }
            }
          }, 'Ja, entfernen'));
      });
      row.append(del);
    }
    box.append(info, row);
    return box;
  }

  function openCollections() {
    const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const showErr = m => { err.textContent = m; err.hidden = false; };
    const list = h('ul', { class: 'col-list' });

    Store.collections().forEach(c => {
      const n = Store.recipes().filter(r => r.collectionId === c.id).length;
      const name = h('input', { type: 'text', id: 'col-' + c.id, value: c.name, 'aria-label': 'Name der Sammlung' });
      list.append(h('li', { class: 'col-item' },
        name,
        h('span', { class: 'n', text: n === 1 ? '1 Rezept' : n + ' Rezepte' }),
        h('button', {
          type: 'button', class: 'btn', onclick: () => {
            try { Store.renameCollection(c.id, name.value); toast('Umbenannt'); openCollections(); } catch (e) { showErr(e.message); }
          }
        }, 'Umbenennen'),
        h('button', {
          type: 'button', class: 'btn btn-danger', onclick: () => {
            try { Store.deleteCollection(c.id); toast('Sammlung gelöscht'); openCollections(); } catch (e) { showErr(e.message); }
          }
        }, 'Löschen')));
    });

    const newName = h('input', { type: 'text', id: 'colNew', placeholder: 'Name der neuen Sammlung', autocomplete: 'off' });
    const addForm = h('form', {
      class: 'col-item', onsubmit: e => {
        e.preventDefault();
        try { Store.addCollection(newName.value); toast('Sammlung angelegt'); openCollections(); } catch (ex) { showErr(ex.message); }
      }
    }, newName, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Anlegen'));

    const content = h('div', { class: 'form' },
      err,
      Store.collections().length ? list : h('p', { text: 'Noch keine Sammlungen. Lege unten deine erste an.' }),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Neue Sammlung' }), addForm),
      examplesBox());

    showDialog('collections', h('div', { style: 'display:contents' },
      head('Sammlungen', closeDialog), h('div', { class: 'dlg-scroll' }, content)));
  }

  // ---------- Start ----------
  restoreView();
  const q = $('#q');
  q.value = state.query;
  q.addEventListener('input', () => { state.query = q.value; render(); });
  $('#qClear').addEventListener('click', () => { state.query = ''; q.value = ''; render(); q.focus(); });
  $('#btnReset').addEventListener('click', resetAll);
  $('#btnNew').addEventListener('click', () => openEdit(null));
  $('#btnCollections').addEventListener('click', openCollections);

  Store.onChange(() => {
    render();
    if (state.mode === 'detail' && body.dataset.id && !Store.recipe(body.dataset.id)) closeDialog();
  });

  render();
  syncFromHash();

  // Für automatische Tests
  window.__app = { state, render };
})();
