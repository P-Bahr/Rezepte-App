// Zwei Geräte + nachgebauter Online-Speicher: node tests/sync-e2e.test.js
// Der echte Supabase-Client wird im Test durch einen Nachbau ersetzt, der mit einem
// gemeinsamen "Server" in diesem Node-Prozess spricht (inkl. Zugriffsschutz pro Benutzer).
const { chromium, devices } = require('playwright');
const URL = process.env.APP_URL || 'http://127.0.0.1:8123/';
const assert = (c, m) => { if (!c) throw new Error('FEHLER: ' + m); console.log('ok  ', m); };

// ---------- Nachgebauter Server ----------
const server = { users: {}, rows: { recipes: new Map(), collections: new Map() }, files: new Map(), uploads: 0 };
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
  return { error: 'unbekannt' };
}

const FAKE_CLIENT = `
window.supabase = { createClient() {
  const call = (op, args) => window.__srv(op, JSON.stringify(args)).then(JSON.parse);
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
      select() { return { range: (a, b) => call('select', { table, uid: uid(), a, b }) }; },
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
  assert(server.rows.recipes.size === 25 && server.rows.collections.size === 4, 'Gerät A: 25 Rezepte und 4 Sammlungen hochgeladen');
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
  await A.selectOption('#fCollection', { label: 'Backen & Süßes' });
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

  // Gleiches Rezept auf beiden Geräten geändert -> neuere Änderung gewinnt
  const rename = async (p, t) => p.evaluate(t => { const r = Store.recipes().find(x => x.title.startsWith('Tiramisu')); Store.saveRecipe({ ...r, title: t }); }, t);
  await A.evaluate(() => { window.__pause = true; });
  await rename(A, 'Tiramisu von A');
  await A.waitForTimeout(50);
  await rename(B, 'Tiramisu von B');
  await B.waitForTimeout(1500); await synced(B);
  await A.waitForTimeout(1500); await syncNow(A);
  await syncNow(B);
  const tA = await A.evaluate(() => Store.recipes().find(x => x.title.startsWith('Tiramisu')).title);
  const tB = await B.evaluate(() => Store.recipes().find(x => x.title.startsWith('Tiramisu')).title);
  assert(tA === 'Tiramisu von B' && tB === 'Tiramisu von B', 'Gleichzeitig geändert: neuere Änderung gewinnt auf beiden Geräten (' + tA + ' / ' + tB + ')');

  // Offline ändern, später abgleichen
  await A.context().setOffline(true);
  await A.evaluate(() => { const r = Store.recipes().find(x => x.title === 'Linsensuppe'); Store.saveRecipe({ ...r, notes: 'Offline geändert' }); });
  await A.waitForTimeout(1500);
  await A.context().setOffline(false);
  await syncNow(A); await syncNow(B);
  assert(await B.evaluate(() => Store.recipes().find(x => x.title === 'Linsensuppe').notes === 'Offline geändert'), 'Offline gemachte Änderung kommt später an');

  // Neu laden: angemeldet bleiben, Daten da
  await A.reload(); await synced(A);
  assert(!(await A.isVisible('.auth')) && (await titles(A)).length === 25, 'Nach Neuladen angemeldet, 25 Rezepte');
  assert(server.rows.recipes.size === 26, 'Server: 26 Einträge (25 + gelöschter Vermerk)');

  // Abmelden
  if (await A.isVisible('dialog[open]')) { await A.click('dialog .icon-btn[aria-label=Schließen]'); await A.waitForTimeout(300); }
  await A.click('#btnCollections');
  await A.click('dialog >> text=Abmelden'); await A.click('text=Ja, abmelden');
  await A.waitForSelector('.auth');
  assert(true, 'Abmelden zeigt wieder die Anmeldung');

  assert(A.errs.length === 0 && B.errs.length === 0, 'Keine Skriptfehler ' + A.errs.concat(B.errs).join('; '));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
