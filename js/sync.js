/* Online-Abgleich mit Supabase (Datenbank + Anmeldung + Fotos).
   Grundidee: Jedes Gerät behält alle Rezepte auch lokal (schnell, offline nutzbar).
   Sobald Internet da ist, werden Änderungen in beide Richtungen abgeglichen.
   Konflikte: Pro Rezept/Sammlung gewinnt die neuere Änderung (updatedAt).
   Gelöschtes wird als "gelöscht" vermerkt, damit es auf anderen Geräten verschwindet.
   Ohne Zugangsdaten in config.js läuft die App wie bisher nur auf dem Gerät. */
(function () {
  'use strict';

  const SNAP_KEY = 'rezepte.abgleich.stand';
  const PAGE = 1000;
  const BUCKET = 'bilder';

  // ---------- Reine Hilfsfunktionen (ohne Netz, getestet in tests/sync.test.js) ----------
  const stamp = x => x.updatedAt || x.createdAt || '0';
  const KINDS = [['recipes', 'r'], ['collections', 'c']];

  function emptySnap(user) { return { user: user || null, r: {}, c: {}, img: {} }; }

  /* Führt den Stand vom Server mit dem lokalen Stand zusammen.
     local: { recipes, collections }  remote: { recipes: rows, collections: rows }  snap: zuletzt bekannter Serverstand
     Rückgabe: { data, snap } */
  function merge(local, remote, snap, now) {
    now = now || new Date().toISOString();
    const data = {};
    const ns = { user: snap.user, r: { ...snap.r }, c: { ...snap.c }, img: { ...(snap.img || {}) } };
    for (const [kind, key] of KINDS) {
      const L = new Map(local[kind].map(x => [x.id, x]));
      for (const row of remote[kind] || []) {
        const loc = L.get(row.id);
        const known = snap[key][row.id];
        if (row.deleted) {
          // Auf einem anderen Gerät gelöscht – außer es wurde hier danach noch geändert
          if (loc && stamp(loc) > row.updated_at) { /* behalten, wird wieder hochgeladen */ }
          else L.delete(row.id);
        } else if (!loc) {
          // Neu von einem anderen Gerät – außer es wurde hier seit dem letzten Abgleich gelöscht
          if (!(known && !known.d)) L.set(row.id, row.data);
        } else if (row.updated_at > stamp(loc)) {
          L.set(row.id, row.data);
        }
        ns[key][row.id] = { u: row.updated_at, d: !!row.deleted };
      }
      data[kind] = [...L.values()];
    }

    // Gleichnamige Sammlungen (z. B. auf zwei Geräten offline angelegt) zusammenlegen.
    // Behalten wird die, die der Server schon kennt; Rezepte werden umgehängt.
    const onServer = new Set((remote.collections || []).filter(r => !r.deleted).map(r => r.id));
    const byName = new Map();
    const remap = new Map();
    for (const c of data.collections) {
      const k = String(c.name || '').trim().toLowerCase();
      const keep = byName.get(k);
      if (!keep) { byName.set(k, c); continue; }
      const winner = onServer.has(c.id) && !onServer.has(keep.id) ? c : keep;
      const loser = winner === c ? keep : c;
      byName.set(k, winner);
      remap.set(loser.id, winner.id);
    }
    if (remap.size) {
      data.collections = data.collections.filter(c => !remap.has(c.id));
      data.recipes = data.recipes.map(r => (remap.has(r.collectionId) ? { ...r, collectionId: remap.get(r.collectionId), updatedAt: now } : r));
    }

    // Beispielrezepte, die auf zwei Geräten getrennt geladen wurden, nur einmal behalten
    const remoteExampleTitles = new Set((remote.recipes || []).filter(r => !r.deleted && r.data && r.data.example).map(r => r.data.title.toLowerCase()));
    data.recipes = data.recipes.filter(r => !(r.example && !ns.r[r.id] && remoteExampleTitles.has(String(r.title).toLowerCase())));

    return { data, snap: ns };
  }

  /* Was muss hochgeladen werden? Geänderte/neue Einträge und hier gelöschte. */
  function pending(local, snap) {
    const out = { upserts: { recipes: [], collections: [] }, deletes: { recipes: [], collections: [] } };
    for (const [kind, key] of KINDS) {
      const ids = new Set();
      for (const x of local[kind]) {
        ids.add(x.id);
        const s = snap[key][x.id];
        if (!s || s.d || s.u !== stamp(x)) out.upserts[kind].push(x);
      }
      for (const id in snap[key]) if (!snap[key][id].d && !ids.has(id)) out.deletes[kind].push(id);
    }
    return out;
  }

  const Sync = { merge, pending, stamp, enabled: false };
  window.RecipeSync = Sync;

  // ---------- Ab hier nur mit Zugangsdaten und geladener Supabase-Bibliothek ----------
  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase || !window.supabase.createClient) return;

  const Store = window.Store;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rezepte.anmeldung' }
  });
  Sync.enabled = true;
  Sync.client = client;

  let session = null;
  let running = false;
  let again = false;
  let applying = false;
  let timer = null;

  function loadSnap(user) {
    try {
      const s = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
      if (s && s.user === user && s.r && s.c) return { img: {}, ...s };
    } catch (e) { /* neu anfangen */ }
    return emptySnap(user);
  }
  function saveSnap(s) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); } catch (e) { /* egal */ } }

  // ---------- Statusanzeige ----------
  const statusEl = () => document.getElementById('syncStatus');
  function status(text, kind) {
    const el = statusEl();
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.dataset.kind = kind || '';
  }

  async function fetchAll(table) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client.from(table).select('id,data,deleted,updated_at').range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  async function upsertRows(table, rows) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await client.from(table).upsert(rows.slice(i, i + 200), { onConflict: 'user_id,id' });
      if (error) throw error;
    }
  }

  // Fotos hochladen, bevor das Rezept hochgeladen wird (damit andere Geräte es finden)
  async function uploadImages(recipes, snap, uid) {
    for (const r of recipes) {
      if (!r.imageId || snap.img[r.imageId]) continue;
      const blob = await window.RecipeImages.blob(r.imageId);
      if (!blob) continue; // Foto existiert hier nicht (mehr)
      const { error } = await client.storage.from(BUCKET).upload(uid + '/' + r.imageId + '.jpg', blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      snap.img[r.imageId] = 1;
    }
  }

  async function syncNow() {
    if (!session) return;
    if (running) { again = true; return; }
    running = true;
    const uid = session.user.id;
    try {
      status('Abgleich …', 'busy');
      let snap = loadSnap(uid);
      // 1. Stand vom Server holen und zusammenführen
      const remote = { recipes: await fetchAll('recipes'), collections: await fetchAll('collections') };
      const merged = merge(Store._snapshot(), remote, snap);
      applying = true;
      try { Store._replace(merged.data); } finally { applying = false; }
      snap = merged.snap;
      saveSnap(snap);
      // 2. Eigene Änderungen hochladen
      const local = Store._snapshot();
      const p = pending(local, snap);
      await uploadImages(p.upserts.recipes, snap, uid);
      saveSnap(snap);
      const now = new Date().toISOString();
      for (const [kind, key] of KINDS) {
        const rows = p.upserts[kind].map(x => ({ id: x.id, user_id: uid, data: x, deleted: false, updated_at: stamp(x) }))
          .concat(p.deletes[kind].map(id => ({ id, user_id: uid, data: null, deleted: true, updated_at: now })));
        if (!rows.length) continue;
        await upsertRows(kind, rows);
        rows.forEach(row => { snap[key][row.id] = { u: row.updated_at, d: row.deleted }; });
        saveSnap(snap);
      }
      const t = new Date();
      status('Abgeglichen ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'), 'ok');
    } catch (e) {
      const offline = !navigator.onLine || /fetch|network|Failed/i.test(String(e && (e.message || e)));
      status(offline ? 'Offline – wird später abgeglichen' : 'Abgleich fehlgeschlagen – erneuter Versuch folgt', 'error');
      if (!offline && window.console) console.warn('Abgleich:', e);
    } finally {
      running = false;
      if (again) { again = false; schedule(500); }
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(syncNow, ms == null ? 1200 : ms);
  }
  Sync.syncNow = syncNow;

  // Fehlende Fotos auf diesem Gerät aus dem Online-Speicher holen
  window.RecipeImages.setRemote(async key => {
    if (!session) return null;
    const { data, error } = await client.storage.from(BUCKET).download(session.user.id + '/' + key + '.jpg');
    return error ? null : data;
  });

  // Nach jeder Änderung (kurz verzögert) abgleichen
  Store.onChange(() => { if (!applying && session) schedule(); });
  window.addEventListener('online', () => schedule(200));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(200); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 3 * 60 * 1000);

  // ---------- Anmeldung ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    kids.flat().forEach(c => c != null && el.append(c));
    return el;
  }

  let panel = null;
  function showLogin() {
    if (panel) return;
    const email = h('input', { id: 'authEmail', type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'name@beispiel.de', required: true });
    const pw = h('input', { id: 'authPw', type: 'password', autocomplete: 'current-password', placeholder: 'mindestens 6 Zeichen', required: true, minlength: '6' });
    const msg = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const info = h('p', { class: 'hint', 'aria-live': 'polite' });
    const say = (el, t) => { el.textContent = t; el.hidden = !t; };
    // Nach erfolgreicher Anmeldung ist die Seite schon geschlossen -> dann nichts mehr tun
    const busy = on => { if (panel) panel.querySelectorAll('button').forEach(b => { b.disabled = on; }); };
    const check = () => {
      if (!email.value.trim() || !email.value.includes('@')) { say(msg, 'Bitte gib deine E-Mail-Adresse ein.'); email.focus(); return false; }
      if (pw.value.length < 6) { say(msg, 'Das Passwort braucht mindestens 6 Zeichen.'); pw.focus(); return false; }
      say(msg, ''); return true;
    };
    const login = async e => {
      e.preventDefault();
      if (!check()) return;
      busy(true); say(info, 'Anmeldung läuft …');
      const { error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      busy(false); say(info, '');
      if (error) say(msg, /invalid/i.test(error.message) ? 'E-Mail oder Passwort stimmt nicht.' : /confirm/i.test(error.message) ? 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der E-Mail).' : 'Anmeldung fehlgeschlagen: ' + error.message);
    };
    const signup = async () => {
      if (!check()) return;
      busy(true); say(info, 'Konto wird angelegt …');
      const { data, error } = await client.auth.signUp({ email: email.value.trim(), password: pw.value });
      busy(false); say(info, '');
      if (error) { say(msg, /already|registered/i.test(error.message) ? 'Für diese E-Mail gibt es schon ein Konto. Bitte „Anmelden“ tippen.' : /signups? not allowed|disabled/i.test(error.message) ? 'Neue Konten sind abgeschaltet.' : 'Konto anlegen fehlgeschlagen: ' + error.message); return; }
      if (!data.session) say(info, 'Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail und melde dich dann hier an.');
    };
    panel = h('div', { class: 'auth', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'authTitle' },
      h('form', { class: 'auth-box form', novalidate: true, onsubmit: login },
        h('h2', { id: 'authTitle', text: 'Anmelden' }),
        h('p', { text: 'Melde dich an, damit deine Rezepte auf all deinen Geräten gleich sind. Auf jedem Gerät nur einmal nötig.' }),
        msg,
        h('div', { class: 'field' }, h('label', { for: 'authEmail', text: 'E-Mail' }), email),
        h('div', { class: 'field' }, h('label', { for: 'authPw', text: 'Passwort' }), pw),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Anmelden'),
        h('button', { type: 'button', class: 'btn', onclick: signup }, 'Neues Konto anlegen'),
        info));
    document.body.append(panel);
    email.focus();
  }
  function hideLogin() { if (panel) { panel.remove(); panel = null; } }

  Sync.email = () => (session ? session.user.email : '');
  Sync.signOut = async () => {
    await client.auth.signOut();
  };

  client.auth.onAuthStateChange((event, s) => {
    session = s;
    if (session) { hideLogin(); schedule(50); }
    else { showLogin(); const el = statusEl(); if (el) el.hidden = true; }
  });
  client.auth.getSession().then(({ data }) => {
    session = data.session;
    if (session) { hideLogin(); schedule(50); } else showLogin();
  });
})();
