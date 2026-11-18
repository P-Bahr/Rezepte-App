/* Bedienoberfläche: Übersicht, Suche, Filter, Rezeptfenster, Formular. */
(function () {
  'use strict';

  const S = window.RecipeSearch;
  const Store = window.Store;
  const $ = sel => document.querySelector(sel);

  const COURSES = ['Frühstück', 'Vorspeise', 'Suppe', 'Salat', 'Hauptgericht', 'Beilage', 'Dessert', 'Gebäck', 'Snack', 'Getränk', 'Sauce & Dip'];
  const METHODS = ['Backen', 'Braten', 'Kochen', 'Grillen', 'Dünsten', 'Schmoren', 'Frittieren', 'Heißluftfritteuse', 'Roh / ohne Kochen'];
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
      sessionStorage.setItem('rezepte.ansicht', JSON.stringify({ q: state.query, f }));
    } catch (e) { /* nicht schlimm */ }
  }
  function restoreView() {
    try {
      const v = JSON.parse(sessionStorage.getItem('rezepte.ansicht') || 'null');
      if (!v) return;
      state.query = v.q || '';
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

    const active = state.query.trim() || FACETS.some(f => state.filters[f.key].size);
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
      if (!values.length) continue;

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
      box.append(h('div', { class: 'facet' }, h('span', { class: 'facet-label', text: f.label }), chips));
      if (scrollPos[f.key]) chips.scrollLeft = scrollPos[f.key];
    }
  }

  function placeholder(title) {
    return h('div', { class: 'ph', 'aria-hidden': 'true', text: (title.trim()[0] || '?').toUpperCase() });
  }

  function imageBox(cls, recipe) {
    const box = h('div', { class: cls });
    const url = safeUrl(recipe.imageUrl);
    if (url) {
      const img = h('img', { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => { img.remove(); box.append(placeholder(recipe.title)); });
      box.append(img);
    } else box.append(placeholder(recipe.title));
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
        h('p', { text: 'Lege dein erstes Rezept an. Zum Ausprobieren von Suche und Filtern kannst du auch zehn Beispielrezepte laden und später wieder löschen.' }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openEdit(null) }, '+ Neues Rezept'),
          h('button', {
            type: 'button', class: 'btn', onclick: () => {
              try { Store.loadExamples(); toast('Beispielrezepte geladen'); } catch (e) { toast(e.message); }
            }
          }, 'Beispielrezepte laden')));
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
      const meta = [collectionName(r.collectionId), window.RecipeTime.label(r)].filter(Boolean).join(' · ');
      frag.append(h('button', { type: 'button', class: 'tile', onclick: () => openDetail(r.id) },
        imageBox('tile-img', r),
        h('div', { class: 'tile-body' },
          h('span', { class: 'tile-title', text: r.title }),
          meta ? h('span', { class: 'tile-meta', text: meta }) : null)));
    }
    grid.append(frag);
  }

  function resetAll() {
    state.query = '';
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

  dlg.addEventListener('cancel', e => { e.preventDefault(); if (state.mode === 'detail') closeDetail(); else if (state.mode !== 'edit') closeDialog(); });
  dlg.addEventListener('click', e => { if (e.target === dlg && state.mode === 'detail') closeDetail(); });

  // Wischen vom linken Rand = zurück (wie in iOS-Apps)
  let swipe = null;
  let lastHashChange = 0;
  window.addEventListener('hashchange', () => { lastHashChange = Date.now(); });
  document.addEventListener('touchstart', e => {
    if (!dlg.open || state.mode !== 'detail' || e.touches.length !== 1) { swipe = null; return; }
    const t = e.touches[0];
    swipe = t.clientX <= 30 ? { x: t.clientX, y: t.clientY, start: Date.now(), dx: 0 } : null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!swipe) return;
    const t = e.touches[0];
    swipe.dx = t.clientX - swipe.x;
    if (Math.abs(t.clientY - swipe.y) > Math.max(40, swipe.dx)) { swipe = null; dlg.style.transform = ''; return; }
    if (swipe.dx > 0) dlg.style.transform = 'translateX(' + swipe.dx + 'px)';
  }, { passive: true });
  const endSwipe = cancelled => {
    if (!swipe) return;
    const s = swipe;
    swipe = null;
    dlg.style.transition = 'transform .15s ease';
    dlg.style.transform = '';
    setTimeout(() => { dlg.style.transition = ''; }, 200);
    if (cancelled || s.dx < 80) return;
    // Falls der Browser selbst schon zurückgegangen ist, nicht doppelt zurück
    setTimeout(() => { if (lastHashChange < s.start && state.mode === 'detail') closeDetail(); }, 250);
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
      if (Store.recipe(id)) { if (!(state.mode === 'detail' && body.dataset.id === id)) renderDetail(id); }
      else { clearHash(); hideDialog(); toast('Dieses Rezept gibt es nicht mehr.'); }
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

  function head(title, onClose) {
    return h('div', { class: 'dlg-head' },
      h('h2', { id: 'dlgTitle', text: title }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schließen', onclick: onClose }, '×'));
  }

  function renderDetail(id) {
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
      safeUrl(r.imageUrl) ? (() => {
        const img = h('img', { class: 'detail-img', src: safeUrl(r.imageUrl), alt: '', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => img.remove());
        return img;
      })() : null,
      tags.length ? h('div', { class: 'tags' }, tags.map(t => h('span', { class: 'tag', text: t }))) : null,
      h('div', { class: 'facts' }, facts),
      r.ingredients.length ? ingredientsSection(r) : null,
      r.steps.length ? h('section', null, h('h3', { text: 'Zubereitung' }),
        h('ol', null, r.steps.map(s => h('li', { text: s })))) : null,
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
      head(r.title, closeDetail), h('div', { class: 'dlg-scroll' }, content), foot));
  }

  // ---------- Notizen mit Links zu passenden Rezepten ----------
  function notesSection(r) {
    const links = window.RecipeLinks.findLinks(r, Store.recipes());
    const p = h('p', { class: 'notes' });
    let pos = 0;
    for (const l of links) {
      if (l.start > pos) p.append(r.notes.slice(pos, l.start));
      p.append(h('a', {
        href: '#rezept-' + encodeURIComponent(l.id), class: 'recipe-link',
        onclick: e => { e.preventDefault(); openDetail(l.id); }
      }, r.notes.slice(l.start, l.end)));
      pos = l.end;
    }
    if (pos < r.notes.length) p.append(r.notes.slice(pos));

    const ids = [...new Set(links.map(l => l.id))];
    return h('section', null, h('h3', { text: 'Notizen' }), p,
      ids.length ? h('div', { class: 'related' }, h('span', { class: 'related-label', text: 'Passt dazu:' }),
        ids.map(id => h('button', { type: 'button', class: 'btn', onclick: () => openDetail(id) }, Store.recipe(id).title))) : null);
  }

  // ---------- Zutaten mit Regler für Personen und Formgröße ----------
  const ROUND = /(?:Ø|ø|Durchmesser)\s*(\d+(?:[.,]\d+)?)\s*cm|(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*(?:Ø|ø)|(\d+)er\b/i;
  function roundDiameter(size) {
    const m = String(size || '').match(ROUND);
    if (!m) return null;
    const d = parseFloat((m[1] || m[2] || m[3]).replace(',', '.'));
    return d >= 8 && d <= 50 ? d : null;
  }

  function stepper(label, onMinus, onPlus) {
    const value = h('span', { class: 'stepper-value', 'aria-live': 'polite' });
    const minus = h('button', { type: 'button', class: 'icon-btn', 'aria-label': label + ': weniger', onclick: onMinus }, '−');
    const plus = h('button', { type: 'button', class: 'icon-btn', 'aria-label': label + ': mehr', onclick: onPlus }, '+');
    return { el: h('div', { class: 'stepper', role: 'group', 'aria-label': label }, minus, value, plus), value, minus, plus };
  }

  function ingredientsSection(r) {
    const Sc = window.RecipeScale;
    const base = r.servings;
    const unit = r.servingsUnit || '';
    const size = (r.formSize || '').trim();
    const d0 = roundDiameter(size);
    const section = h('section', { class: 'ingredients' });
    const list = h('ul');

    // Personen-Rezepte starten immer bei 4, andere (Blech, Stück) bei ihrer eigenen Menge
    let target = base ? (Sc.isPersons(unit) ? 4 : base) : null;
    let d = d0;

    const count = base ? stepper('Menge', () => {
      target = Math.max(1, Math.ceil(target - 1e-9) - 1); update();
    }, () => {
      target = Math.floor(target + 1e-9) + 1; update();
    }) : null;
    // Runde Form: Durchmesser in 2-cm-Schritten, Mengen nach Fläche umgerechnet
    const dia = d0 ? stepper('Formgröße', () => { d = Math.max(12, d - 2); update(); }, () => { d = Math.min(32, d + 2); update(); }) : null;

    function update() {
      let factor = 1;
      if (count) {
        factor *= target / base;
        count.value.textContent = Sc.servingsLabel(target, unit);
        count.minus.disabled = target <= 1;
      }
      if (dia) {
        factor *= (d * d) / (d0 * d0);
        dia.value.textContent = 'Ø ' + Sc.formatCount(d) + ' cm';
        dia.minus.disabled = d <= 12;
        dia.plus.disabled = d >= 32;
      }
      list.textContent = '';
      for (const line of r.ingredients) {
        list.append(h('li', null, Sc.scaleIngredient(line, factor).map(p => p.amount ? h('b', { text: p.t }) : p.t)));
      }
    }
    update();

    const controls = h('div', { class: 'ing-controls' });
    if (count) controls.append(count.el);
    if (dia) controls.append(h('div', { class: 'form-size' }, h('span', { class: 'form-size-label', text: 'Form' }), dia.el));
    else if (size) controls.append(h('div', { class: 'form-size' }, h('span', { class: 'form-size-label', text: 'Größe' }), h('b', { text: size })));

    section.append(h('div', { class: 'ing-head' }, h('h3', { text: 'Zutaten' }), controls), list);
    if (!base && !d0) {
      section.append(h('p', { class: 'hint', text: 'Zum Umrechnen: Tippe auf „Bearbeiten“ und trage ein, für wie viele Personen das Rezept ist.' }));
    }
    return section;
  }

  // ---------- Formular: neu / bearbeiten ----------
  function datalist(id, base, key) {
    const seen = new Map();
    base.forEach(v => seen.set(facetKey(v), v));
    Store.recipes().forEach(r => { if (r[key] && !seen.has(facetKey(r[key]))) seen.set(facetKey(r[key]), r[key]); });
    return h('datalist', { id }, [...seen.values()].map(v => h('option', { value: v })));
  }

  function field(label, input, hint) {
    const id = input.id || input.querySelector('[id]').id;
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null);
  }

  function openEdit(id) {
    const r = id ? Store.recipe(id) : null;
    const v = r || { title: '', collectionId: '', course: '', mainIngredient: '', method: '', servings: 4, servingsUnit: 'Personen', totalTime: '', ingredients: [], steps: [], notes: '', imageUrl: '', sourceUrl: '' };
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
    const inp = (fid, value, extra) => h('input', Object.assign({ id: fid, type: 'text', value: value || '', autocomplete: 'off' }, extra || {}));
    const ta = (fid, value, rows) => { const t = h('textarea', { id: fid, rows: rows || 6 }); t.value = value || ''; return t; };

    const form = h('form', { class: 'form', id: 'recipeForm', novalidate: true },
      err,
      field('Name des Rezepts', inp('fTitle', v.title, { required: true })),
      field('Sammlung', sel, 'Jedes Rezept liegt in genau einer Sammlung.'),
      newColField,
      h('div', { class: 'row3' },
        field('Rezeptart', inp('fCourse', v.course, { list: 'dlCourse', placeholder: 'z. B. Hauptgericht' })),
        field('Hauptzutat', inp('fMain', v.mainIngredient, { list: 'dlMain', placeholder: 'z. B. Hähnchen' })),
        field('Zubereitung', inp('fMethod', v.method, { list: 'dlMethod', placeholder: 'z. B. Backen' }))),
      h('div', { class: 'row3' },
        field('Rezept ist für', inp('fServings', v.servings ? window.RecipeScale.formatCount(v.servings) : '', { inputmode: 'decimal', placeholder: 'z. B. 4' })),
        field('Einheit', inp('fServUnit', v.servingsUnit || (v.servings ? 'Personen' : ''), { list: 'dlUnit', placeholder: 'Personen' }), 'Meist „Personen“. Auch möglich: Stück, Blech, Springform.'),
        field('Form- oder Blechgröße', inp('fFormSize', v.formSize, { placeholder: 'z. B. Ø 26 cm oder 30 × 40 cm' }), 'Nur bei Kuchen, Aufläufen usw. Bei runden Formen mit Ø rechnet die App auch auf andere Größen um.'),
        h('div', { class: 'field' }, h('span', { class: 'label', text: 'Zeit' }),
          h('output', { id: 'fTimeOut', class: 'time-out', for: 'fSteps fIngredients' }),
          h('span', { class: 'hint', text: 'Wird aus den Schritten berechnet.' }))),
      field('Zutaten', ta('fIngredients', v.ingredients.join('\n'), 8), 'Eine Zutat pro Zeile, mit den Mengen aus dem Originalrezept. Die App rechnet sie für andere Personenzahlen um.'),
      field('Zubereitung (Schritte)', ta('fSteps', v.steps.join('\n'), 8), 'Ein Schritt pro Zeile.'),
      field('Notizen', ta('fNotes', v.notes, 3)),
      field('Bild-Adresse (optional)', inp('fImage', v.imageUrl, { type: 'url', inputmode: 'url', placeholder: 'https://…' })),
      field('Quelle (optional)', inp('fSource', v.sourceUrl, { type: 'url', inputmode: 'url', placeholder: 'https://…' })),
      datalist('dlCourse', COURSES, 'course'),
      datalist('dlMain', [], 'mainIngredient'),
      datalist('dlMethod', METHODS, 'method'),
      datalist('dlUnit', ['Personen', 'Stück', 'Blech', 'Springform', 'Kastenform', 'Auflaufform', 'Gläser'], 'servingsUnit'));

    // Zeit live aus den Schritten berechnen
    const timeOut = form.querySelector('#fTimeOut');
    const updateTime = () => {
      const t = window.RecipeTime.label({ steps: form.querySelector('#fSteps').value.split('\n').filter(x => x.trim()), ingredients: form.querySelector('#fIngredients').value.split('\n').filter(x => x.trim()) });
      timeOut.textContent = t || 'Erscheint, sobald Schritte eingetragen sind';
    };
    form.querySelector('#fSteps').addEventListener('input', updateTime);
    form.querySelector('#fIngredients').addEventListener('input', updateTime);
    updateTime();

    const cancel = () => { if (id && Store.recipe(id)) renderDetail(id); else closeDialog(); };

    form.addEventListener('submit', e => {
      e.preventDefault();
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
      try {
        const collectionId = sel.value === '__new' ? Store.addCollection(newCol.value).id : sel.value;
        const oldCollection = r ? r.collectionId : null;
        const saved = Store.saveRecipe({
          id: id || undefined, title: val('fTitle'), collectionId,
          course: val('fCourse'), mainIngredient: val('fMain'), method: val('fMethod'),
          servings: val('fServings'), servingsUnit: val('fServUnit'), formSize: val('fFormSize'),
          ingredients: lines('fIngredients'), steps: lines('fSteps'), notes: val('fNotes'),
          imageUrl: val('fImage'), sourceUrl: val('fSource')
        });
        toast('Gespeichert');
        state.emptyCollection = null;
        if (oldCollection && oldCollection !== saved.collectionId && Store.collection(oldCollection) &&
            !Store.recipes().some(x => x.collectionId === oldCollection)) state.emptyCollection = oldCollection;
        if (hashId() === saved.id) renderDetail(saved.id);
        else openDetail(saved.id);
      } catch (ex) { fail(ex.message); }
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
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Neue Sammlung' }), addForm));

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
