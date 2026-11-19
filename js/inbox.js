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
    go.type = 'button'; go.className = 'btn btn-primary'; go.textContent = 'Ansehen';
    go.addEventListener('click', next);
    const later = document.createElement('button');
    later.type = 'button'; later.className = 'btn'; later.textContent = 'Später';
    later.addEventListener('click', () => el.remove());
    el.append(t, go, later);
  }

  async function check() {
    if (busy || document.visibilityState === 'hidden') return;
    busy = true;
    try { items = await S.inbox(); } catch (e) { items = []; } finally { busy = false; }
    banner();
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
