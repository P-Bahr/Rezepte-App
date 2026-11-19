/* Neue Version erkennen: Beim Öffnen (und beim Zurückkehren in die App) wird
   version.json ohne Zwischenspeicher abgefragt. Ist sie neuer als die laufende
   Version, erscheint oben ein Hinweis mit "Jetzt laden"; erst beim Antippen werden
   Seite, Skripte und Stile frisch geholt und die App neu geladen. */
(function () {
  'use strict';
  const meta = document.querySelector('meta[name="app-version"]');
  const current = meta ? meta.content : '';
  if (!current || !window.fetch) return;
  const TRIED = 'rezepte.update.versucht';
  let busy = false;

  let dismissed = '';

  async function refreshFiles() {
    const urls = ['./', './index.html']
      .concat([...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')))
      .concat([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href')));
    await Promise.all(urls.map(u => fetch(u, { cache: 'reload' }).catch(() => null)));
  }

  function banner(text, latest) {
    let el = document.getElementById('updateBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'updateBanner';
      el.className = 'update-banner';
      el.setAttribute('role', 'status');
    }
    // Über offenen Fenstern (Rezept, Anmeldung) liegen: dann im obersten Fenster anzeigen
    const open = [...document.querySelectorAll('dialog[open]')].pop();
    (open || document.body).appendChild(el);
    el.textContent = '';
    const t = document.createElement('span');
    t.textContent = text;
    el.appendChild(t);
    if (latest) {
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'btn btn-primary'; go.textContent = 'Jetzt laden';
      go.addEventListener('click', () => apply(latest));
      const later = document.createElement('button');
      later.type = 'button'; later.className = 'btn'; later.textContent = 'Später';
      later.addEventListener('click', () => { dismissed = latest; el.remove(); });
      el.append(go, later);
    }
  }

  async function apply(latest) {
    try { sessionStorage.setItem(TRIED, latest); } catch (e) { /* egal */ }
    banner('Neue Version wird geladen …');
    await refreshFiles();
    location.reload();
  }

  // Rückgabe: 'neu' | 'aktuell' | 'offline'
  async function check(manual) {
    if (busy) return 'aktuell';
    if (!navigator.onLine) return 'offline';
    busy = true;
    try {
      const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return 'offline';
      const latest = (await res.json()).version;
      if (!latest || latest === current) { try { sessionStorage.removeItem(TRIED); } catch (e) { /* egal */ } return 'aktuell'; }
      if (latest === dismissed && !manual) return 'neu';
      let tried = null;
      try { tried = sessionStorage.getItem(TRIED); } catch (e) { /* egal */ }
      // Laden hat schon einmal nicht geholfen (Zwischenspeicher des Geräts) -> erklären statt wiederholen
      if (tried === latest) banner('Neue Version verfügbar, aber noch nicht geladen. Bitte die App schließen und in ein paar Minuten neu öffnen.');
      else banner('Neue Version verfügbar.', latest);
      return 'neu';
    } catch (e) { return 'offline'; } finally { busy = false; }
  }

  window.addEventListener('load', () => setTimeout(() => check(), 500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.RecipeUpdate = { check, current };
})();
