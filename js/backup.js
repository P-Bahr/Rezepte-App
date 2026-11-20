/* Sicherung: alle Rezepte (und Fotos) als eine Datei zum Ablegen in Dateien/iCloud – und wieder einspielen.
   Aufbau der Datei: rezepte-sicherung.json + fotos/<Bild-ID>.jpg in einer .zip */
(function () {
  'use strict';
  const LAST = 'rezepte.letzteSicherung';

  function loadZipLib() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jszip.min.js';
      s.onload = () => res(window.JSZip);
      s.onerror = () => rej(new Error('Das Pack-Programm konnte nicht geladen werden. Bitte mit Internet erneut versuchen.'));
      document.head.append(s);
    });
  }
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // Sicherung erstellen -> { file, count, photos }
  async function create(progress) {
    const JSZip = await loadZipLib();
    const snap = window.Store._snapshot();
    const recipes = snap.recipes;
    const zip = new JSZip();
    zip.file('rezepte-sicherung.json', JSON.stringify({ app: 'Rezepte', version: 1, created: new Date().toISOString(), recipes, collections: snap.collections }, null, 1));
    let photos = 0;
    const ids = [...new Set(recipes.map(r => r.imageId).filter(Boolean))];
    for (let i = 0; i < ids.length; i++) {
      if (progress) progress('Fotos werden eingepackt … ' + (i + 1) + ' von ' + ids.length);
      try { const b = await window.RecipeImages.blob(ids[i]); if (b) { zip.file('fotos/' + ids[i] + '.jpg', b); photos++; } } catch (e) { /* Foto fehlt auf diesem Gerät */ }
    }
    if (progress) progress('Datei wird erstellt …');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const file = new File([blob], 'Rezepte-Sicherung-' + today() + '.zip', { type: 'application/zip' });
    return { file, count: recipes.length, photos };
  }

  // Datei weitergeben: auf dem iPhone über das Teilen-Menü ("In Dateien sichern"), sonst herunterladen
  async function deliver(file) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return 'geteilt'; }
      catch (e) { if (e && e.name === 'AbortError') return 'abgebrochen'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return 'heruntergeladen';
  }

  async function backup(progress) {
    const r = await create(progress);
    const how = await deliver(r.file);
    if (how !== 'abgebrochen') { try { localStorage.setItem(LAST, new Date().toISOString()); } catch (e) { /* egal */ } }
    return { ...r, how };
  }

  // Sicherung einspielen: fehlende Rezepte und ihre Fotos kommen dazu, vorhandene bleiben unverändert
  async function restore(file, progress) {
    const JSZip = await loadZipLib();
    let zip;
    try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('Die Datei konnte nicht geöffnet werden. Ist es eine Rezepte-Sicherung (.zip)?'); }
    const jf = zip.file('rezepte-sicherung.json');
    if (!jf) throw new Error('Das ist keine Rezepte-Sicherung. (Für Recipe Keeper bitte „Importieren → Aus anderer App“ nehmen.)');
    let data;
    try { data = JSON.parse(await jf.async('string')); } catch (e) { throw new Error('Die Sicherung ist beschädigt.'); }
    const have = new Set(window.Store.recipes().map(r => r.id));
    const neu = (data.recipes || []).filter(r => r && r.id && !have.has(r.id));
    let i = 0;
    for (const r of neu) {
      i++;
      if (!r.imageId) continue;
      const f = zip.file('fotos/' + r.imageId + '.jpg');
      if (progress) progress('Fotos werden eingespielt … ' + i + ' von ' + neu.length);
      if (f) { try { await window.RecipeImages.put(r.imageId, await f.async('blob')); } catch (e) { /* ohne Foto */ } }
    }
    const added = window.Store.restore(neu);
    return { added, total: (data.recipes || []).length, skipped: (data.recipes || []).length - added, created: data.created };
  }

  const last = () => { try { return localStorage.getItem(LAST) || ''; } catch (e) { return ''; } };
  window.RecipeBackup = { backup, restore, create, last };
})();
