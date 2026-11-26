const { chromium, devices } = require('playwright');
const assert = (c, m) => { if (!c) throw new Error('FEHLER: ' + m); console.log('ok  ', m); };
const URL = process.env.APP_URL || 'http://127.0.0.1:8123/';
const OUT = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1024, height: 1366 } });
  // ---------- Neue Version: Hinweis zum Antippen ----------
  {
    const uc = await b.newContext({ viewport: { width: 1024, height: 900 } });
    await uc.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG = { supabaseUrl: '', supabaseKey: '' };" }));
    const up = await uc.newPage();
    let loads = 0; up.on('load', () => loads++);
    await up.goto(URL); await up.waitForTimeout(1200);
    assert(!(await up.isVisible('#updateBanner')) && loads === 1, 'Gleiche Version: kein Hinweis');
    await up.click('#btnCollections');
    await up.click('#btnCheckUpdate');
    await up.waitForSelector('.examples:has-text("neueste Version")');
    assert(true, '„Nach neuer Version suchen“: neueste Version');
    await uc.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: '{"version":"2099-01-01T00:00:00"}' }));
    await up.click('#btnCheckUpdate'); await up.waitForTimeout(300);
    assert(await up.isVisible('#updateBanner:has-text("Neue Version verfügbar") >> text=Jetzt laden') && loads === 1, 'Neue Version: Hinweis mit „Jetzt laden“, kein automatisches Neuladen');
    assert(await up.evaluate(() => document.getElementById('updateBanner').parentElement.tagName) === 'DIALOG', 'Hinweis liegt über dem offenen Fenster');
    await up.click('#updateBanner >> text=Später');
    assert(!(await up.isVisible('#updateBanner')), '„Später“ blendet den Hinweis aus');
    await up.click('#btnCheckUpdate'); await up.waitForTimeout(300);
    await up.click('#updateBanner >> text=Jetzt laden'); await up.waitForTimeout(2500);
    assert(loads === 2, '„Jetzt laden“ lädt die App neu');
    assert(await up.isVisible('#updateBanner:has-text("noch nicht geladen")'), 'Hilft Neuladen nicht: Erklärung statt Endlosschleife');
    await uc.close();
  }

  // Diese Tests prüfen die App ohne Online-Speicher (der hat eigene Tests)
  const noCloud = c => c.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG = { supabaseUrl: '', supabaseKey: '' };" }));
  await noCloud(ctx);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  global.__nullWatch = [];
  const origClick = p.click.bind(p);
  p.click = async (...a) => { const r = await origClick(...a); await p.waitForTimeout(30); try { const t = await p.evaluate(() => (document.body.innerText.match(/(^|\s)null(\s|$)/m) || [null])[0] ? document.body.innerText.slice(Math.max(0, document.body.innerText.search(/(^|\s)null(\s|$)/m) - 40), document.body.innerText.search(/(^|\s)null(\s|$)/m) + 10) : ''); if (t) global.__nullWatch.push(String(a[0]) + ': ' + t.replace(/\s+/g, ' ')); } catch (e) { /* Seite wechselt */ } return r; }; p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL);
  assert(!(await p.textContent('#start')).includes('null') && await p.isVisible('#start h2:has-text("Woher kommen deine Rezepte?")') && await p.locator('#start .import-tile').count() === 6, 'Leere App: Startassistent mit allen Wegen');
  await p.click('#startShare');
  assert(await p.isVisible('dialog h2:has-text("Teilen einrichten")') && await p.isVisible('dialog li:has-text("Inhalte von URL abrufen")'), 'Startassistent: Anleitung fürs Teilen-Menü');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.click('#startPhotos');
  assert(await p.isVisible('label:has-text("je Rezept eins")'), 'Startassistent: Kachel öffnet direkt die passende Import-Seite');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.click('button:has-text("Beispielrezepte laden")');
  assert(await p.locator('.tile').count() === 25, '25 Beispielkacheln');
  assert(await p.locator('#start .import-tile').count() === 6, 'Nur Beispielrezepte: Startassistent noch da');
  const ownId = await p.evaluate(() => Store.saveRecipe({ title: 'Mein erstes Rezept', ingredients: ['1 Ei'], steps: ['Kochen.'] }).id);
  await p.waitForTimeout(200);
  assert(!(await p.isVisible('#start')), 'Mit eigenen Rezepten: Startassistent verschwindet');
  await p.click('#btnImport');
  assert(await p.isVisible('#tileShare'), 'Import-Fenster hat die Kachel „Über Teilen“');
  await p.click('#tileShare');
  assert(await p.isVisible('dialog h2:has-text("Teilen einrichten")'), '„Über Teilen“ öffnet die Anleitung');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.evaluate(id => Store.deleteRecipe(id), ownId);
  await p.waitForSelector('#startDone');
  await p.click('#startDone');
  assert(!(await p.isVisible('#start')), 'Startassistent lässt sich ausblenden');
  await p.reload(); await p.waitForTimeout(200);
  assert(!(await p.isVisible('#start')), 'Bleibt ausgeblendet');
  const titles = async () => p.$$eval('.tile-title', e => e.map(x => x.textContent));
  for (const [q, exp] of [['kase', null], ['brownis', 'Schokoladen-Brownies'], ['brust', 'Hähnchenbrust in Zitronen-Sahne'], ['feta ofen', 'Ofengemüse mit Feta'], ['xyzzy', null]]) {
    await p.fill('#q', q); const t = await titles();
    if (exp) assert(t[0] === exp, `Suche "${q}" -> ${t[0]}`); else console.log('    Suche', q, '->', t);
  }
  assert(await p.isVisible('text=Keine Treffer'), 'Keine-Treffer-Hinweis');
  for (const q of ['hahnchen', 'Haehnchen', 'Hähnchen']) {
    await p.fill('#q', q); const t = (await titles()).slice(0, 2).sort().join();
    assert(t === 'Hähnchenbrust in Zitronen-Sahne,Rotes Thai-Curry mit Hähnchen', 'Suche "' + q + '" -> beide Hähnchen-Rezepte oben: ' + t);
  }
  await p.click('#btnReset'); assert(await p.locator('.tile').count() === 25, 'Zurücksetzen');
  // Filter einklappen
  assert(await p.isVisible('#filters') && await p.getAttribute('#btnFilter', 'aria-expanded') === 'true', 'iPad: Filter anfangs offen');
  await p.click('#btnFilter');
  assert(!(await p.isVisible('#filters')) && await p.getAttribute('#btnFilter', 'aria-expanded') === 'false', 'Filter zugeklappt');
  await p.reload(); await p.waitForTimeout(200);
  assert(!(await p.isVisible('#filters')), 'Zugeklappt bleibt nach Neuladen zu');
  await p.click('#btnFilter');
  assert(await p.isVisible('#filters'), 'Filter wieder aufgeklappt');
  // Nach oben
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(100);
  assert(!(await p.isVisible('#toTop')), '„Nach oben“ oben noch versteckt');
  await p.evaluate(() => window.scrollTo(0, 3000)); await p.waitForTimeout(200);
  assert(await p.isVisible('#toTop'), '„Nach oben“ erscheint beim Scrollen');
  await p.click('#toTop'); await p.waitForFunction(() => window.scrollY === 0, null, { timeout: 3000 });
  assert(true, '„Nach oben“ scrollt zum Anfang');
  await p.setViewportSize({ width: 1024, height: 1366 }); await p.waitForTimeout(100);
  // Sicherung: alles als Datei, dann ein Rezept löschen und wieder einspielen (mit Foto)
  {
    const fid = await p.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40; cv.getContext('2d').fillRect(0, 0, 20, 20);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg'));
      const imageId = await window.RecipeImages.save(blob);
      return Store.saveRecipe({ title: 'Sicherungstest-Torte', ingredients: ['200 g Mehl'], steps: ['Backen.'], imageId }).id;
    });
    const before = await p.evaluate(() => Store.recipes().length);
    await p.click('#btnCollections');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnBackup')]);
    const bpath = require('os').tmpdir() + '/sicherung-' + process.pid + '.zip';
    await dl.saveAs(bpath);
    assert(/^Rezepte-Sicherung-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()) && (await p.textContent('#backupInfo')).includes(before + ' Rezepte und 1 Foto gesichert'), 'Sicherung: Datei mit allen Rezepten und Fotos: ' + dl.suggestedFilename() + ' / ' + await p.textContent('#backupInfo'));
    const img = await p.evaluate(id => Store.recipe(id).imageId, fid);
    await p.evaluate(([id, img]) => { Store.deleteRecipe(id); return window.RecipeImages.remove(img); }, [fid, img]);
    await p.setInputFiles('#restoreFile', bpath);
    await p.waitForFunction(() => /übernommen/.test(document.getElementById('backupInfo').textContent));
    const back = await p.evaluate(async id => { const r = Store.recipe(id); return r && { t: r.title, img: !!(await window.RecipeImages.blob(r.imageId)) }; }, fid);
    assert(back && back.t === 'Sicherungstest-Torte' && back.img && (await p.textContent('#backupInfo')).startsWith('1 Rezept aus der Sicherung übernommen'), 'Sicherung einspielen: gelöschtes Rezept samt Foto zurück, vorhandene unverändert: ' + await p.textContent('#backupInfo'));
    await p.setInputFiles('#restoreFile', bpath);
    await p.waitForFunction(() => /schon vorhanden/.test(document.getElementById('backupInfo').textContent));
    assert(true, 'Zweites Einspielen: nichts doppelt');
    await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
    await p.evaluate(id => Store.deleteRecipe(id), fid);
    require('fs').unlinkSync(bpath);
  }
  // One Pot: zusätzlicher Chip bei den Sammlungen
  const op = await p.evaluate(() => [
    Store.saveRecipe({ title: 'One-Pot-Pasta', ingredients: ['250 g Spaghetti'], steps: ['Alles in einem Topf 12 Minuten kochen.'] }).id,
    Store.saveRecipe({ title: 'Ofengemüse vom Blech', ingredients: ['1 kg Gemüse'], steps: ['Im Ofen 30 Minuten backen.'] }).id]);
  await p.waitForSelector('#chipOnePot');
  await p.click('#chipOnePot');
  const opTitles = (await p.$$eval('.tile-title', e => e.map(x => x.textContent))).sort().join(', ');
  const opCol = await p.evaluate(id => Store.recipe(id).collectionId, op[0]);
  assert(opTitles.includes('One-Pot-Pasta') && opTitles.includes('Ofengemüse vom Blech') && !opTitles.includes('Brownies') && !opTitles.includes('Apfelkuchen vom Blech') && !opTitles.includes('Vanillesoße') && opCol === 'col-topf', 'Chip „One Pot“ zeigt Eintopf-/Blechgerichte, Rezept bleibt zusätzlich in „Topf“: ' + opTitles);
  await p.click('#chipOnePot');
  await p.evaluate(ids => ids.forEach(id => Store.deleteRecipe(id)), op);

  // Blech-Rezepte starten bei 1 Blech (Mengen umgerechnet)
  {
    const id = await p.evaluate(() => Store.saveRecipe({ title: 'Test-Plätzchen', servings: 3, servingsUnit: 'Blech', ingredients: ['600 g Mehl', '3 Eier'], steps: ['Backen.'] }).id);
    await p.evaluate(id => { location.hash = '#rezept-' + id; }, id); await p.waitForTimeout(300);
    const shown = await p.evaluate(() => [document.querySelector('.stepper-value') && document.querySelector('.stepper-value').textContent, [...document.querySelectorAll('.ingredients li, .ing-list li, dialog li')].slice(0, 2).map(x => x.textContent)]);
    assert(/1 Blech/.test(shown[0]) && /200 g Mehl/.test(shown[1].join('|')), 'Blech-Rezept startet bei 1 Blech, Mengen umgerechnet: ' + JSON.stringify(shown));
    await p.evaluate(id => { location.hash = ''; document.getElementById('dlg').close(); Store.deleteRecipe(id); }, id);
  }
  // "Passt dazu": Ergänzungen statt Verweise
  {
    const P = await p.evaluate(() => {
      const S = window.RecipePairings.suggest;
      return {
        veg: S({ title: 'Cremige Kohlrabi-Karotten-Nudeln', course: 'Hauptgericht', ingredients: ['250 g Nudeln', '1 Kohlrabi', '2 Karotten', '200 ml Sahne'], steps: ['Kochen.'] }),
        meat: S({ title: 'Rindergulasch', course: 'Hauptgericht', ingredients: ['1 kg Rindfleisch', '3 Zwiebeln', '2 EL Paprikapulver'], steps: ['Schmoren.'] }),
        carbo: S({ title: 'Spaghetti Carbonara', course: 'Hauptgericht', ingredients: ['400 g Spaghetti', '150 g Pancetta', '3 Eier'], steps: ['Kochen.'] }),
        soup: S({ title: 'Linsensuppe', course: 'Suppe', ingredients: ['250 g Linsen', '1 l Brühe'], steps: ['Kochen.'] })
      };
    });
    assert(P.veg.includes('Schinkenwürfel') && P.veg.includes('angebratene Wiener'), 'Passt dazu: Vegetarisches Nudelgericht -> Schinkenwürfel, angebratene Wiener ' + P.veg);
    assert(P.meat.includes('Spätzle') && !P.meat.some(x => /Schinken|Wiener/.test(x)), 'Passt dazu: Gulasch -> Beilage, kein Fleisch ' + P.meat);
    assert(!P.carbo.some(x => /Schinken|Wiener|Hähnchen/.test(x)), 'Passt dazu: Carbonara hat schon Fleisch ' + P.carbo);
    assert(P.soup[0] === 'frisches Brot', 'Passt dazu: Suppe -> Brot ' + P.soup);
    const shown = await p.evaluate(() => { const r = Store.recipes().find(x => x.title === 'Rindergulasch'); location.hash = '#rezept-' + r.id; return true; });
    await p.waitForTimeout(300);
    const txt = await p.evaluate(() => (document.querySelector('#pairings') || {}).textContent || '');
    assert(/Passt dazu:/.test(txt) && /Spätzle/.test(txt), 'Passt dazu steht im Rezept: ' + txt);
    await p.evaluate(() => { location.hash = ''; document.getElementById('dlg').close(); });
  }
  // Gleiches Gericht mehrfach gespeichert: Hinweis, Vergleich, Empfehlung
  {
    const ids = await p.evaluate(() => [
      Store.saveRecipe({ title: 'Cheeseburger Auflauf', servings: 4, totalTime: '45 Min.', ingredients: ['500 g Rinderhackfleisch', '800 g Kartoffeln', '200 g Cheddar', '4 Gewürzgurken', '1 Zwiebel', '2 EL Senf'], steps: ['Kartoffeln in Scheiben schneiden und in eine Auflaufform legen.', 'Hackfleisch mit Zwiebel krümelig anbraten und mit Senf würzen.', 'Mit Gurken und Cheddar belegen und bei 200 °C 30 Minuten backen.'] }).id,
      Store.saveRecipe({ title: 'Low Carb Cheeseburger-Auflauf', review: true, ingredients: ['500 g Hackfleisch', 'Cheddar', 'Gewürzgurken', 'Zwiebel'], steps: ['Alles anbraten und im Ofen überbacken.'] }).id,
      Store.saveRecipe({ title: 'Cheeseburgerauflauf mit Nudeln', ingredients: ['400 g Nudeln', '500 g Hackfleisch', '150 g Cheddar', '1 Zwiebel', '2 Gewürzgurken'], steps: ['Nudeln kochen.', 'Hack anbraten.', 'Alles in eine Form, Käse drüber, im Ofen 20 Minuten backen.'] }).id,
      Store.saveRecipe({ title: 'Pfannkuchenteig', method: 'Braten', ingredients: ['250 g Mehl', '3 Eier', '500 ml Milch', '1 Prise Salz'], steps: ['Verrühren.', 'In der Pfanne ausbacken.'] }).id,
      Store.saveRecipe({ title: 'Ofen-Pfannkuchenteig', method: 'Backen', ingredients: ['250 g Mehl', '3 Eier', '500 ml Milch', '1 Prise Salz'], steps: ['Verrühren.', 'Auf dem Blech im Ofen backen.'] }).id
    ]);
    const g = await p.evaluate(() => window.RecipeDupes.groups(Store.recipes()).map(x => x.map(r => r.title).sort().join(' / ')));
    assert(g.length === 1 && /Cheeseburger Auflauf/.test(g[0]) && !/Pfannkuchen/.test(g.join()), 'Mehrfach: 3 Cheeseburger-Varianten erkannt, Pfanne/Ofen-Pfannkuchen nicht: ' + JSON.stringify(g));
    assert(await p.locator('#dupNotice').count() === 1, 'Mehrfach: Hinweis in der Übersicht');
    await p.click('#dupNotice .btn'); await p.waitForTimeout(300);
    const first = await p.evaluate(() => [document.querySelector('.dup-card').dataset.id, document.querySelector('.dup-best .dup-why').textContent, document.querySelector('.dup-card:not(.dup-best) .dup-facts:nth-of-type(2)') ? document.querySelector('.dup-card:not(.dup-best)').textContent : '']);
    assert(first[0] === ids[0] && /alle Zutaten mit Mengen/.test(first[1]), 'Mehrfach: das vollständigste Rezept wird empfohlen (' + first[1] + ')');
    const marks = await p.evaluate(() => ({ only: [...document.querySelectorAll('.dup-only')].map(x => x.textContent), amount: [...document.querySelectorAll('.dup-amount')].map(x => x.textContent), common: (document.querySelector('.dup-common') || {}).textContent || '', oven: [...document.querySelectorAll('.dup-oven')].map(x => x.textContent) }));
    assert(marks.only.some(x => /800 g Kartoffeln/.test(x)) && marks.only.some(x => /Nudeln/.test(x)), 'Mehrfach: Zutaten nur in einer Variante markiert (＋) ' + JSON.stringify(marks.only));
    assert(marks.amount.some(x => /Cheddar/.test(x)), 'Mehrfach: andere Menge markiert (≠) ' + JSON.stringify(marks.amount));
    assert(/hackfleisch/i.test(marks.common) && /Zwiebel/.test(marks.common), 'Mehrfach: Gemeinsames einmal oben ' + marks.common);
    assert(marks.oven.some(x => /200 °C/.test(x)), 'Mehrfach: Ofentemperatur im Vergleich ' + JSON.stringify(marks.oven));
    await p.click('#dupKeepAll'); await p.waitForTimeout(300);
    assert(await p.locator('#dupNotice').count() === 0, 'Mehrfach: „Alle behalten“ blendet den Hinweis aus');
    // Neue Variante dazu -> wieder Hinweis; "Nur Empfehlung behalten" löscht die anderen
    const extra = await p.evaluate(() => Store.saveRecipe({ title: 'Cheeseburger Auflauf schnell', ingredients: ['500 g Hackfleisch', '150 g Cheddar', '1 Zwiebel', 'Gewürzgurken'], steps: ['Anbraten, im Ofen überbacken.'] }).id);
    await p.waitForTimeout(200);
    assert(await p.locator('#dupNotice').count() === 1, 'Mehrfach: neue Variante -> Hinweis wieder da');
    await p.click('#dupNotice .btn'); await p.waitForTimeout(300);
    await p.click('#dupKeepBest'); await p.click('#dupConfirm'); await p.waitForTimeout(300);
    const left = await p.evaluate(ids => ids.filter(id => Store.recipe(id)), ids.slice(0, 3).concat(extra));
    assert(left.length === 1 && left[0] === ids[0], 'Mehrfach: „Nur Empfehlung behalten“ löscht die anderen ' + JSON.stringify(left));
    const focus = await p.evaluate(() => document.activeElement.tagName + (document.activeElement.className || ''));
    assert(!/BUTTON/.test(focus), 'Beim Öffnen eines Rezepts kein Ring um den ersten Knopf (Fokus: ' + focus + ')');
    await p.evaluate(() => { document.getElementById('dlg').close(); });
    await p.evaluate(ids => ids.forEach(id => Store.recipe(id) && Store.deleteRecipe(id)), ids);
  }
  // Aufräum-Runde für alle gespeicherten Rezepte (auch ohne Original, auch schon geprüfte)
  {
    const id = await p.evaluate(() => Store.saveRecipe({ title: 'Pilzpfanne', ingredients: ['200 g Champions', '1 Zwiebel'], steps: ['Pilze braten.', 'Guten Appetit!'], notes: 'x', review: false }).id);
    await p.evaluate(id => {
      const KEY = 'rezepte.daten.v1', d = JSON.parse(localStorage.getItem(KEY));
      const r = d.recipes.find(x => x.id === id);
      r.title = '🍄 Pilzpfanne ✨'; d.recipes.push({ ...r, id: 'spruch-1', title: 'So wird dein Darm gesund', ingredients: ['60 g Haferflocken', '300 ml Milch'], steps: ['Haferflocken in der Milch aufkochen.'], notes: '' }); r.ingredients = ['200 g Champions 🍄', '1 Zwiebel']; r.steps = ['Pilze 🔥 braten.', 'Folgt mir für mehr Rezepte 💕', 'Guten Appetit!'];
      r.notes = 'Pilzpfanne\nIm Kühlschrank 3 Tage haltbar. 👍\n#pilze #rezept @koch.mama\nLink in Bio';
      localStorage.setItem(KEY, JSON.stringify(d));
    }, id);
    await p.reload(); await p.waitForTimeout(300);
    const r = await p.evaluate(id => Store.recipe(id), id);
    assert(r.title === 'Pilzpfanne' && JSON.stringify(r.ingredients) === JSON.stringify(['200 g Champignons', '1 Zwiebel']) && JSON.stringify(r.steps) === JSON.stringify(['Pilze braten.']),
      'Aufräumen: Emojis, Tippfehler und Werbesätze aus gespeichertem Rezept entfernt ' + JSON.stringify([r.title, r.ingredients, r.steps]));
    assert(r.notes === 'Im Kühlschrank 3 Tage haltbar.', 'Aufräumen: Notizen ohne Name, Hashtags, „Link in Bio“ – Haltbarkeit bleibt: ' + JSON.stringify(r.notes));
    const sp = await p.evaluate(() => Store.recipe('spruch-1'));
    assert(sp && sp.title === 'Porridge', 'Gespeichertes Rezept mit Spruch als Name wird umbenannt: ' + (sp && sp.title));
    await p.evaluate(id => { Store.deleteRecipe(id); Store.deleteRecipe('spruch-1'); }, id);
  }
  // Original aufbewahren: ungeprüfte Importe werden mit neuen Regeln neu eingelesen, eigene Änderungen bleiben
  {
    const ids = await p.evaluate(() => {
      const I = window.RecipeImporter;
      const a = Store.saveRecipe({ ...I.fromText('Käsespätzle\nZutaten:\n500 g Mehl\n5 Eier\n300 g Bergkäse\nZubereitung:\nTeig rühren und in kochendes Salzwasser schaben.\nMit Käse schichten.'), review: true, importBatch: 'test-re' });
      const b = Store.saveRecipe({ ...I.fromText('Linsensuppe\nZutaten:\n250 g Tellerlinsen\n1,5 l Gemüsebrühe\nZubereitung:\nAlles 40 Minuten kochen.'), review: true, importBatch: 'test-re' });
      const c = Store.saveRecipe({ ...I.fromText('Apfelkuchen\nZutaten:\n1 kg Äpfel\n200 g Mehl\nZubereitung:\nBei 180 °C backen.'), review: false, importBatch: 'test-re' });
      return [a.id, b.id, c.id, !!(a.importSource && a.importSource.text.includes('Bergkäse') && a.importResult && a.importResult.mainIngredient === a.mainIngredient)];
    });
    assert(ids[3], 'Import merkt sich Original und Vorschlag der App');
    // So tun, als hätten ältere Regeln falsch geschätzt (und die Nutzerin bei b die Rezeptart selbst geändert)
    await p.evaluate(([a, b, c]) => {
      const KEY = 'rezepte.daten.v1', d = JSON.parse(localStorage.getItem(KEY));
      for (const r of d.recipes) {
        if (![a, b, c].includes(r.id)) continue;
        r.importV = 'alt';
        if (r.id === a) { r.mainIngredient = r.importResult.mainIngredient = 'Bergkäse'; r.course = r.importResult.course = 'Beilage'; }
        if (r.id === b) { r.mainIngredient = r.importResult.mainIngredient = 'Gemüsebrühe'; r.importResult.course = 'Hauptgericht'; r.course = 'Vorspeise'; }
        if (r.id === c) { r.mainIngredient = r.importResult.mainIngredient = 'Mehl'; }
      }
      localStorage.setItem(KEY, JSON.stringify(d));
    }, ids);
    await p.reload(); await p.waitForTimeout(1800);
    const after = await p.evaluate(ids => ids.slice(0, 3).map(id => { const r = Store.recipe(id); return [r.mainIngredient, r.course]; }), ids);
    assert(after[0][0] === 'Spätzle' && after[0][1] === 'Hauptgericht', 'Neu eingelesen: falsche Hauptzutat und Rezeptart korrigiert ' + JSON.stringify(after[0]));
    assert(after[1][0] === 'Linsen' && after[1][1] === 'Vorspeise', 'Neu eingelesen: Hauptzutat korrigiert, selbst geänderte Rezeptart bleibt ' + JSON.stringify(after[1]));
    assert(after[2][0] === 'Mehl', 'Schon geprüftes Rezept („Passt“) bleibt unverändert ' + JSON.stringify(after[2]));
    await p.evaluate(() => Store.deleteBatch('test-re'));
  }
  // Zutaten-Filter: mehrere Zutaten, Rezepte müssen alle enthalten
  {
    const ids = await p.evaluate(() => [
      Store.saveRecipe({ title: 'Testpfanne A', ingredients: ['500 g Rinderhackfleisch', '2 rote Paprikaschoten', '1 Zwiebel'], steps: ['Braten.'] }).id,
      Store.saveRecipe({ title: 'Testpfanne B', ingredients: ['300 g Hackfleisch', '1 TL Paprikapulver'], steps: ['Braten.'] }).id,
      Store.saveRecipe({ title: 'Testsalat C', ingredients: ['1 Paprika (gelb)', '1 Gurke'], steps: ['Schneiden.'] }).id]);
    await p.fill('#ingInput', 'hack');
    await p.waitForSelector('#ingSuggest .chip');
    const sug = await p.$$eval('#ingSuggest .chip', e => e.map(x => x.textContent));
    assert(sug[0].startsWith('Hackfleisch'), 'Zutat eintippen: Vorschläge aus den Rezepten (' + sug.join(', ') + ')');
    await p.click('#ingSuggest .chip:has-text("Hackfleisch")');
    await p.waitForTimeout(150);
    let t = (await p.$$eval('.tile-title', e => e.map(x => x.textContent))).filter(x => /^Test/.test(x)).sort().join(', ');
    assert(t === 'Testpfanne A, Testpfanne B', 'Filter Hackfleisch (auch Rinderhackfleisch): ' + t);
    await p.fill('#ingInput', 'papr');
    await p.waitForSelector('#ingSuggest .chip');
    await p.evaluate(() => [...document.querySelectorAll('#ingSuggest .chip')].find(b => /^Paprika\d/.test(b.textContent)).click());
    await p.waitForTimeout(150);
    t = (await p.$$eval('.tile-title', e => e.map(x => x.textContent))).filter(x => /^Test/.test(x)).sort().join(', ');
    assert(t === 'Testpfanne A', 'Hackfleisch + Paprika: nur Rezepte mit beidem, „Paprikapulver“ zählt nicht: ' + t);
    assert((await p.textContent('#filterBadge')) === '2', 'Filter-Zähler zählt die Zutaten mit');
    await p.click('.chips[data-key=ings] .chip:has-text("Hackfleisch")');
    await p.waitForTimeout(150);
    t = (await p.$$eval('.tile-title', e => e.map(x => x.textContent))).filter(x => /^Test/.test(x)).sort().join(', ');
    assert(t === 'Testpfanne A, Testsalat C', 'Zutat antippen entfernt sie wieder: ' + t);
    await p.click('#btnReset');
    await p.evaluate(ids => ids.forEach(id => Store.deleteRecipe(id)), ids);
  }
  // Hauptzutat als feste Gruppen
  const groupChips = await p.$$eval('.chips[data-key=mainIngredient] .chip', e => e.map(x => x.firstChild.textContent.trim()));
  const allowed = await p.evaluate(() => window.RecipeGroups.ORDER);
  assert(groupChips.length > 2 && groupChips.length <= allowed.length && groupChips.every(c => allowed.includes(c)), 'Hauptzutat zeigt nur Gruppen: ' + groupChips.join(', '));
  await p.click('.chips[data-key=mainIngredient] .chip:has-text("Fleisch")');
  const meat = await p.$$eval('.tile-title', e => e.map(x => x.textContent));
  assert(meat.length > 0 && await p.evaluate(t => t.every(x => window.RecipeGroups.groupOf(Store.recipes().find(r => r.title === x).mainIngredient) === 'Fleisch'), meat), 'Chip „Fleisch“ zeigt nur Fleischgerichte (' + meat.length + ')');
  await p.click('.chips[data-key=mainIngredient] .chip:has-text("Fleisch")');
  // Filterzeilen anordnen
  const rowOrder = () => p.$$eval('.facet:not(.facet-ings)', e => e.map(x => x.dataset.key).join());
  assert(await rowOrder() === 'collectionId,course,mainIngredient', 'Standard-Reihenfolge der Filterzeilen (ohne eigene Zeile „Zubereitung“)');
  await p.click('#btnArrange');
  assert(await p.isDisabled('[aria-label="Sammlung nach oben"]'), 'Oberste Zeile kann nicht weiter hoch');
  await p.click('[aria-label="Hauptzutat nach oben"]'); await p.click('[aria-label="Hauptzutat nach oben"]');
  await p.click('[aria-label="Sammlung nach unten"]');
  assert(await rowOrder() === 'mainIngredient,course,collectionId', 'Zeilen verschoben: ' + await rowOrder());
  await p.click('#btnArrange');
  assert(await p.locator('.facet-move').count() === 0, 'Fertig beendet das Anordnen');
  await p.reload(); await p.waitForTimeout(200);
  assert(await rowOrder() === 'mainIngredient,course,collectionId', 'Reihenfolge bleibt nach Neuladen');
  await p.evaluate(() => localStorage.removeItem('rezepte.filterReihenfolge')); await p.reload(); await p.waitForTimeout(200);
  assert(await rowOrder() === 'collectionId,course,mainIngredient', 'Reihenfolge zurückgestellt');
  // Sortieren
  await p.selectOption('#sort', 'schnell');
  const first = (await titles())[0];
  assert(first === 'Mango-Lassi', 'Schnellste zuerst: ' + (await titles()).slice(0, 3).join(', '));
  await p.selectOption('#sort', 'neu');
  await p.selectOption('#sort', 'name');
  assert((await titles())[0] === 'Apfelkuchen vom Blech', 'Name A–Z');
  await p.selectOption('#sort', 'schnell'); await p.reload(); await p.waitForTimeout(200);
  assert(await p.inputValue('#sort') === 'schnell' && (await titles())[0] === 'Mango-Lassi', 'Sortierung bleibt nach Neuladen');
  await p.selectOption('#sort', 'name');
  const colChips = await p.$$eval('.facet[data-key=collectionId] .chip:not(.chip-fav):not(.chip-onepot):not(.chip-review)', e => e.map(x => x.textContent));
  assert(colChips.join(' ') === 'Ofen10 Pfanne2 Topf9 Kalt4', 'Feste Sammlungen aus der Zubereitung: ' + colChips.join(' '));
  await p.click('.facet[data-key=collectionId] .chip:has-text("Ofen")');
  const nBack = await p.locator('.tile').count(); assert(nBack === 10, 'Sammlung Ofen = ' + nBack);
  await p.click('.facet:has-text("Rezeptart") .chip:has-text("Hauptgericht")');
  assert((await titles()).join() === 'Lachs mit Honig-Senf-Kruste,Ofengemüse mit Feta,Quiche Lorraine', 'Ofen + Hauptgericht');
  assert(await p.textContent('#filterBadge') === '2', 'Filter-Knopf zeigt 2 aktive Filter');
  await p.fill('#q', 'lachs');
  assert((await p.locator('.tile').count()) === 1, 'Suche+Filter kombiniert');
  await p.click('.tile'); await p.waitForTimeout(200); assert(await p.isVisible('dialog[open] h2:has-text("Lachs")'), 'Rezeptfenster offen');
  assert(p.url().includes('#rezept-'), 'Adresse enthält Rezept');
  await p.goBack(); await p.waitForTimeout(200);
  assert(!(await p.isVisible('dialog[open]')), 'Zurück schließt Fenster');
  assert(await p.inputValue('#q') === 'lachs' && (await p.locator('.chip[aria-pressed=true]').count()) === 2, 'Suche/Filter erhalten');
  await p.click('.tile'); await p.waitForTimeout(200); await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  assert(!(await p.isVisible('dialog[open]')), 'X schließt Fenster');
  await p.click('#btnReset');
  // Personen-Regler
  const ing = () => p.$$eval('dialog .ingredients li', e => e.map(x => x.textContent));
  await p.fill('#q', 'linsensuppe'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await p.textContent('.stepper-value') === '4 Personen', 'Linsensuppe startet bei 4 Personen');
  assert((await ing())[0] === '250 g Tellerlinsen', 'Originalmengen bei 4');
  await p.click('[aria-label="Menge: weniger"]'); await p.click('[aria-label="Menge: weniger"]');
  assert(await p.textContent('.stepper-value') === '2 Personen', 'Regler auf 2');
  assert((await ing())[0] === '125 g Tellerlinsen' && (await ing())[4] === '500 ml Gemüsebrühe', 'Halbe Mengen: ' + (await ing()).join(' | '));
  await p.click('[aria-label="Menge: weniger"]');
  assert(await p.textContent('.stepper-value') === '1 Person' && await p.isDisabled('[aria-label="Menge: weniger"]'), 'Minimum 1 Person');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.fill('#q', 'ofengemuse feta'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await p.textContent('.stepper-value') === '4 Personen', 'Rezept für 2 startet bei 4');
  assert((await ing()).includes('400 g Feta'), 'Doppelte Mengen');
  assert(!(await p.isVisible('text=Originalrezept')) && !(await p.isVisible('text=Umgerechnet')), 'Kein Umgerechnet-Hinweis mehr');
  await p.click('text=Bearbeiten');
  assert(await p.inputValue('#fServings') === '2' && (await p.inputValue('#fIngredients')).includes('200 g Feta'), 'Formular zeigt Original');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(100);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.fill('#q', 'brownies'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await p.textContent('.stepper-value') === '12 Stück', 'Brownies starten bei 12 Stück');
  await p.click('[aria-label="Menge: mehr"]');
  assert((await ing())[0] === '216,67 g Zartbitterschokolade' || (await ing())[0].startsWith('215 g'), 'Brownies 13 Stück: ' + (await ing())[0]);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  // Bring!: aktuelle Mengen, Salz/Pfeffer vorab abgewählt, Link auf die Rezeptseite für Bring!
  await p.evaluate(() => { window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, { supabaseUrl: 'https://test.supabase.example' }); });
  const bid = await p.evaluate(() => Store.saveRecipe({ title: 'Testsuppe', servings: 4, servingsUnit: 'Personen', ingredients: ['400 g Kartoffeln', '1 l Brühe', 'Salz und Pfeffer', '2 EL Olivenöl', '1 Bund frischer Thymian', '200 ml Sahne'], steps: ['Kochen.'] }).id);
  await p.evaluate(id => { location.hash = 'rezept-' + id; }, bid); await p.waitForSelector('dialog h2:has-text("Testsuppe")');
  await p.click('[aria-label="Menge: weniger"]'); await p.click('[aria-label="Menge: weniger"]');
  await p.evaluate(() => { window.open = () => null; });
  await p.click('#btnBring');
  const rowsOf = sel => p.$$eval(sel + ' .bring-row', e => e.map(x => (x.querySelector('input').checked ? '✓ ' : '– ') + x.textContent.trim()).join(' | '));
  assert(await rowsOf('#bringBuy') === '✓ 200 g Kartoffeln | ✓ ½ Bund frischer Thymian | ✓ 100 ml Sahne', 'Bring! „Einkaufen“: normale Zutaten (auch frische Kräuter) ausgewählt, Mengen für 2: ' + await rowsOf('#bringBuy'));
  assert(await rowsOf('#bringHome') === '– 500 ml Brühe | – Salz und Pfeffer | – 1 EL Olivenöl', 'Bring! „Hast du das zu Hause?“: Vorrat abgewählt: ' + await rowsOf('#bringHome'));
  await p.click('#bringHome .bring-row:has-text("Olivenöl")');
  await p.click('#bringSend');
  const sent = await p.evaluate(() => {
    const u = new URL(window.RecipeBringLast);
    const page = new URL(u.searchParams.get('url'));
    const b64 = page.searchParams.get('bring').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    return { host: u.host, src: u.searchParams.get('source'), page: page.pathname, data: JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))) };
  });
  assert(sent.host === 'api.getbring.com' && sent.src === 'web' && sent.page === '/functions/v1/import' && sent.data.t === 'Testsuppe' && sent.data.i.join('|') === '200 g Kartoffeln|1 EL Olivenöl|½ Bund frischer Thymian|100 ml Sahne', 'Bring!-Link mit Rezeptseite und gewählten Zutaten: ' + JSON.stringify(sent.data));
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.evaluate(id => Store.deleteRecipe(id), bid);
  // Blech ohne Kuchen (Granola): kein Umschalter, sondern Anzahl Bleche
  const gid = await p.evaluate(() => Store.saveRecipe({ title: 'Granola', servings: 1, servingsUnit: 'Blech', formSize: '30 × 40 cm', ingredients: ['200 g Haferflocken'], steps: ['Backen.'] }).id);
  await p.evaluate(id => { location.hash = 'rezept-' + id; }, gid); await p.waitForSelector('dialog h2:has-text("Granola")');
  assert(!(await p.isVisible('.segmented')) && await p.isVisible('.size-info:has-text("Blech 30 × 40 cm")') && (await p.textContent('.stepper-value')) === '1 Blech', 'Granola: kein Springform-Umschalter, Anzahl Bleche + Größe');
  await p.click('[aria-label="Menge: mehr"]');
  assert((await p.textContent('.stepper-value')) === '2 Bleche' && (await p.textContent('.ingredients li')).startsWith('400 g'), '2 Bleche: doppelte Menge');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.evaluate(id => Store.deleteRecipe(id), gid);
  // Springform <-> Blech
  const segOn = () => p.textContent('.seg[aria-pressed=true]');
  await p.fill('#q', 'apfelkuchen'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await segOn() === 'Blech' && await p.isVisible('.size-info:has-text("Blech 30 × 40 cm")'), 'Blech mit Größe');
  await p.click('.seg:has-text("Springform")');
  assert(await p.textContent('.stepper-value') === 'Ø 26 cm' && (await ing())[0] === '440 g Äpfel', 'Blech → Springform Ø 26: ' + (await ing())[0]);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.fill('#q', 'kasekuchen'); await p.click('.tile'); await p.waitForTimeout(200);
  const vals = () => p.$$eval('.stepper-value', e => e.filter(x => x.offsetParent).map(x => x.textContent));
  assert(await segOn() === 'Springform' && (await vals()).join() === 'Ø 26 cm', 'Springform mit Ø: ' + (await vals()).join());
  for (let i = 0; i < 4; i++) await p.click('[aria-label="Durchmesser: weniger"]');
  assert((await vals())[0] === 'Ø 18 cm' && (await ing())[0] === '480 g Magerquark', 'Ø 18 cm rechnet nach Fläche: ' + (await ing())[0]);
  await p.click('.seg:has-text("Blech")');
  assert(!(await p.isVisible('[aria-label="Durchmesser: weniger"]')) && (await ing())[0] === '2,26 kg Magerquark', 'Springform Ø 26 → Blech: ' + (await ing())[0]);
  await p.click('.seg:has-text("Springform")');
  // Zu einem anderen Rezept springen und zurück
  assert(await p.locator('dialog .notes a').count() === 0, 'Kein Link im Notiztext');
  await p.evaluate(() => window.RecipeApp.openDetail(Store.recipes().find(r => /Apfelkuchen/.test(r.title)).id)); await p.waitForTimeout(200);
  assert(await p.isVisible('dialog[open] h2:has-text("Apfelkuchen vom Blech")'), 'Passt-dazu öffnet verlinktes Rezept');
  await p.goBack(); await p.waitForTimeout(200);
  assert(await p.isVisible('dialog[open] h2:has-text("Käsekuchen")'), 'Zurück führt zum vorherigen Rezept');
  assert((await ing()).includes('1 Zitrone'), 'Bio-Hinweis entfernt');
  while (!(await p.isDisabled('[aria-label="Durchmesser: mehr"]'))) await p.click('[aria-label="Durchmesser: mehr"]');
  assert((await vals())[0] === 'Ø 32 cm', 'Springform höchstens Ø 32 cm');
  await p.evaluate(() => window.RecipeApp.openDetail(Store.recipes().find(r => /Apfelkuchen/.test(r.title)).id)); await p.waitForTimeout(200);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(300);
  assert(await p.isVisible('dialog[open] h2:has-text("Käsekuchen")'), 'X im verlinkten Rezept führt zum ursprünglichen zurück');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(300);
  assert(!(await p.isVisible('dialog[open]')) && !p.url().includes('#rezept'), 'Danach schließt X ganz');
  assert(await p.inputValue('#q') === 'kasekuchen', 'Suche nach Link-Rundgang erhalten');
  await p.fill('#q', 'ofenkartoffeln'); await p.click('.tile'); await p.waitForTimeout(200);
  const linked = await p.$$eval('#pairings .tag, #pairings .btn', e => e.map(x => x.textContent));
  assert(linked.join('|') === 'Frikadellen|Schnitzel|Bratwurst', 'Passt dazu (Beilage -> was dazu): ' + linked.join('|'));
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.fill('#q', 'ofengemuse'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await p.locator('dialog .related .btn').count() === 0, 'Passt dazu: keine falschen Verweise (Ofengemüse)');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  // Favoriten
  const favChip = () => p.textContent('.facet:has-text("Sammlung") .chip >> nth=0');
  assert((await favChip()).replace(/\s/g, '') === '★Favoriten0', 'Favoriten-Chip ganz vorn: ' + await favChip());
  await p.click('.chip-fav'); await p.waitForTimeout(100);
  assert(await p.isVisible('text=Noch keine Favoriten'), 'Hinweis, wenn noch keine Favoriten');
  await p.click('text=Alle Rezepte zeigen');
  await p.fill('#q', 'tiramisu'); await p.click('.tile'); await p.waitForTimeout(200);
  await p.click('dialog .fav-btn');
  assert(await p.getAttribute('dialog .fav-btn', 'aria-pressed') === 'true' && await p.textContent('dialog .fav-btn') === '★', 'Stern im Rezept setzt Favorit');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.fill('#q', '');
  await p.click('.chip-fav'); await p.waitForTimeout(100);
  assert((await titles()).join() === 'Tiramisu' && await p.isVisible('.tile .fav-badge'), 'Favoriten-Filter zeigt nur Favoriten, Kachel mit Stern');
  await p.click('.chip-fav');
  assert(await p.locator('.tile').count() === 25, 'Favoriten-Filter wieder aus');
  // Doppeltes Rezept mit anderem Namen wird erkannt
  await p.click('#btnImport'); await p.click('#tileManual');
  await p.fill('#fTitle', 'Omas Kaffee-Dessert');
  await p.fill('#fIngredients', 'Mascarpone 250g\n2 Eier\nZucker 40 g\nLöffelbiskuits 100g\nEspresso 150 ml\n1 EL Kakao');
  await p.fill('#fSteps', 'Eier trennen und Eigelb mit Zucker schaumig rühren.\nEiweiß steif schlagen und unterheben.\nBiskuits in Espresso tauchen, schichten, kühlen.');
  const before = await p.evaluate(() => Store.recipes().length);
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(200);
  assert(await p.isVisible('#dupNotice:has-text("„Tiramisu“")') && await p.evaluate(() => Store.recipes().length) === before, 'Gleiches Rezept mit anderem Namen erkannt, nicht doppelt gespeichert');
  await p.click('#dupNotice >> text=Vorhandenes öffnen'); await p.waitForTimeout(300);
  assert(await p.isVisible('dialog h2:has-text("Tiramisu")'), 'Vorhandenes Rezept geöffnet');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.click('#btnImport'); await p.click('#tileManual');
  await p.fill('#fTitle', 'Tiramisu-Variante');
  await p.fill('#fIngredients', 'Mascarpone 250g\n2 Eier\nZucker 40 g\nLöffelbiskuits 100g\nEspresso 150 ml');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(200);
  await p.click('#dupNotice >> text=Trotzdem speichern'); await p.waitForTimeout(400);
  assert(await p.isVisible('dialog h2:has-text("Tiramisu-Variante")') && await p.evaluate(() => Store.recipes().length) === before + 1, 'Trotzdem speichern legt es an');
  await p.click('dialog >> text=Löschen'); await p.click('text=Ja, löschen'); await p.waitForTimeout(300);
  // Vorschläge unter Rezeptart, Hauptzutat, Zubereitung
  await p.fill('#q', 'linsensuppe'); await p.click('.tile'); await p.waitForTimeout(200); await p.click('text=Bearbeiten');
  const sug = id => p.$$eval('#' + id + ' + .suggest .chip', e => e.map(x => x.textContent));
  assert((await sug('fCourse'))[0] === 'Hauptgericht', 'Häufigste eigene Rezeptart zuerst: ' + (await sug('fCourse')).slice(0, 3).join(', '));
  assert(!(await sug('fCourse')).includes('Suppe'), 'Aktueller Wert nicht doppelt vorgeschlagen');
  await p.fill('#fCourse', 'des');
  assert((await sug('fCourse')).join() === 'Dessert', 'Beim Tippen gefiltert: ' + (await sug('fCourse')).join());
  await p.click('#fCourse + .suggest .chip:has-text("Dessert")');
  assert(await p.inputValue('#fCourse') === 'Dessert', 'Vorschlag antippen übernimmt ihn');
  assert((await sug('fMain')).includes('Kartoffeln') && (await sug('fMethod')).includes('Backen'), 'Vorschläge auch bei Hauptzutat und Zubereitung');
  await p.click('dialog >> text=Abbrechen'); await p.waitForTimeout(100);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  // Formular: Einheit als Auswahl, Größe nur bei Formen
  await p.fill('#q', 'kasekuchen'); await p.click('.tile'); await p.waitForTimeout(200); await p.click('text=Bearbeiten');
  const opts = await p.$$eval('#fServUnit option', e => e.map(x => x.textContent));
  assert(opts.join() === 'Personen,Stück,Gläser,Blech,Springform,Kastenform', 'Sechs Einheiten: ' + opts.join());
  assert(await p.isVisible('#fSizeD') && await p.inputValue('#fSizeD') === '26' && !(await p.isVisible('#fSizeL')), 'Springform fragt nur Durchmesser');
  await p.selectOption('#fServUnit', 'Personen');
  assert(!(await p.isVisible('#fSizeD')) && !(await p.isVisible('#fSizeL')) && !(await p.isVisible('#fSizeK')), 'Personen: kein Größenfeld');
  await p.selectOption('#fServUnit', 'Blech');
  assert(await p.inputValue('#fSizeL') === '30' && await p.inputValue('#fSizeW') === '40', 'Blech: 30 × 40 vorausgefüllt');
  await p.selectOption('#fServUnit', 'Gläser');
  assert(await p.isVisible('#fSizeG') && (await p.$$eval('#fSizeG option', e => e.map(x => x.textContent)))[2] === '250 ml – Marmeladenglas', 'Gläser: Auswahl der Glasgröße');
  await p.selectOption('#fServUnit', 'Springform'); await p.fill('#fSizeD', '24');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(400);
  assert(await p.textContent('.stepper-value') === 'Ø 24 cm', 'Neue Springformgröße gespeichert');
  // Fachbegriffe
  const terms = await p.$$eval('dialog .term', e => e.map(x => x.textContent));
  assert(terms.join() === 'Ober-/Unterhitze', 'Nur besondere Begriffe markiert (kein Pck., vorheizen): ' + terms.join(', '));
  await p.click('dialog .term:has-text("Ober-/Unterhitze")');
  assert(await p.isVisible('.explain:has-text("Kuchen, Brot und Aufläufe")'), 'Erklärung sagt, wofür man es nimmt');
  assert(await p.locator('.explain button').count() === 0, 'Kein Verstanden-Knopf');
  await p.click('dialog .facts'); await p.waitForTimeout(100);
  assert(!(await p.isVisible('.explain')), 'Tipp irgendwohin schließt die Erklärung');
  await p.click('dialog .term:has-text("Ober-/Unterhitze")');
  await p.click('.explain'); await p.waitForTimeout(100);
  assert(!(await p.isVisible('.explain')), 'Tipp auf die Erklärung schließt sie auch');
  const hit = await p.$eval('dialog .term', t => { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2 - 18); return el === t; });
  assert(hit, 'Begriff auch knapp darüber antippbar (große Tippfläche)');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.fill('#q', 'mango'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await p.isVisible('dialog .tags:has-text("Kalt zubereitet")'), 'Kalt zubereitet statt Roh / ohne Kochen');
  const sv = () => p.$$eval('.stepper-value', e => e.map(x => x.textContent));
  assert((await sv()).join() === '2 Gläser,300 ml', 'Lassi für 2 Gläser à 300 ml: ' + (await sv()).join());
  await p.click('[aria-label="Glasgröße: mehr"]');
  assert((await sv())[1] === '400 ml' && (await ing()).includes('400 g Joghurt'), 'Größeres Glas: Mengen nach Inhalt (300 → 400 g Joghurt)');
  await p.click('[aria-label="Glasgröße: weniger"]');
  await p.click('[aria-label="Menge: weniger"]');
  assert((await sv())[0] === '1 Glas' && (await ing()).includes('150 g Joghurt'), 'Einzahl: 1 Glas, halbe Menge');
  assert(await p.isVisible('dialog li .alt:has-text("Zimt")'), 'Alternative bei Kardamom');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.fill('#q', 'lachs'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await p.isVisible('dialog li:has-text("Dijon-Senf") .alt:has-text("mittelscharfer Senf")'), 'Alternative bei Dijon-Senf');
  assert(await p.locator('dialog li .alt').count() === 1, 'Keine Alternative bei normalen Zutaten');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.click('#btnReset');
  await p.click('#btnImport'); await p.click('#tileManual');
  await p.click('dialog button[type=submit]');
  assert(await p.isVisible('.form-error:has-text("Namen")'), 'Fehlermeldung ohne Namen');
  await p.fill('#fTitle', 'Omas Käsespätzle');
  assert(!(await p.isVisible('#fCollection')), 'Keine Sammlungsauswahl mehr im Formular');
  await p.fill('#fCourse', 'Hauptgericht'); await p.fill('#fMain', 'Käse'); await p.fill('#fMethod', 'kochen');
  assert((await p.textContent('#autoCol')).startsWith('Sammlung: Topf'), 'Formular zeigt: Sammlung ergibt sich aus der Zubereitung (Topf)');
  // Zutaten in beliebiger Reihenfolge
  await p.fill('#fIngredients', 'Spätzle 500g\n\n- Bergkäse: 200 g\nBio-Zwiebeln 2\neine Prise Muskat\nButter (2 EL, weich)\nMehl Type 405');
  const prev = await p.$$eval('.ing-preview li', e => e.map(x => x.textContent));
  assert(prev.join(' / ') === '500 g Spätzle / 200 g Bergkäse / 2 Bio-Zwiebeln / 1 Prise Muskat / 2 EL Butter (weich) / ohne Menge: Mehl Type 405', 'Vorschau erkennt Mengen überall: ' + prev.join(' / '));
  await p.fill('#fSteps', 'Spätzle kochen\nSchichten mit Käse\nZwiebeln in Ringe schneiden und rösten\n15 Minuten im Ofen überbacken');
  assert((await p.textContent('#fTimeOut')).startsWith('ca.'), 'Zeit im Formular automatisch: ' + await p.textContent('#fTimeOut'));
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(500);
  assert(await p.isVisible('dialog[open] h2:has-text("Omas Käsespätzle")'), 'Gespeichert und angezeigt');
  assert(await p.locator('dialog li').count() === 10, 'Leere Zeilen entfernt');
  const savedIng = await p.$$eval('dialog .ingredients li', e => e.map(x => x.textContent));
  assert(savedIng[0] === '500 g Spätzle', 'Gespeichert in einheitlicher Form: ' + savedIng[0]);
  await p.click('[aria-label="Menge: weniger"]'); await p.click('[aria-label="Menge: weniger"]');
  const halfIng = await p.$$eval('dialog .ingredients li', e => e.map(x => x.textContent));
  assert(halfIng[0] === '250 g Spätzle' && halfIng[4] === '1 EL Butter (weich)', 'Umgestellte Zutaten lassen sich umrechnen: ' + halfIng.join(' / '));
  await p.click('[aria-label="Menge: mehr"]'); await p.click('[aria-label="Menge: mehr"]');
  assert(await p.textContent('.stepper-value') === '4 Personen', 'Neues Rezept standardmäßig für 4');
  assert((await p.$$eval('dialog .ingredients li', e => e.map(x => x.textContent))).includes('2 Zwiebeln'), 'Bio beim Speichern entfernt');
  assert(await p.isVisible('dialog .facts:has-text("ca.")'), 'Zeit im Rezept angezeigt');
  // Foto hinzufügen
  await p.click('text=Bearbeiten');
  assert(await p.isHidden('.pick-preview') && await p.isVisible('label:has-text("Foto aufnehmen oder auswählen")'), 'Foto-Knopf direkt sichtbar');
  const order = await p.$$eval('#recipeForm .field > .label, #recipeForm .field > label', e => e.map(x => x.textContent));
  assert(order.indexOf('Foto') === 1, 'Foto steht direkt unter dem Namen: ' + order.slice(0, 3).join(', '));
  await p.setInputFiles('#fPhoto', 'icons/icon-512.png');
  await p.waitForSelector('.pick-preview[src^="blob:"]', { timeout: 10000 }).catch(() => {});
  assert(await p.isVisible('.pick-preview') && (await p.getAttribute('.pick-preview', 'src')).startsWith('blob:'), 'Foto-Vorschau');
  await p.click('dialog button[type=submit]');
  await p.waitForSelector('dialog .detail-img[src^="blob:"]', { timeout: 10000 }).catch(() => {});
  assert((await p.getAttribute('dialog .detail-img', 'src') || '').startsWith('blob:'), 'Foto im Rezept');
  const imgId = await p.evaluate(() => Store.recipes().find(r => r.title === 'Omas Käsespätzle').imageId);
  assert(/^bild-/.test(imgId), 'Foto-ID gespeichert');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  assert((await p.getAttribute('.tile:has-text("Omas Käsespätzle") img', 'src') || '').startsWith('blob:'), 'Foto auf der Kachel');
  assert(await p.evaluate(() => Store.recipes().find(r => r.title === 'Omas Käsespätzle').collectionId) === 'col-topf' && await p.isVisible('.facet[data-key=collectionId] .chip:has-text("Topf10")'), 'Neues Rezept automatisch in „Topf“');
  await p.fill('#q', 'kasespatzle'); await p.click('.tile'); await p.waitForTimeout(200); await p.click('text=Bearbeiten');
  await p.fill('#fNotes', 'Mit Röstzwiebeln'); await p.click('dialog button[type=submit]'); await p.waitForTimeout(500);
  assert(await p.isVisible('dialog .notes:has-text("Röstzwiebeln")'), 'Bearbeiten gespeichert');
  await p.reload(); await p.waitForTimeout(300);
  assert(await p.isVisible('dialog[open] h2:has-text("Omas")'), 'Nach Neuladen Fenster wieder da');
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  assert(await p.inputValue('#q') === 'kasespatzle', 'Suche nach Neuladen erhalten');
  await p.click('#btnReset');
  assert(await p.locator('.tile').count() === 26, '26 Rezepte nach Neuladen');
  await p.waitForTimeout(300);
  assert((await p.getAttribute('.tile:has-text("Omas Käsespätzle") img', 'src') || '').startsWith('blob:'), 'Foto nach Neuladen noch da');
  await p.fill('#q', 'mango'); await p.click('.tile'); await p.waitForTimeout(200); await p.click('dialog >> text=Löschen');
  await p.click('text=Ja, löschen'); await p.waitForTimeout(300);
  assert(!(await p.isVisible('dialog[open]')), 'Fenster nach Löschen zu');
  await p.click('#btnReset'); assert(await p.locator('.tile').count() === 25, 'Gelöscht');
  // Zubereitung ändern -> Sammlung wechselt automatisch
  await p.fill('#q', 'lachs'); await p.click('.tile'); await p.waitForTimeout(200);
  assert(await p.isVisible('dialog .facts:has-text("Sammlung: Ofen")'), 'Lachs liegt in „Ofen“');
  await p.click('text=Bearbeiten'); await p.fill('#fMethod', 'Braten');
  assert((await p.textContent('#autoCol')).startsWith('Sammlung: Pfanne'), 'Formular zeigt beim Tippen die neue Sammlung');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(400);
  assert(await p.isVisible('dialog .facts:has-text("Sammlung: Pfanne")'), 'Nach dem Speichern in „Pfanne“');
  await p.click('text=Bearbeiten'); await p.fill('#fMethod', 'Backen'); await p.click('dialog button[type=submit]'); await p.waitForTimeout(400);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  await p.click('#btnReset');
  // Beispielrezepte entfernen und wieder hinzufügen; eigenes Rezept bleibt
  await p.click('#btnCollections');
  await p.click('text=Beispielrezepte entfernen');
  await p.click('text=Ja, entfernen'); await p.waitForTimeout(200);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  assert((await titles()).join() === 'Omas Käsespätzle', 'Nur Beispiele entfernt, eigenes Rezept bleibt: ' + (await titles()).join());
  assert((await p.$$eval('.facet:has-text("Sammlung") .chip:not(.chip-fav)', e => e.map(x => x.textContent))).join() === 'Topf1', 'Nur Sammlungen mit Rezepten werden angezeigt');
  await p.click('#btnCollections');
  await p.click('text=Beispielrezepte hinzufügen'); await p.waitForTimeout(200);
  await p.click('dialog .icon-btn[aria-label=Schließen]'); await p.waitForTimeout(200);
  assert(await p.locator('.tile').count() === 26, 'Beispiele wieder hinzugefügt');
  await p.click('#btnCollections');
  assert(!(await p.isVisible('text=Fehlende Beispiele hinzufügen')), 'Keine doppelten Beispiele anbietbar, wenn alle da sind');
  assert(await p.isVisible('dialog h2:has-text("Einstellungen")') && await p.locator('.col-item').count() === 0, 'Knopf heißt „Einstellungen“, keine Sammlungsverwaltung mehr');
  await p.click('dialog .icon-btn[aria-label=Schließen]');
  await p.fill('#q', 'topf'); assert((await titles()).includes('Omas Käsespätzle') && (await titles()).includes('Linsensuppe'), 'Suche nach Sammlungsname (Topf)');
  await p.fill('#q', '');
  await p.screenshot({ path: OUT + '/ipad.png' });
  const ph = await b.newContext({ ...devices['iPhone 13'] });
  await noCloud(ph);
  const pp = await ph.newPage(); pp.on('pageerror', e => errs.push(e.message));
  await pp.goto(URL); await pp.click('button:has-text("Beispielrezepte laden")');
  assert(!(await pp.isVisible('#filters')), 'Handy: Filter anfangs zugeklappt');
  const sw = await pp.evaluate(() => document.documentElement.scrollWidth); assert(sw <= 390, 'kein seitliches Scrollen am Handy ' + sw);
  await pp.screenshot({ path: OUT + '/phone.png' });
  const small = await pp.$$eval('button, input, select', els => els.filter(e => e.offsetParent && !e.classList.contains('term') && e.getBoundingClientRect().height < 44).map(e => e.outerHTML.slice(0, 60)));
  assert(small.length === 0, 'alle Touch-Ziele >= 44pt ' + small.join(' | '));
  const swipeRight = () => pp.evaluate(async () => {
    const fire = (type, x) => {
      const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 });
      document.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
    };
    fire('touchstart', 5); for (let x = 20; x <= 200; x += 30) fire('touchmove', x); fire('touchend', 200);
    await new Promise(r => setTimeout(r, 500));
  });
  await pp.fill('#q', 'kasekuchen'); await pp.locator('.tile').first().click(); await pp.waitForTimeout(300);
  await pp.evaluate(() => window.RecipeApp.openDetail(Store.recipes().find(r => /Apfelkuchen/.test(r.title)).id)); await pp.waitForTimeout(300);
  assert(await pp.isVisible('dialog[open] h2:has-text("Apfelkuchen")'), 'Handy: verlinktes Rezept offen');
  await swipeRight();
  assert(await pp.isVisible('dialog[open] h2:has-text("Käsekuchen")'), 'Wischen vom Rand: zurück zum ursprünglichen Rezept');
  await swipeRight();
  assert(!(await pp.isVisible('dialog[open]')) && await pp.inputValue('#q') === 'kasekuchen', 'Wischen vom Rand: zurück zur Übersicht, Suche erhalten');
  // Als Home-Bildschirm-App (eigene Wischgeste): Rezept gleitet hinaus, ohne zurückzuspringen
  const st = await b.newContext({ ...devices['iPhone 13'] });
  await noCloud(st);
  await st.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const sp = await st.newPage(); sp.on('pageerror', e => errs.push(e.message));
  await sp.goto(URL); await sp.click('button:has-text("Beispielrezepte laden")');
  await sp.fill('#q', 'kasekuchen'); await sp.locator('.tile').first().click(); await sp.waitForTimeout(300);
  await sp.evaluate(() => window.RecipeApp.openDetail(Store.recipes().find(r => /Apfelkuchen/.test(r.title)).id)); await sp.waitForTimeout(300);
  const track = await sp.evaluate(async () => {
    const dlg = document.querySelector('#dlg'); const seen = [];
    const fire = (type, x) => {
      const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 });
      document.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
    };
    fire('touchstart', 5); for (let x = 20; x <= 200; x += 30) fire('touchmove', x);
    seen.push(dlg.style.transform);
    fire('touchend', 200);
    for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 40)); seen.push(dlg.style.transform + '|' + document.querySelector('#dlgTitle').textContent); }
    await new Promise(r => setTimeout(r, 500));
    seen.push(dlg.style.transform + '|' + document.querySelector('#dlgTitle').textContent);
    return seen;
  });
  assert(track[0].startsWith('translateX(') && track.slice(1, 4).every(x => x.startsWith('translateX(100%)|Apfelkuchen')),
    'App-Modus: Rezept folgt dem Finger und gleitet ohne Zurückspringen hinaus: ' + track.join(' / '));
  assert(track[5] === '|Käsekuchen ohne Boden', 'App-Modus: danach vorheriges Rezept an normaler Position: ' + track[5]);
  await st.close();
  // Wischen mitten im Fenster: links, rechts oder nach unten = zurück
  const gesture = (dx, dy, sel) => pp.evaluate(async ([dx, dy, sel]) => {
    const el = document.querySelector(sel || '#dlg .dlg-scroll') || document.querySelector('#dlg');
    const fire = (type, x, y) => {
      const t = new Touch({ identifier: 2, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
    };
    fire('touchstart', 200, 300);
    for (let i = 1; i <= 6; i++) fire('touchmove', 200 + dx * i / 6, 300 + dy * i / 6);
    fire('touchend', 200 + dx, 300 + dy);
    await new Promise(r => setTimeout(r, 450));
  }, [dx, dy, sel]);
  await pp.fill('#q', '');
  await pp.locator('.tile').first().click(); await pp.waitForTimeout(300);
  await gesture(-160, 5);
  assert(!(await pp.isVisible('dialog[open]')), 'Rezept: nach links wischen = zurück zur Übersicht');
  await pp.locator('.tile').first().click(); await pp.waitForTimeout(300);
  await gesture(160, 5);
  assert(!(await pp.isVisible('dialog[open]')), 'Rezept: nach rechts wischen = zurück');
  await pp.locator('.tile').first().click(); await pp.waitForTimeout(300);
  await gesture(0, 30);
  assert(await pp.isVisible('dialog[open]'), 'Kurzes Ziehen schließt nicht');
  await gesture(4, 180);
  assert(!(await pp.isVisible('dialog[open]')), 'Rezept: von oben nach unten ziehen = zurück');
  await pp.click('#btnImport'); await pp.click('#tilePhotos'); await pp.waitForTimeout(200);
  await gesture(150, 0);
  assert(await pp.isVisible('dialog[open] #importUrl') && !(await pp.isVisible('#importBack')), 'Hinzufügen-Unterseite: wischen = zurück zur Startseite von „Hinzufügen“');
  await gesture(0, 0, '#importUrl');
  await gesture(150, 0, '#importUrl');
  assert(await pp.isVisible('dialog[open]'), 'Im Eingabefeld wischen schließt nicht');
  await gesture(-150, 0);
  assert(!(await pp.isVisible('dialog[open]')), 'Hinzufügen: wischen = schließen');
  await pp.locator('.tile').first().click(); await pp.waitForTimeout(300);
  await pp.click('dialog >> text=Bearbeiten'); await pp.waitForTimeout(300);
  await gesture(-160, 0); await gesture(0, 200);
  assert(await pp.isVisible('#recipeForm'), 'Beim Bearbeiten schließt Wischen nichts (Eingaben bleiben)');
  await pp.click('dialog >> text=Abbrechen'); await pp.waitForTimeout(300);
  if (await pp.isVisible('dialog[open]')) await pp.click('dialog .icon-btn[aria-label=Schließen]');
  await pp.waitForTimeout(200);
  await pp.locator('.tile').first().click(); await pp.waitForTimeout(200);
  await pp.screenshot({ path: OUT + '/phone-detail.png' });
  if (!global.__nullWatch) global.__nullWatch = [];
  assert(global.__nullWatch.length === 0, 'Nirgends „null“ auf dem Bildschirm ' + global.__nullWatch.join(' | '));
  assert(errs.length === 0, 'keine Skriptfehler ' + errs.join('; '));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
