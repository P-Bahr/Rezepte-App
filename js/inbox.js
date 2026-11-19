/* Eingangsfach: Was über das Teilen-Menü (Apple-Kurzbefehl "Zu Rezepten") geschickt wurde,
   liegt im Online-Speicher bereit. Beim Öffnen der App erscheint unten ein Hinweis
   "1 geteiltes Rezept"; Antippen startet den Import (Link) bzw. zerlegt den Text. */
(function () {
  'use strict';
  const S = window.RecipeSync;
  if (!S || !S.enabled || !S.inbox) return;
  let busy = false;
  let items = [];

  function banner() {
    let el = document.getElementById('inboxBanner');
    if (!items.length) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'inboxBanner';
      el.className = 'update-banner inbox-banner';
      el.setAttribute('role', 'status');
    }
    const open = [...document.querySelectorAll('dialog[open]')].pop();
    (open || document.body).appendChild(el);
    el.textContent = '';
    const t = document.createElement('span');
    t.textContent = '📥 ' + (items.length === 1 ? '1 geteiltes Rezept' : items.length + ' geteilte Rezepte');
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'btn' + (items.length > 1 ? '' : ' btn-primary'); go.textContent = items.length > 1 ? 'Einzeln' : 'Ansehen';
    go.addEventListener('click', next);
    if (items.length > 1) {
      const all = document.createElement('button');
      all.type = 'button'; all.className = 'btn btn-primary'; all.id = 'inboxAll'; all.textContent = 'Alle importieren';
      all.addEventListener('click', importAll);
      el.textContent = '';
      el.append(t, all, go);
    }
    const later = document.createElement('button');
    later.type = 'button'; later.className = 'btn'; later.textContent = 'Später';
    later.addEventListener('click', () => el.remove());
    if (!el.querySelector('#inboxAll')) el.append(t, go); else el.append(go);
    el.append(later);
  }

  async function check() {
    if (busy || document.visibilityState === 'hidden') return;
    busy = true;
    try { items = await S.inbox(); } catch (e) { items = []; } finally { busy = false; }
    banner();
  }

  // Alle auf einmal: wie die Pinterest-Pinnwand (automatisch speichern, "Zu prüfen", Liste "Nicht geklappt")
  function importAll() {
    const el = document.getElementById('inboxBanner');
    if (el) el.remove();
    const A = window.RecipeApp;
    if (!A || !A.openBoardImport) return;
    const list = items.slice();
    items = [];
    const pins = list.map(it => {
      const input = String(it.input || '').trim();
      const link = ((input.match(/https?:\/\/[^\s<>"']+/i) || [''])[0]).replace(/[).,;!?]+$/, '');
      const text = input.replace(link, ' ').trim();
      return { id: it.id, link, url: link, text: text.length > 15 ? text : '', image: '' };
    });
    A.openBoardImport({ pins }, {
      title: 'Geteilte Rezepte importieren', word: 'Rezepte', textHow: 'social', batchPrefix: 'teilen-', autoStart: true,
      info: pins.length + ' geteilte Rezepte aus dem Eingangsfach.',
      afterEach: pin => S.inboxDone(pin.id)
    });
  }

  async function next() {
    const item = items.shift();
    const el = document.getElementById('inboxBanner');
    if (el) el.remove();
    if (!item) return;
    try { await S.inboxDone(item.id); } catch (e) { /* wird beim nächsten Mal wieder angezeigt */ }
    const A = window.RecipeApp;
    if (!A) return;
    const input = String(item.input || '').trim();
    const found = input.match(/https?:\/\/[^\s<>"']+/i);
    if (found) A.openImport(found[0].replace(/[).,;!?]+$/, ''), true);
    else {
      const d = window.RecipeImporter.fromText(input);
      A.openEdit(null, { ...d, fromShare: true });
    }
    // Wenn das Fenster wieder zu ist: weitere geteilte Rezepte anbieten
    const dlg = document.getElementById('dlg');
    if (dlg && items.length) {
      const again = () => { if (!dlg.open) { dlg.removeEventListener('close', again); banner(); } };
      dlg.addEventListener('close', again);
    }
  }

  S.whenSignedIn().then(() => setTimeout(check, 800));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(check, 300); });
  window.RecipeInbox = { check };
})();
