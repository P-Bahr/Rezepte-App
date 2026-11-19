/* Neue Version erkennen: Beim Öffnen (und beim Zurückkehren in die App) wird
   version.json ohne Zwischenspeicher abgefragt. Ist sie neuer als die laufende
   Version, werden Seite, Skripte und Stile frisch geholt und die App neu geladen.
   Wird gerade ein Rezept bearbeitet, erscheint stattdessen ein Hinweis. */
(function () {
  'use strict';
  const meta = document.querySelector('meta[name="app-version"]');
  const current = meta ? meta.content : '';
  if (!current || !window.fetch) return;
  const TRIED = 'rezepte.update.versucht';
  let busy = false;

  function editing() {
    const dlg = document.getElementById('dlg');
    return dlg && dlg.open && !!document.getElementById('recipeForm');
  }

  async function refreshFiles() {
    const urls = ['./', './index.html']
      .concat([...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')))
      .concat([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href')));
    await Promise.all(urls.map(u => fetch(u, { cache: 'reload' }).catch(() => null)));
  }

  function banner(text, withButton) {
    let el = document.getElementById('updateBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'updateBanner';
      el.className = 'update-banner';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text + ' ';
    if (withButton) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-primary'; b.textContent = 'Jetzt laden';
      b.addEventListener('click', () => apply(true));
      el.appendChild(b);
    }
  }

  async function apply(force) {
    banner('Neue Version wird geladen …', false);
    await refreshFiles();
    location.reload();
  }

  async function check() {
    if (busy || !navigator.onLine) return;
    busy = true;
    try {
      const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const latest = (await res.json()).version;
      if (!latest || latest === current) { try { sessionStorage.removeItem(TRIED); } catch (e) { /* egal */ } return; }
      let tried = null;
      try { tried = sessionStorage.getItem(TRIED); } catch (e) { /* egal */ }
      if (tried === latest) { banner('Neue Version verfügbar. Bitte die App schließen und neu öffnen.', false); return; }
      try { sessionStorage.setItem(TRIED, latest); } catch (e) { /* egal */ }
      if (editing()) banner('Neue Version verfügbar.', true);
      else await apply();
    } catch (e) { /* offline o. ä.: später erneut */ } finally { busy = false; }
  }

  window.addEventListener('load', () => setTimeout(check, 500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.RecipeUpdate = { check, current };
})();
