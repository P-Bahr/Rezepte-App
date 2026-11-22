// Import im Browser mit nachgebautem Server: node --experimental-strip-types tests/import-e2e.test.js
// Das echte Server-Programm (supabase/functions/import/index.ts) wertet gespeicherte Testseiten aus.
const { chromium, devices } = require('playwright');
const URL = process.env.APP_URL || 'http://127.0.0.1:8123/';
const assert = (c, m) => { if (!c) throw new Error('FEHLER: ' + m); console.log('ok  ', m); };

const PAGES = {
  'https://www.chefkoch.de/rezepte/1/kaesespaetzle.html': `<html><head><meta property="og:image" content="https://img.example/k.jpg"><script type="application/ld+json">{"@type":"Recipe","name":"Allgäuer Käsespätzle","recipeYield":"4 Portionen","recipeIngredient":["500 g Mehl","5 Eier","1 TL Salz","300 g Bergkäse, gerieben","3 Zwiebeln"],"recipeInstructions":"Teig verrühren.\\nIn kochendes Salzwasser schaben.\\nMit Käse schichten.","recipeCategory":"Hauptspeise"}</script></head><body></body></html>`,
  'https://blog.example/ohne-rezept': '<html><head><title>Über mich</title></head><body><p>Hallo!</p></body></html>',
  'https://www.lecker.example/linsensuppe': `<html><head><script type="application/ld+json">{"@type":"Recipe","name":"Rote Linsensuppe","recipeIngredient":["250 g rote Linsen","1 Zwiebel","1 l Gemüsebrühe"],"recipeInstructions":"Zwiebel andünsten.\\nLinsen und Brühe dazugeben, 15 Minuten kochen."}</script></head><body></body></html>`
};
// Nachgebaute Antwort der Pinterest-Widget-Schnittstelle (Pinnwand mit 4 Pins, insgesamt 120)
const BOARD = JSON.stringify({ status: 'success', data: { board: { name: 'Rezepte', pin_count: 120 }, pins: [
  { id: '1', link: 'https://www.chefkoch.de/rezepte/1/kaesespaetzle.html?utm_source=Pinterest', description: 'Käsespätzle' },
  { id: '2', link: 'https://www.lecker.example/linsensuppe', description: 'Linsensuppe', images: { '564x': { url: 'https://i.pinimg.example/2.jpg' } } },
  { id: '3', link: null, description: 'Bananenbrot Zutaten: 3 Bananen, 250 g Mehl, 2 Eier Zubereitung: Alles verrühren und 50 Minuten backen.' },
  { id: '4', link: 'https://blog.example/ohne-rezept', description: 'Schöne Deko-Idee' }
] } });
const TIKTOK = { 'https://www.tiktok.com/@koch/video/1': 'One-Pot-Pasta!\nZutaten:\n250g Spaghetti\n200 g Tomaten\nZubereitung:\n1. Alles aufkochen.\n2. 10 Minuten köcheln.', 'https://www.tiktok.com/@koch/video/2': 'Heute was leckeres gemacht 😍 250g nudeln 1 dose Tomaten 1TI salz alles in topf und 15min kochen #onepot #lecker' };
// Nachgebaute KI: 'off' = nicht erreichbar, 'on' = liest den Text, 'key' = Schlüssel abgelaufen
let aiMode = 'off';
const aiCalls = [];
const AI_ANSWER = { isRecipe: true, title: 'One-Pot-Nudeln', servings: null, servingsUnit: null, ingredients: ['250 g Nudeln', '1 Dose Tomaten', '1 TL Salz', '100 g Parmesan'], steps: ['Alles in einen Topf geben und 15 Minuten kochen.'], notes: [] };

(async () => {
  const fn = await import('../supabase/functions/import/index.ts');
  const calls = [];
  const linkState = {}; // url -> 'ok' | 'gone' | 'unknown' (Standard: ok)
  async function serve(body) {
    if (body.pinterestBoard) {
      const r = await fn.pinterestBoard(body.pinterestBoard.user, body.pinterestBoard.board, async u => ({ status: 200, url: u, text: /\/boards\/oopusteblumeoo\/rezepte\/pins\/$/.test(u) ? BOARD : '{"status":"failure"}' }));
      return { status: r.error ? 404 : 200, body: r };
    }
    if (Array.isArray(body.check)) {
      const results = {};
      body.check.forEach(u => { results[u] = linkState[u] || 'ok'; });
      return { status: 200, body: { results } };
    }
    if (body.ai) {
      aiCalls.push(body.ai.text);
      if (aiMode === 'on') return { status: 200, body: { ai: /nudeln/i.test(body.ai.text) ? AI_ANSWER : { isRecipe: false, title: '', servings: null, servingsUnit: null, ingredients: [], steps: [], notes: [] } } };
      return { status: 502, body: { error: 'KI nicht erreichbar.', problem: aiMode === 'key' ? 'key' : undefined } };
    }
    calls.push(body.url);
    const c = fn.checkUrl(body.url);
    if (c.error) return { status: 400, body: { error: c.error } };
    if (/tiktok\.com$/.test(c.host)) return TIKTOK[c.url] ? { status: 200, body: { kind: 'tiktok', url: c.url, title: TIKTOK[c.url], author: 'koch', image: '', jsonld: [], text: TIKTOK[c.url] } } : { status: 502, body: { error: 'Die TikTok-Beschreibung konnte nicht geladen werden. Ist das Video öffentlich?' } };
    if (!PAGES[c.url]) return { status: 502, body: { error: 'Die Seite antwortet mit Fehler 404.' } };
    return { status: 200, body: { kind: 'page', status: 200, ...fn.extract(PAGES[c.url], c.url) } };
  }
  const FAKE = `window.supabase = { createClient() {
    const session = { user: { id: 'u1', email: 'a@b.de' } };
    return {
      auth: { getSession: async () => ({ data: { session } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }, signOut: async () => ({}) },
      from() { return { select() { return { range: async () => ({ data: [], error: null }) }; }, upsert: async () => ({ error: null }) }; },
      storage: { from() { return { upload: async () => ({ error: null }), download: async () => ({ data: null, error: {} }) }; } },
      functions: { invoke: async (name, opts) => {
        const r = JSON.parse(await window.__fn(JSON.stringify(opts.body)));
        if (r.status >= 400) return { data: null, error: { context: { status: r.status, json: async () => r.body } } };
        return { data: r.body, error: null };
      } }
    };
  } };`;
  const b = await chromium.launch();
  const ctx = await b.newContext(devices['iPhone 13']);
  await ctx.exposeFunction('__fn', async body => JSON.stringify(await serve(JSON.parse(body))));
  await ctx.route('**/js/vendor/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  // sync.js absichtlich verzögern: so wie bei langsamem Netz auf dem Handy
  await ctx.route('**/js/sync.js', async r => { await new Promise(res => setTimeout(res, 400)); r.continue(); });
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG={supabaseUrl:'https://t.example',supabaseKey:'k'};" }));
  // Pinterest-Pinnwand direkt vom Gerät (nachgebaut); unbekannte Pinnwand -> Fehler wie bei Pinterest
  const directBoard = [];
  await ctx.route('https://widgets.pinterest.com/**', r => {
    directBoard.push(r.request().url());
    const ok = /\/boards\/oopusteblumeoo\/rezepte\/pins\/$/.test(r.request().url());
    r.fulfill({ status: ok ? 200 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: ok ? BOARD : '{"status":"failure","message":"not found"}' });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  global.__nullWatch = [];
  const origClick = p.click.bind(p);
  p.click = async (...a) => { const r = await origClick(...a); await p.waitForTimeout(30); try { const t = await p.evaluate(() => (document.body.innerText.match(/(^|\s)null(\s|$)/m) || [null])[0] ? document.body.innerText.slice(Math.max(0, document.body.innerText.search(/(^|\s)null(\s|$)/m) - 40), document.body.innerText.search(/(^|\s)null(\s|$)/m) + 10) : ''); if (t) global.__nullWatch.push(String(a[0]) + ': ' + t.replace(/\s+/g, ' ')); } catch (e) { /* Seite wechselt */ } return r; };
  await p.goto(URL);
  await p.click('button:has-text("Beispielrezepte laden")'); await p.waitForTimeout(300);

  // 1. Rezeptseite
  await p.click('#btnImport');
  await p.fill('#importUrl', 'Schau mal: https://www.chefkoch.de/rezepte/1/kaesespaetzle.html, lecker!');
  await p.click('dialog button[type=submit]');
  await p.waitForSelector('#importNotice');
  assert(await p.isVisible('#importNotice:has-text("Importiert von chefkoch.de")'), 'Link aus Text herausgelöst, Rezept geladen, Hinweis „Importiert von chefkoch.de“');
  assert(await p.inputValue('#fTitle') === 'Allgäuer Käsespätzle' && (await p.inputValue('#fIngredients')).split('\n').length === 5, 'Formular ausgefüllt: Name und 5 Zutaten');
  assert(await p.inputValue('#fCourse') === 'Hauptgericht' && await p.inputValue('#fMethod') === 'Kochen' && await p.inputValue('#fMain') === 'Spätzle', 'Kategorien vorausgefüllt');
  assert(await p.inputValue('#fSource') === 'https://www.chefkoch.de/rezepte/1/kaesespaetzle.html' && await p.inputValue('#fImage') === 'https://img.example/k.jpg', 'Quelle und Bild übernommen');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(400);
  assert(await p.isVisible('dialog h2:has-text("Allgäuer Käsespätzle")'), 'Gespeichert und geöffnet');
  assert(!(await p.textContent('.dlg-foot')).includes('null'), 'Leiste unten ohne „null“');
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('#dlgBody').scrollWidth <= window.innerWidth), 'Rezept mit langem Quellen-Link passt aufs Handy (nicht breiter als der Bildschirm)');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);

  // 2. Gleicher Link noch einmal -> schon vorhanden, ohne Laden
  const before = calls.length;
  await p.click('#btnImport'); await p.fill('#importUrl', 'https://www.chefkoch.de/rezepte/1/kaesespaetzle.html');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(200);
  assert(await p.isVisible('.form-error:has-text("Dieses Rezept hast du schon")') && calls.length === before, 'Schon vorhanden: Hinweis, nichts geladen');
  await p.click('.form-error >> text=Öffnen'); await p.waitForTimeout(300);
  assert(await p.isVisible('dialog h2:has-text("Allgäuer Käsespätzle")'), '„Öffnen“ zeigt das vorhandene Rezept');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);

  // 3. TikTok-Beschreibung
  await p.click('#btnImport'); await p.fill('#importUrl', 'https://www.tiktok.com/@koch/video/1');
  await p.click('dialog button[type=submit]'); await p.waitForSelector('#importNotice');
  assert(await p.inputValue('#fTitle') === 'One-Pot-Pasta' && await p.inputValue('#fIngredients') === '250 g Spaghetti\n200 g Tomaten' && await p.inputValue('#fSteps') === 'Alles aufkochen.\n10 Minuten köcheln.', 'TikTok: Titel, Zutaten, Schritte übernommen');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);

  // 4. Seite ohne Rezept -> Meldung + selbst eintragen
  await p.click('#btnImport'); await p.fill('#importUrl', 'https://blog.example/ohne-rezept');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(300);
  assert(await p.isVisible('.form-error:has-text("kein Rezept gefunden")'), 'Ohne Rezept: verständliche Meldung');
  await p.click('dialog >> text=Selbst eintragen'); await p.waitForTimeout(200);
  assert(await p.inputValue('#fSource') === 'https://blog.example/ohne-rezept' && await p.inputValue('#fTitle') === 'Über mich', 'Selbst eintragen: Quelle schon ausgefüllt');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);

  // 5. Fehler vom Server und ungültiger Link
  await p.click('#btnImport'); await p.fill('#importUrl', 'https://gibt-es-nicht.example/x');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(300);
  assert(await p.isVisible('.form-error:has-text("Fehler 404")'), 'Server-Fehler wird angezeigt');
  await p.fill('#importUrl', 'kein link'); await p.click('dialog button[type=submit]');
  assert(await p.isVisible('.form-error:has-text("mit https:// beginnt")'), 'Ungültiger Link wird gemeldet');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);

  // 6. Link beim Öffnen übergeben (Teilen-Menü)
  await p.goto(URL + '?url=' + encodeURIComponent('https://www.tiktok.com/@koch/video/1'));
  await p.waitForSelector('#importNotice', { timeout: 5000 });
  assert(await p.inputValue('#fTitle') === 'One-Pot-Pasta' && !p.url().includes('?url='), 'Übergebener Link wird sofort importiert, Adresse aufgeräumt');

  // 6b. Bildschirmfotos (Texterkennung auf dem Gerät)
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);
  const pickShots = (kind, target) => p.evaluate(async ([kind, target]) => {
    const cv = document.createElement('canvas'); cv.width = 1170; cv.height = 2532;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1170, 2532); g.addColorStop(0, '#b5651d'); g.addColorStop(0.5, '#3a6b35'); g.addColorStop(1, '#d9a441');
    x.fillStyle = g; x.fillRect(0, 0, 1170, 2532);
    for (let i = 0; i < 40; i++) { x.fillStyle = `hsl(${i * 37},60%,${30 + (i % 5) * 10}%)`; x.beginPath(); x.arc((i * 211) % 1170, (i * 397) % 2532, 60 + (i % 4) * 30, 0, 7); x.fill(); }
    const lines = kind === 'rezept' ? ['Fluffige Pancakes', '200g Mehl', '2 Eier', '250 ml Milch', '1 EL Zucker', '1 TL Backpulver'] : ['Wochenende am See', 'so schön heute'];
    x.font = 'bold 64px Helvetica, Arial'; x.lineJoin = 'round';
    lines.forEach((l, i) => { const y = 500 + i * 95; x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeText(l, 90, y); x.fillStyle = '#fff'; x.fillText(l, 90, y); });
    x.font = '44px Helvetica, Arial'; x.fillStyle = '#fff'; x.fillText('@kochmitlea', 60, 2250); x.fillText('12,3K   ♥   Folgen', 60, 2330);
    return await new Promise(r => cv.toBlob(b => r(new File([b], kind + '.png', { type: 'image/png' })), 'image/png'));
  }, [kind, target]).then(() => null);
  // Bild(er) zeichnen und in das Dateifeld legen
  const pickShotsInto = (kinds, target) => p.evaluate(async ([kinds, target]) => {
    const files = [];
    for (const kind of kinds) {
      const cv = document.createElement('canvas'); cv.width = 1170; cv.height = 2532;
      const x = cv.getContext('2d');
      const g = x.createLinearGradient(0, 0, 1170, 2532); g.addColorStop(0, '#b5651d'); g.addColorStop(0.5, '#3a6b35'); g.addColorStop(1, '#d9a441');
      x.fillStyle = g; x.fillRect(0, 0, 1170, 2532);
      for (let i = 0; i < 40; i++) { x.fillStyle = `hsl(${i * 37},60%,${30 + (i % 5) * 10}%)`; x.beginPath(); x.arc((i * 211) % 1170, (i * 397) % 2532, 60 + (i % 4) * 30, 0, 7); x.fill(); }
      const lines = kind === 'rezept' ? ['Fluffige Pancakes', '200g Mehl', '2 Eier', '250 ml Milch', '1 EL Zucker', '1 TL Backpulver'] : ['Wochenende am See', 'so schön heute'];
      x.font = 'bold 64px Helvetica, Arial'; x.lineJoin = 'round';
      lines.forEach((l, i) => { const y = 500 + i * 95; x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeText(l, 90, y); x.fillStyle = '#fff'; x.fillText(l, 90, y); });
      x.font = '44px Helvetica, Arial'; x.fillStyle = '#fff'; x.fillText('@kochmitlea', 60, 2250); x.fillText('12,3K   ♥   Folgen', 60, 2330);
      files.push(await new Promise(r => cv.toBlob(b => r(new File([b], kind + '.png', { type: 'image/png' })), 'image/png')));
    }
    const input = document.getElementById(target);
    const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [kinds, target]);
  await p.click('#btnImport');
  assert(!(await p.isVisible('#importPaste')) && await p.isVisible('#tilePhotos') && await p.isVisible('#tileBoard') && await p.isVisible('#tileApp') && await p.isVisible('#tileShare') && await p.isVisible('#tileManual'), 'Import-Start: ein Feld mit „Einfügen“, darunter Kacheln für die anderen Wege');
  await p.click('#tilePhotos');
  assert(await p.isVisible('label:has-text("Fotos für ein Rezept auswählen")') && await p.isVisible('label:has-text("je Rezept eins")') && await p.isVisible('#importBack'), 'Bildschirmfotos: „Ein Rezept“ und „Viele Rezepte“, mit „Zurück“');
  await p.click('#importBack');
  assert(await p.isVisible('#tilePhotos') && (await p.textContent('#dlgTitle')) === 'Rezept hinzufügen', '„Zurück“ führt zur Startseite');
  await p.click('#tilePhotos');
  await pickShotsInto(['rezept'], 'importPhotos');
  await p.waitForSelector('#importNotice', { timeout: 60000 });
  assert(await p.isVisible('#importNotice:has-text("Aus Bildschirmfoto erkannt")'), 'Foto: Hinweis „Aus Bildschirmfoto erkannt“ mit Bitte um Prüfung');
  assert(await p.inputValue('#fTitle') === 'Fluffige Pancakes', 'Foto: Name erkannt (' + await p.inputValue('#fTitle') + ')');
  const shotIng = await p.inputValue('#fIngredients');
  assert(shotIng === '200 g Mehl\n2 Eier\n250 ml Milch\n1 EL Zucker\n1 TL Backpulver', 'Foto: alle Zutaten erkannt, TikTok-Oberfläche ignoriert (' + shotIng.replace(/\n/g, ' | ') + ')');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);
  await p.click('#btnImport'); await p.click('#tilePhotos');
  await pickShotsInto(['kein'], 'importPhotos');
  await p.waitForSelector('.form-error:has-text("kein Rezept erkannt")', { timeout: 60000 });
  assert(await p.isVisible('dialog >> text=Selbst eintragen'), 'Foto ohne Rezept: verständliche Meldung und „Selbst eintragen“');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);

  // Viele Bildschirmfotos: jedes Foto ein eigenes Rezept
  await p.click('#btnImport'); await p.click('#tilePhotos');
  await pickShotsInto(['rezept', 'kein'], 'importPhotosMany');
  await p.waitForSelector('#boardGo');
  assert((await p.textContent('.dlg-scroll')).includes('2 Bildschirmfotos ausgewählt'), 'Viele Fotos: Übersicht vor dem Import');
  await p.click('#boardGo');
  await p.waitForSelector('#boardResult b', { timeout: 120000 });
  assert((await p.textContent('#boardResult')).includes('1 importiert, 0 schon vorhanden, 1 nicht geklappt') && await p.isVisible('.board-failed li:has-text("Wochenende am See")'), 'Viele Fotos: Rezept-Foto gespeichert, Urlaubsfoto bei „Nicht geklappt“');
  const shotR = await p.evaluate(() => { const r = Store.recipes().find(x => (x.importBatch || '').startsWith('foto-')); return r && { t: r.title, n: r.ingredients.length, rev: r.review, h: window.RecipeImporter.reviewHints(r) }; });
  assert(shotR && shotR.t === 'Fluffige Pancakes' && shotR.n === 5 && shotR.rev && shotR.h.some(x => /Bildschirmfoto/.test(x)), 'Viele Fotos: „Zu prüfen“ mit Hinweis „Vom Bildschirmfoto gelesen“: ' + JSON.stringify(shotR));
  await p.click('#boardUndo'); await p.click('#boardUndoYes');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);

  // Einsetzen ins Feld startet den Import von selbst
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin });
  await p.evaluate(() => navigator.clipboard.writeText('Pudding\nZutaten:\n500 ml Milch\n1 Pck. Puddingpulver\nZubereitung:\nAufkochen und rühren.'));
  await p.click('#btnImport'); await p.focus('#importUrl'); await p.keyboard.press('Control+V');
  await p.waitForSelector('#fTitle');
  assert(await p.inputValue('#fTitle') === 'Pudding' && (await p.inputValue('#fIngredients')).includes('500 ml Milch'), 'Einsetzen ins Feld startet den Import von selbst');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);

  // Rezept aus Schritt 6 erneut öffnen, damit es für Schritt 7 gespeichert werden kann
  await p.goto(URL + '?url=' + encodeURIComponent('https://www.tiktok.com/@koch/video/1'));
  await p.waitForSelector('#importNotice', { timeout: 5000 });

  // 7. Tote Links: TikTok-Video verschwindet
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(400);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  const tt = 'https://www.tiktok.com/@koch/video/1';
  const runCheck = () => p.evaluate(() => window.RecipeLinkCheck.run({ force: true }));
  let r1 = await runCheck();
  assert(r1.checked === 2 && r1.removed.length === 0, 'Prüfung: 2 Links geprüft, alle da');
  linkState[tt] = 'gone';
  r1 = await runCheck();
  assert(r1.removed.length === 0 && await p.evaluate(u => Store.recipes().some(r => r.sourceUrl === u), tt), 'Erstes Mal weg: Link bleibt noch');
  // 7 Stunden vergehen lassen
  await p.evaluate(u => { const s = JSON.parse(localStorage.getItem('rezepte.linkpruefung')); s.urls[u].firstFail -= 7 * 36e5; localStorage.setItem('rezepte.linkpruefung', JSON.stringify(s)); }, tt);
  r1 = await runCheck();
  assert(r1.removed.join() === 'One-Pot-Pasta', 'Zweites Mal weg (Stunden später): Link entfernt');
  const rec = await p.evaluate(() => Store.recipes().find(r => r.title === 'One-Pot-Pasta'));
  assert(rec && rec.sourceUrl === '' && rec.deadSourceUrl === tt && rec.ingredients.length === 2, 'Rezept bleibt erhalten, nur der Link ist weg');
  await p.fill('#q', 'one-pot'); await p.click('.tile'); await p.waitForTimeout(300);
  assert(await p.isVisible('dialog .gone-source:has-text("TikTok-Video nicht mehr verfügbar")') && await p.locator('dialog .source a, dialog .source-link').count() === 0, 'Im Rezept: „TikTok-Video nicht mehr verfügbar“ statt Link');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200); await p.fill('#q', '');
  // Gesperrte Seite wird nie entfernt
  linkState['https://www.chefkoch.de/rezepte/1/kaesespaetzle.html'] = 'unknown';
  await runCheck(); await runCheck();
  assert(await p.evaluate(() => Store.recipes().some(r => r.sourceUrl === 'https://www.chefkoch.de/rezepte/1/kaesespaetzle.html')), 'Gesperrte/unklare Seite: Link bleibt');
  // Automatisch höchstens einmal am Tag
  assert((await p.evaluate(() => window.RecipeLinkCheck.run())).skipped === 'heute schon', 'Automatische Prüfung höchstens 1x täglich');
  // Anzeige unter Sammlungen
  await p.click('#btnCollections');
  await p.click('#btnCheckLinks'); await p.waitForSelector('.examples:has-text("Links geprüft")');
  assert(await p.isVisible('.examples:has-text("Links geprüft")'), 'Unter Einstellungen: „Jetzt prüfen“ mit Ergebnis');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);

  // Text einfügen (z. B. aus WhatsApp)
  await p.click('#btnImport');
  await p.fill('#importUrl', 'Omas Linsensuppe 😋\nZutaten:\n250 g Linsen\n2 Karotten\n1 Zwiebel\nZubereitung:\nZuerst schneiden wir die Zwiebel klein.\nDann kochen wir alles 30 Minuten.\nhttps://www.whatsapp-test.example/x');
  await p.click('#importGo');
  await p.waitForSelector('#fTitle');
  assert(await p.inputValue('#fTitle') === 'Omas Linsensuppe' && (await p.inputValue('#fIngredients')).split('\n').length === 3, 'Text einfügen: Name und 3 Zutaten');
  assert(await p.inputValue('#fSteps') === 'Zwiebel klein schneiden.\nAlles 30 Minuten kochen.' && await p.inputValue('#fSource') === 'https://www.whatsapp-test.example/x', 'Text einfügen: Schritte gekürzt, Link als Quelle');
  assert(await p.isVisible('#importNotice:has-text("Aus Text erkannt")'), 'Text einfügen: Hinweis „Aus Text erkannt“');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.click('#btnImport'); await p.fill('#importUrl', 'Hallo, wie geht es dir? Wir sehen uns morgen beim Essen.'); await p.click('#importGo');
  assert(await p.isVisible('.form-error:has-text("kein Rezept erkannt")'), 'Text ohne Rezept: verständliche Meldung');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);

  // Recipe Keeper: nachgebaute Export-Datei (zip mit recipes.html und Foto)
  {
    const JSZip = require('../js/vendor/jszip.min.js');
    const rk = (id, name, course, cat, y, fav, ing, dir, src) => `<div class="recipe-details"><meta content="${id}" itemprop="recipeId"><meta content="${fav}" itemprop="recipeIsFavourite"><table><tr><td><img src="images/${id}_0.jpg" class="recipe-photo"/></td><td><h2 itemprop="name">${name}</h2><div>Rezeptarten: <span itemprop="recipeCourse">${course}</span></div><div>Kategorien: <span>${cat}</span><meta content="${cat}" itemprop="recipeCategory"></div><div>Quelle: <span itemprop="recipeSource">${src}</span></div><div>Portionsgr&#246;&#223;e: <span itemprop="recipeYield">${y}</span></div></td></tr><tr><td><div class="recipe-ingredients" itemprop="recipeIngredients">${ing.map(x => '<p>' + x + '</p>').join('')}</div></td><td><div itemprop="recipeDirections">${dir.map(x => '<p>' + x + '</p><p></p>').join('')}</div></td></tr></table><div class="recipe-notes" itemprop="recipeNotes"><p>Schmeckt auch kalt.</p></div><div class="recipe-photos-div"><img src="images/${id}_0.jpg" class="recipe-photos" itemprop=photo0 /></div><hr /></div>`;
    const html = '<!DOCTYPE html><html><body>'
      + rk('a1', '15 Minuten Schlemmer One Pot', 'Hauptgericht', 'Eintopf', '2 bis 4 Portionen', 'True', ['1kg Kartoffeln', '3-4 M&#246;hren', '1L Gem&#252;sebr&#252;he'], ['1. Zuerst schneiden wir die Kartoffeln klein.', '2. Alles 12 Minuten kochen.'], '<a href="https://vm.tiktok.com/ZGdxEbAA6/">https://vm.tiktok.com/ZGdxEbAA6/</a>')
      + rk('a2', 'Schokoladenkekse', 'Backen', 'Pl&#228;tzchen', '12 Kekse', 'False', ['200 g Mehl', '100 g Schokolade'], ['Teig kneten und 12 Minuten backen.'], 'Recipe Keeper')
      + '</body></html>';
    const zip = new JSZip();
    zip.file('recipes.html', html);
    zip.file('images/a1_0.jpg', require('fs').readFileSync('icons/icon-192.png'));
    const zpath = require('os').tmpdir() + '/rk-test-' + process.pid + '.zip';
    require('fs').writeFileSync(zpath, await zip.generateAsync({ type: 'nodebuffer' }));
    await p.click('#btnImport'); await p.click('#tileApp');
    await p.setInputFiles('#importApp', zpath);
    await p.waitForSelector('#boardGo');
    assert((await p.textContent('.dlg-scroll')).includes('2 Rezepte gefunden, mit Fotos'), 'Recipe Keeper: Datei gelesen, 2 Rezepte mit Fotos');
    await p.click('#boardGo');
    await p.waitForSelector('#boardResult b', { timeout: 15000 });
    assert((await p.textContent('#boardResult')).includes('2 importiert'), 'Recipe Keeper: beide importiert');
    const rkr = await p.evaluate(() => Store.recipes().filter(r => (r.importBatch || '').startsWith('rk-')).map(r => ({ t: r.title, c: r.course, m: r.method, s: r.servings + ' ' + r.servingsUnit, f: r.favorite, img: !!r.imageId, st: r.steps, src: r.sourceUrl, n: r.notes, rev: r.review })).sort((a, b) => a.t.localeCompare(b.t)));
    const [pot, kekse] = rkr;
    assert(pot.t === 'Schlemmer One Pot' && pot.c === 'Hauptgericht' && pot.s === '2 Personen' && pot.f && pot.img && pot.rev, 'Recipe Keeper: Name ohne „15 Minuten“, Rezeptart, „2 bis 4 Portionen“ = 2 Personen, Favorit, Foto, „Zu prüfen“: ' + JSON.stringify(pot));
    assert(JSON.stringify(pot.st) === JSON.stringify(['Kartoffeln klein schneiden.', 'Alles 12 Minuten kochen.']) && pot.src === 'https://vm.tiktok.com/ZGdxEbAA6/' && pot.n === 'Schmeckt auch kalt.', 'Recipe Keeper: Schritte ohne Nummern und gekürzt, Quelle, Notizen');
    assert(kekse.c === 'Gebäck' && kekse.m === 'Backen' && kekse.s === '12 Stück' && !kekse.src && !kekse.f, 'Recipe Keeper: „Backen“ als Zubereitung, Kekse sind Gebäck, 12 Stück, „Recipe Keeper“ ist keine Quelle: ' + JSON.stringify(kekse));
    await p.click('#boardUndo'); await p.click('#boardUndoYes');
    assert(await p.evaluate(() => !Store.recipes().some(r => (r.importBatch || '').startsWith('rk-'))), 'Recipe Keeper: Import rückgängig');
    await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
    require('fs').unlinkSync(zpath);
  }

  // Pinterest-Pinnwand
  await p.click('#btnImport'); await p.click('#tileBoard');
  await p.fill('#pinUser', '@oopusteblumeoo'); await p.fill('#pinBoard', 'Gibt es nicht'); await p.click('#pinLoad');
  await p.waitForSelector('.form-error:has-text("Pinnwand nicht gefunden")');
  assert(true, 'Pinnwand falsch geschrieben: verständliche Meldung');
  await p.fill('#pinBoard', 'Rezepte'); await p.click('#pinLoad');
  await p.waitForSelector('#boardGo');
  assert((await p.textContent('.dlg-scroll')).includes('4 von 120 Pins'), 'Pinnwand gefunden: „4 von 120 Pins“');
  assert(directBoard.some(u => u.endsWith('/boards/oopusteblumeoo/rezepte/pins/')), 'Pinnwand direkt vom Gerät abgerufen');
  const recipesBefore = await p.evaluate(() => Store.recipes().length);
  await p.click('#boardGo');
  await p.waitForSelector('#boardResult b', { timeout: 15000 });
  assert((await p.textContent('#boardResult')).includes('2 importiert, 1 schon vorhanden, 1 nicht geklappt'), 'Ergebnis: 2 importiert, 1 doppelt, 1 nicht geklappt (' + (await p.textContent('#boardResult')).slice(0, 80) + ')');
  const imported = await p.evaluate(() => Store.recipes().filter(r => r.review).map(r => r.title + '|' + r.sourceUrl + '|' + r.imageUrl).sort());
  assert(imported.length === 2 && imported[0].startsWith('Bananenbrot|https://www.pinterest.com/pin/3/') && imported[1] === 'Rote Linsensuppe|https://www.lecker.example/linsensuppe|https://i.pinimg.example/2.jpg', 'Gespeichert mit „Zu prüfen“, Quelle und Bild: ' + imported.join(' ; '));
  assert(await p.isVisible('.board-failed a:has-text("Schöne Deko-Idee")'), 'Liste „Nicht geklappt“ mit Link zum Pin');
  assert(!(await p.textContent('#boardResult')).includes('null'), 'Ergebnis ohne „null“');
  assert(await p.evaluate(() => localStorage.getItem('rezepte.pinterestName')) === 'oopusteblumeoo', 'Pinterest-Name wird gemerkt');
  await p.click('#boardShowReview');
  await p.waitForSelector('#chipReview[aria-pressed=true]');
  assert((await p.$$eval('.tile-title', e => e.map(x => x.textContent).sort())).join(',') === 'Bananenbrot,Rote Linsensuppe', 'Filter „Zu prüfen“ zeigt nur die neuen Rezepte');
  await p.click('.tile:has-text("Rote Linsensuppe")');
  await p.waitForSelector('#btnReviewed');
  assert(await p.isVisible('#reviewNotice .review-hints li, #reviewNotice:has-text("Sieht vollständig aus")'), 'Im Rezept steht, was genau zu prüfen ist (oder „Sieht vollständig aus“)');
  assert(await p.evaluate(() => { const b = document.getElementById('btnReviewed'); const r = b.getBoundingClientRect(); return !!b.closest('.dlg-foot') && r.right <= window.innerWidth && r.bottom <= window.innerHeight; }), '„Passt ✓“ steht fest unten in der Leiste und ist ganz sichtbar');
  await p.click('#btnReviewed');
  await p.waitForSelector('dialog h2:has-text("Bananenbrot")');
  assert(await p.evaluate(() => !Store.recipes().find(r => r.title === 'Rote Linsensuppe').review) && await p.isVisible('#reviewNotice'), '„Passt“ entfernt die Markierung und öffnet direkt das nächste ungeprüfte Rezept');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(300);
  assert(!(await p.isVisible('dialog[open]')), 'Schließen führt zurück zur Übersicht (kein Rezept dazwischen)');
  assert((await p.textContent('#chipReview .n')) === '1', 'Chip „Zu prüfen“ zählt nur noch 1');
  await p.click('.tile:has-text("Bananenbrot")'); await p.click('#btnReviewed'); await p.waitForTimeout(300);
  assert(!(await p.isVisible('dialog[open]')) && await p.isVisible('#toast:has-text("Alles geprüft")'), 'Letztes geprüft: Fenster schließt, „Alles geprüft“');
  // Import rückgängig (neuer Import derselben Pinnwand: jetzt alles doppelt -> Undo-Test über erneuten Import nicht möglich, daher direkt)
  const batch = await p.evaluate(() => Store.recipes().find(r => r.sourceUrl === 'https://www.lecker.example/linsensuppe').importBatch);
  const undone = await p.evaluate(b => Store.deleteBatch(b), batch); const nowN = await p.evaluate(() => Store.recipes().length);
  assert(undone === 2 && nowN === recipesBefore, 'Import rückgängig löscht genau die Rezepte dieses Imports (' + undone + ')');
  await p.waitForTimeout(200);
  assert(!(await p.isVisible('#chipReview')) || await p.evaluate(() => document.getElementById('chipReview').getAttribute('aria-pressed') === 'true'), 'Chip verschwindet, wenn nichts mehr zu prüfen ist');
  await p.click('#btnReset').catch(() => {});

  // KI liest den Beitragstext (wie Recipe Keeper); Erfundenes wird zum Prüfen markiert
  aiMode = 'on';
  await p.click('#btnImport'); await p.fill('#importUrl', 'https://www.tiktok.com/@koch/video/2');
  await p.click('dialog button[type=submit]'); await p.waitForSelector('#importNotice');
  assert(aiCalls.some(t => /250g nudeln/.test(t)), 'TikTok-Text geht an die KI');
  assert(await p.inputValue('#fTitle') === 'One-Pot-Nudeln' && await p.inputValue('#fIngredients') === '250 g Nudeln\n1 Dose Tomaten\n1 TL Salz\n100 g Parmesan' && await p.inputValue('#fSteps') === 'Alles in einen Topf geben und 15 Minuten kochen.', 'KI: Name, Zutaten, Schritte übernommen');
  assert(await p.inputValue('#fMethod') === 'Kochen', 'Danach die eigenen Regeln: One Pot = Kochen');
  assert(await p.isVisible('#importNotice li:has-text("Steht so nicht im Originaltext") >> text=/Parmesan/'), 'Zutat, die nicht im Text steht: Prüf-Hinweis');
  assert(!(await p.isVisible('#importNotice li:has-text("Nudeln,")')), 'Zutaten aus dem Text werden nicht angemeckert');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);
  // KI sagt „kein Rezept“: es bleibt bei den Regeln
  await p.click('#btnImport'); await p.fill('#importUrl', 'https://www.tiktok.com/@koch/video/1');
  await p.click('dialog button[type=submit]'); await p.waitForSelector('#importNotice');
  assert(await p.inputValue('#fTitle') === 'One-Pot-Pasta', 'KI findet nichts: Regeln lesen wie bisher');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);
  // Schlüssel abgelaufen: Regeln lesen, Hinweis in den Einstellungen
  aiMode = 'key';
  await p.click('#btnImport'); await p.fill('#importUrl', 'Nudelauflauf\nZutaten:\n250 g Nudeln\n200 g Käse\nZubereitung:\nAlles in eine Form und 20 Minuten backen.');
  await p.click('dialog button[type=submit]'); await p.waitForSelector('#importNotice');
  assert(await p.inputValue('#fTitle') === 'Nudelauflauf' && await p.inputValue('#fIngredients') === '250 g Nudeln\n200 g Käse', 'KI geht nicht: Text wird trotzdem mit den Regeln gelesen');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);
  await p.click('#btnCollections');
  assert(await p.isVisible('#aiProblem:has-text("KI-Schlüssel ist abgelaufen")'), 'Einstellungen: Hinweis „KI-Schlüssel abgelaufen“');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  aiMode = 'on';
  await p.click('#btnImport'); await p.fill('#importUrl', 'https://www.tiktok.com/@koch/video/2');
  await p.click('dialog button[type=submit]'); await p.waitForSelector('#importNotice');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(200);
  await p.click('#btnCollections');
  assert(!(await p.isVisible('#aiProblem')), 'Geht die KI wieder: Hinweis verschwindet');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  aiMode = 'off';

  // Kopfzeile auf dem Handy: keine seitliche Verschiebung
  assert(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'Kopfzeile passt aufs Handy');
  if (!global.__nullWatch) global.__nullWatch = [];
  assert(global.__nullWatch.length === 0, 'Nirgends „null“ auf dem Bildschirm ' + global.__nullWatch.join(' | '));
  assert(errs.length === 0, 'Keine Skriptfehler ' + errs.join('; '));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
