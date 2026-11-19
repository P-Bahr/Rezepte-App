// Zwei Geräte + nachgebauter Online-Speicher: node tests/sync-e2e.test.js
// Der echte Supabase-Client wird im Test durch einen Nachbau ersetzt, der mit einem
// gemeinsamen "Server" in diesem Node-Prozess spricht (inkl. Zugriffsschutz pro Benutzer).
const { chromium, devices } = require('playwright');
const URL = process.env.APP_URL || 'http://127.0.0.1:8123/';
const assert = (c, m) => { if (!c) throw new Error('FEHLER: ' + m); console.log('ok  ', m); };

// ---------- Nachgebauter Server ----------
const server = { users: {}, rows: { recipes: new Map(), collections: new Map() }, files: new Map(), uploads: 0, share_keys: [], inbox: [] };
const sha = t => require('crypto').createHash('sha256').update(t, 'utf8').digest('hex');
// So wie share_add() im Online-Speicher (wird vom Kurzbefehl aufgerufen)
function shareAdd(key, input) {
  const k = server.share_keys.find(x => x.key_hash === sha(key || ''));
  if (!k) return 'Teilen-Schlüssel ungültig';
  server.inbox.push({ id: 'in-' + server.inbox.length + '-' + Date.now(), user_id: k.user_id, input, created_at: new Date().toISOString() });
  return 'Gespeichert';
}
function handle(op, a) {
  if (op === 'signup') {
    if (server.users[a.email]) return { error: 'User already registered' };
    server.users[a.email] = { id: 'user-' + Object.keys(server.users).length, pw: a.password };
    return { id: server.users[a.email].id };
  }
  if (op === 'login') {
    const u = server.users[a.email];
    return u && u.pw === a.password ? { id: u.id } : { error: 'Invalid login credentials' };
  }
  if (op === 'select') {
    const all = [...server.rows[a.table].values()].filter(r => r.user_id === a.uid);
    return { data: all.slice(a.a, a.b + 1).map(r => ({ id: r.id, data: r.data, deleted: r.deleted, updated_at: r.updated_at })), error: null };
  }
  if (op === 'upsert') {
    for (const r of a.rows) if (r.user_id !== a.uid) return { error: { message: 'row-level security' } };
    a.rows.forEach(r => server.rows[a.table].set(r.user_id + '|' + r.id, r));
    return { error: null };
  }
  if (op === 'upload') {
    if (!a.path.startsWith(a.uid + '/')) return { error: { message: 'row-level security' } };
    server.files.set(a.path, a.b64); server.uploads++;
    return { error: null };
  }
  if (op === 'download') {
    if (!a.path.startsWith(a.uid + '/') || !server.files.has(a.path)) return { error: { message: 'not found' } };
    return { b64: server.files.get(a.path) };
  }
  if (op === 'insert') {
    if (a.row.user_id !== a.uid) return { error: { message: 'row-level security' } };
    server[a.table].push({ ...a.row, id: 'k' + server[a.table].length });
    return { error: null };
  }
  if (op === 'list') return { data: server[a.table].filter(r => r.user_id === a.uid), error: null };
  if (op === 'delete') {
    server[a.table] = server[a.table].filter(r => !(r.user_id === a.uid && r[a.col] === a.val));
    return { error: null };
  }
  return { error: 'unbekannt' };
}

const FAKE_CLIENT = `
window.supabase = { createClient() {
  // Ohne Internet schlägt jeder Aufruf fehl wie beim echten Server
  const call = (op, args) => navigator.onLine ? window.__srv(op, JSON.stringify(args)).then(JSON.parse) : Promise.reject(new TypeError('Failed to fetch'));
  let session = JSON.parse(localStorage.getItem('fake.session') || 'null');
  const listeners = [];
  const emit = () => listeners.forEach(f => f(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
  const setS = (id, email) => { session = { user: { id, email } }; localStorage.setItem('fake.session', JSON.stringify(session)); emit(); };
  const uid = () => session.user.id;
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async ({ email, password }) => { const r = await call('login', { email, password }); if (r.error) return { error: { message: r.error } }; setS(r.id, email); return { data: { session }, error: null }; },
      signUp: async ({ email, password }) => { const r = await call('signup', { email, password }); if (r.error) return { data: {}, error: { message: r.error } }; setS(r.id, email); return { data: { session }, error: null }; },
      signOut: async () => { session = null; localStorage.removeItem('fake.session'); emit(); return { error: null }; }
    },
    from(table) { return {
      select() { return { range: (a, b) => call('select', { table, uid: uid(), a, b }), order: () => call('list', { table, uid: uid() }) }; },
      insert: row => call('insert', { table, uid: uid(), row }),
      delete() { return { eq: (col, val) => call('delete', { table, uid: uid(), col, val }) }; },
      upsert: rows => call('upsert', { table, uid: uid(), rows })
    }; },
    storage: { from() { return {
      upload: async (path, blob) => { const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); return call('upload', { path, b64, uid: uid() }); },
      download: async path => { const r = await call('download', { path, uid: uid() }); if (r.error) return { data: null, error: r.error }; return { data: await (await fetch(r.b64)).blob(), error: null }; }
    }; } }
  };
} };`;

async function device(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.exposeFunction('__srv', (op, args) => JSON.stringify(handle(op, JSON.parse(args))));
  await ctx.route('**/js/vendor/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_CLIENT }));
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG = { supabaseUrl: 'https://test.example', supabaseKey: 'test' };" }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.errs = errs;
  await page.goto(URL);
  return page;
}
const synced = p => p.waitForFunction(() => { const s = document.getElementById('syncStatus'); return s && !s.hidden && s.dataset.kind === 'ok'; }, null, { timeout: 10000 });
const syncNow = async p => { await p.evaluate(() => { document.getElementById('syncStatus').dataset.kind = ''; window.RecipeSync.syncNow(); }); await synced(p); };
const titles = p => p.$$eval('.tile-title', e => e.map(x => x.textContent));

(async () => {
  const b = await chromium.launch();
  const A = await device(b, { viewport: { width: 1024, height: 1366 } });
  assert(await A.isVisible('.auth h2:has-text("Anmelden")'), 'Gerät A: Anmeldung wird verlangt');
  await A.fill('#authEmail', 'test@beispiel.de'); await A.fill('#authPw', '123');
  await A.click('text=Neues Konto anlegen');
  assert(await A.isVisible('.auth .form-error:has-text("mindestens 6 Zeichen")'), 'Zu kurzes Passwort wird gemeldet');
  await A.fill('#authPw', 'geheim123');
  await A.click('text=Neues Konto anlegen');
  await A.waitForSelector('.auth', { state: 'detached' });
  assert(true, 'Gerät A: Konto angelegt und angemeldet');
  await A.click('button:has-text("Beispielrezepte laden")');
  await synced(A);
  assert(server.rows.recipes.size === 25 && server.rows.collections.size === 5, 'Gerät A: 25 Rezepte und die 5 festen Sammlungen hochgeladen');
  assert((await A.textContent('#syncStatus')).startsWith('Abgeglichen'), 'Status zeigt „Abgeglichen“');

  // Gerät B
  const B = await device(b, devices['iPhone 13']);
  await B.fill('#authEmail', 'test@beispiel.de'); await B.fill('#authPw', 'falsch123');
  await B.click('.auth button[type=submit]');
  await B.waitForSelector('.auth .form-error:has-text("stimmt nicht")');
  assert(true, 'Gerät B: falsches Passwort wird gemeldet');
  await B.fill('#authPw', 'geheim123'); await B.click('.auth button[type=submit]');
  await B.waitForSelector('.auth', { state: 'detached' });
  await synced(B);
  assert((await titles(B)).length === 25, 'Gerät B: sieht alle 25 Rezepte von Gerät A');

  // A: neues Rezept mit Foto -> B
  await A.click('#btnNew');
  await A.fill('#fTitle', 'Omas Apfelstrudel');
  await A.fill('#fIngredients', 'Äpfel 1 kg\nZucker 80g');
  await A.fill('#fSteps', 'Äpfel schälen und in Scheiben schneiden.\n40 Minuten backen.');
  await A.setInputFiles('#fPhoto', 'icons/icon-512.png');
  await A.waitForSelector('.pick-preview[src^="blob:"]');
  await A.click('dialog button[type=submit]');
  await A.waitForSelector('dialog h2:has-text("Omas Apfelstrudel")');
  await A.waitForTimeout(1500); await synced(A);
  assert(server.uploads === 1, 'Foto wurde hochgeladen');
  await syncNow(B);
  await B.fill('#q', 'apfelstrudel');
  assert((await titles(B)).join() === 'Omas Apfelstrudel', 'Gerät B: neues Rezept von A ist da');
  await B.waitForSelector('.tile img[src^="blob:"]', { timeout: 5000 });
  assert(true, 'Gerät B: Foto von A wird angezeigt');
  await B.click('.tile'); await B.waitForTimeout(300);
  assert((await B.$$eval('dialog .ingredients li', e => e.map(x => x.textContent))).includes('80 g Zucker'), 'Gerät B: Zutaten korrekt');
  // B: Favorit setzen
  await B.click('dialog .fav-btn');
  await B.click('dialog .icon-btn[aria-label=Schließen]'); await B.fill('#q', '');
  await B.waitForTimeout(1500); await synced(B);
  await syncNow(A);
  assert(await A.evaluate(() => Store.recipes().find(r => r.title === 'Omas Apfelstrudel').favorite === true), 'Gerät A: Favorit von B übernommen');

  // B: Rezept löschen -> auf A weg
  await B.fill('#q', 'mango'); await B.click('.tile'); await B.waitForTimeout(300);
  await B.click('dialog >> text=Löschen'); await B.click('text=Ja, löschen');
  await B.waitForTimeout(1500); await synced(B);
  await syncNow(A);
  assert(!(await A.evaluate(() => Store.recipes().some(r => r.title === 'Mango-Lassi'))), 'Gerät A: auf B gelöschtes Rezept ist weg');

  // Offline ändern, später abgleichen
  await A.context().setOffline(true);
  await A.evaluate(() => { const r = Store.recipes().find(x => x.title === 'Linsensuppe'); Store.saveRecipe({ ...r, notes: 'Offline geändert' }); });
  await A.waitForTimeout(1500);
  await A.waitForFunction(() => document.getElementById('syncStatus').textContent.startsWith('Offline'));
  assert(true, 'Ohne Internet: Status „Offline – wird später abgeglichen“');
  await A.context().setOffline(false);
  await syncNow(A); await syncNow(B);
  assert(await B.evaluate(() => Store.recipes().find(x => x.title === 'Linsensuppe').notes === 'Offline geändert'), 'Offline gemachte Änderung kommt später an');

  // Konflikt: dasselbe Rezept auf beiden Geräten offline geändert
  const edit = (p, find, change) => p.evaluate(([f, c]) => { const r = Store.recipes().find(x => x.title.startsWith(f)); Store.saveRecipe({ ...r, ...c }); }, [find, change]);
  const conflictRound = async (find, changeA, changeB) => {
    await A.context().setOffline(true); await B.context().setOffline(true);
    await edit(A, find, changeA); await A.waitForTimeout(100);
    await edit(B, find, changeB); await B.waitForTimeout(100);
    await B.context().setOffline(false); await syncNow(B);
    await A.context().setOffline(false); await syncNow(A);
    await A.waitForSelector('.conflict');
  };
  await conflictRound('Tiramisu', { title: 'Tiramisu von A' }, { title: 'Tiramisu von B', notes: 'Mit Amaretto' });
  const sides = await A.$$eval('.conflict .side', e => e.map(x => x.innerText));
  assert(await A.isVisible('.conflict h2:has-text("Rezept auf zwei Geräten geändert")'), 'Konflikt-Fenster erscheint');
  assert(sides[0].includes('Dieses Gerät') && sides[0].includes('Tiramisu von A') && sides[1].includes('Anderes Gerät') && sides[1].includes('Tiramisu von B') && sides[1].includes('Mit Amaretto'), 'Fenster zeigt beide Versionen mit Unterschieden');
  assert(/geändert heute \d\d:\d\d/.test(sides[0]), 'Fenster zeigt, wann geändert wurde');
  assert(server.rows.recipes.get('user-0|' + await A.evaluate(() => Store.recipes().find(x => x.title.startsWith('Tiramisu')).id)).data.title === 'Tiramisu von B', 'Vor der Entscheidung wird nichts überschrieben');
  await A.click('.conflict [data-choice=remote]');
  await A.waitForSelector('.conflict', { state: 'detached' });
  await A.waitForTimeout(300); await syncNow(A); await syncNow(B);
  const t1 = await A.evaluate(() => Store.recipes().find(x => x.title.startsWith('Tiramisu')).title);
  const t1b = await B.evaluate(() => Store.recipes().find(x => x.title.startsWith('Tiramisu')).title);
  assert(t1 === 'Tiramisu von B' && t1b === 'Tiramisu von B', '„Anderes Gerät“ gewählt: beide Geräte haben diese Version');

  await conflictRound('Tiramisu', { title: 'Tiramisu A2' }, { title: 'Tiramisu B2' });
  await A.click('.conflict [data-choice=local]');
  await A.waitForSelector('.conflict', { state: 'detached' });
  await A.waitForTimeout(300); await syncNow(A); await syncNow(B);
  const t2 = await B.evaluate(() => Store.recipes().filter(x => x.title.startsWith('Tiramisu')).map(x => x.title).join());
  assert(t2 === 'Tiramisu A2', '„Dieses Gerät“ gewählt: Version von A kommt auch auf B an (' + t2 + ')');
  assert(!(await B.isVisible('.conflict')), 'Auf B danach kein weiteres Konflikt-Fenster');

  await conflictRound('Tiramisu', { title: 'Tiramisu A3' }, { title: 'Tiramisu B3' });
  await A.click('.conflict [data-choice=both]');
  await A.waitForSelector('.conflict', { state: 'detached' });
  await A.waitForTimeout(300); await syncNow(A); await syncNow(B);
  const t3 = await B.evaluate(() => Store.recipes().filter(x => x.title.startsWith('Tiramisu')).map(x => x.title).sort().join());
  assert(t3 === 'Tiramisu A3 (Kopie),Tiramisu B3', '„Beide behalten“: beide Versionen auf beiden Geräten (' + t3 + ')');

  // Hier gelöscht, dort geändert
  await A.context().setOffline(true); await B.context().setOffline(true);
  await A.evaluate(() => Store.deleteRecipe(Store.recipes().find(x => x.title === 'Hefezopf').id));
  await edit(B, 'Hefezopf', { notes: 'Mit Rosinen' });
  await B.context().setOffline(false); await syncNow(B);
  await A.context().setOffline(false); await syncNow(A);
  await A.waitForSelector('.conflict');
  assert((await A.$$eval('.conflict .side', e => e.map(x => x.innerText)))[0].includes('gelöscht'), 'Löschen gegen Ändern: Fenster zeigt „gelöscht“');
  await A.click('.conflict [data-choice=remote]');
  await A.waitForSelector('.conflict', { state: 'detached' });
  await A.waitForTimeout(300); await syncNow(A);
  assert(await A.evaluate(() => Store.recipes().some(x => x.title === 'Hefezopf' && x.notes === 'Mit Rosinen')), 'Geänderte Version wiederhergestellt');

  // Neu laden: angemeldet bleiben, Daten da
  await A.reload(); await synced(A);
  assert(!(await A.isVisible('.auth')) && (await titles(A)).length === 26, 'Nach Neuladen angemeldet, 26 Rezepte');
  assert(server.rows.recipes.size === 27, 'Server: 27 Einträge (26 + gelöschter Vermerk)');

  // Abmelden
  if (await A.isVisible('dialog[open]')) { await A.click('dialog .icon-btn[aria-label=Schließen]'); await A.waitForTimeout(300); }
  await A.click('#btnCollections');
  await A.click('dialog >> text=Abmelden'); await A.click('text=Ja, abmelden');
  await A.waitForSelector('.auth');
  assert(true, 'Abmelden zeigt wieder die Anmeldung');

  // Update mit alten Sammlungen im Online-Speicher: beide Geräte sortieren um, ohne Konflikt
  server.users['alt@beispiel.de'] = { id: 'user-alt', pw: 'geheim123' };
  const put = (table, id, data) => server.rows[table].set('user-alt|' + id, { id, user_id: 'user-alt', data, deleted: false, updated_at: data.updatedAt });
  put('collections', 'c-alltag', { id: 'c-alltag', name: 'Alltag', updatedAt: '2026-11-01T10:00:00.000Z' });
  put('collections', 'c-oma', { id: 'c-oma', name: 'Von Oma', updatedAt: '2026-11-01T10:00:00.000Z' });
  put('recipes', 'r-suppe', { id: 'r-suppe', title: 'Kürbissuppe', collectionId: 'c-alltag', method: 'Kochen', ingredients: ['1 Kürbis'], steps: ['30 Minuten kochen.'], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' });
  put('recipes', 'r-kuchen', { id: 'r-kuchen', title: 'Rührkuchen', collectionId: 'c-oma', method: '', mainIngredient: 'Minuten', ingredients: ['250 g Mehl', '3 Äpfel'], steps: ['Im Ofen 50 Minuten backen.'], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' });
  const login = async (p) => { await p.fill('#authEmail', 'alt@beispiel.de'); await p.fill('#authPw', 'geheim123'); await p.click('.auth button[type=submit]'); await p.waitForSelector('.auth', { state: 'detached' }); await synced(p); };
  const C = await device(b, { viewport: { width: 1024, height: 900 } });
  const Dd = await device(b, devices['iPhone 13']);
  await login(C); await login(Dd);
  await syncNow(C); await syncNow(Dd); await syncNow(C);
  const where = p => p.evaluate(() => Store.recipes().map(r => r.title + ':' + r.collectionId).sort().join(', '));
  assert(await where(C) === 'Kürbissuppe:col-topf, Rührkuchen:col-ofen' && await where(Dd) === await where(C), 'Alte Rezepte auf beiden Geräten gleich einsortiert (' + await where(Dd) + ')');
  assert(!(await C.isVisible('.conflict')) && !(await Dd.isVisible('.conflict')), 'Kein Konflikt-Fenster durch das Umsortieren');
  const live = [...server.rows.collections.values()].filter(r => r.user_id === 'user-alt' && !r.deleted).map(r => r.data.name).sort().join(',');
  assert(live === 'Grill,Kalt,Ofen,Pfanne,Topf', 'Online: alte Sammlungen gelöscht, feste angelegt (' + live + ')');
  const kuchen = server.rows.recipes.get('user-alt|r-kuchen').data;
  assert(kuchen.mainIngredient === 'Äpfel' && await C.evaluate(() => Store.recipe('r-kuchen').mainIngredient) === 'Äpfel' && await Dd.evaluate(() => Store.recipe('r-kuchen').mainIngredient) === 'Äpfel', 'Unsinnige Hauptzutat „Minuten“ online und auf beiden Geräten repariert (' + kuchen.mainIngredient + ')');
  assert(C.errs.length === 0 && Dd.errs.length === 0, 'Keine Skriptfehler beim Umsortieren ' + C.errs.concat(Dd.errs).join('; '));

  // ---------- Teilen-Menü: Schlüssel erstellen, Kurzbefehl schickt etwas, anderes Gerät holt es ab ----------
  await C.click('#btnCollections');
  await C.click('#btnShareKey');
  await C.waitForSelector('#shareKey');
  const key = (await C.textContent('#shareKey')).trim();
  assert(key.length >= 30 && server.share_keys.length === 1 && server.share_keys[0].key_hash === sha(key) && !server.share_keys.some(k => k.key_hash === key), 'Teilen-Schlüssel erstellt, online nur als Fingerabdruck gespeichert');
  assert((await C.textContent('#shareUrl')).endsWith('/rest/v1/rpc/share_add'), 'Adresse für den Kurzbefehl wird angezeigt');
  await C.click('dialog .dlg-head button, dialog button[aria-label="Schließen"]').catch(() => {});
  assert(shareAdd('falscher-schluessel-1234567890', 'https://x.example') === 'Teilen-Schlüssel ungültig' && server.inbox.length === 0, 'Falscher Schlüssel: nichts landet im Eingangsfach');
  assert(shareAdd(key, 'Schau mal https://www.pinterest.com/pin/123456/ lecker') === 'Gespeichert', 'Kurzbefehl: Link abgelegt');
  await Dd.evaluate(() => window.RecipeInbox.check());
  await Dd.waitForSelector('#inboxBanner');
  assert((await Dd.textContent('#inboxBanner')).includes('1 geteiltes Rezept'), 'Anderes Gerät: Hinweis „1 geteiltes Rezept“');
  await Dd.click('#inboxBanner button:has-text("Ansehen")');
  await Dd.waitForSelector('#importUrl');
  assert(await Dd.inputValue('#importUrl') === 'https://www.pinterest.com/pin/123456/', 'Ansehen startet den Import mit dem geteilten Link');
  assert(server.inbox.length === 0, 'Eingangsfach danach leer');
  await Dd.keyboard.press('Escape');
  shareAdd(key, 'Omas Nudelauflauf\nZutaten:\n200 g Nudeln\n1 EL Butter\nZubereitung:\nNudeln 10 Minuten kochen.');
  await Dd.evaluate(() => window.RecipeInbox.check());
  await Dd.click('#inboxBanner button:has-text("Ansehen")');
  await Dd.waitForSelector('#fTitle');
  assert(await Dd.inputValue('#fTitle') === 'Omas Nudelauflauf' && (await Dd.inputValue('#fIngredients')).includes('200 g Nudeln'), 'Geteilter Text wird als Rezept zum Prüfen geöffnet');
  assert(Dd.errs.length === 0 && C.errs.length === 0, 'Keine Skriptfehler beim Teilen ' + C.errs.concat(Dd.errs).join('; '));

  assert(A.errs.length === 0 && B.errs.length === 0, 'Keine Skriptfehler ' + A.errs.concat(B.errs).join('; '));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
