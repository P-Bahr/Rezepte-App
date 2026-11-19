/* Tote Links aufräumen: Quellen-Links (vor allem TikTok) werden regelmäßig geprüft.
   - TikTok alle 7 Tage, andere Seiten alle 30 Tage; höchstens ein Durchlauf pro Tag, je 20 Links
   - Entfernt wird ein Link erst, wenn er zweimal im Abstand von mindestens 6 Stunden eindeutig weg war
   - Das Rezept bleibt immer erhalten; nur der Link wird ersetzt durch "nicht mehr verfügbar"
   Die Prüf-Notizen liegen nur auf diesem Gerät (keine Abgleich-Konflikte). */
(function () {
  'use strict';
  const KEY = 'rezepte.linkpruefung';
  const DAY = 864e5;
  const HOUR = 36e5;
  const BATCH = 20;
  const isTikTok = u => /^https?:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(u);
  const interval = u => (isTikTok(u) ? 7 : 30) * DAY;

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.urls) return s; } catch (e) { /* neu */ }
    return { lastRun: 0, urls: {}, removed: 0, lastRemoved: [] };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* egal */ } }

  /* Reine Entscheidungslogik (getestet): wie geht es mit einem Link nach einem Prüfergebnis weiter?
     Rückgabe: { note, remove } */
  function decide(note, result, now) {
    note = note || { at: 0, fails: 0, firstFail: 0 };
    if (result === 'ok') return { note: { at: now, fails: 0, firstFail: 0 }, remove: false };
    if (result !== 'gone') return { note: { ...note, at: now }, remove: false }; // unklar: nichts tun
    const fails = note.fails + 1;
    const firstFail = note.fails ? note.firstFail : now;
    const remove = fails >= 2 && now - firstFail >= 6 * HOUR;
    // nach dem ersten "weg" bald noch einmal prüfen (statt erst in 7/30 Tagen)
    return { note: { at: now, fails, firstFail, soon: !remove }, remove };
  }

  // Welche Links sind dran? (bei "soon" nach 6 Stunden erneut)
  function due(recipes, s, now, all) {
    const seen = new Set();
    const out = [];
    for (const r of recipes) {
      const u = r.sourceUrl;
      if (!u || !/^https?:\/\//i.test(u) || seen.has(u)) continue;
      seen.add(u);
      const n = s.urls[u];
      const wait = n && n.soon ? 6 * HOUR : interval(u);
      if (all || !n || now - n.at >= wait) out.push(u);
    }
    // TikTok zuerst, dann die am längsten nicht geprüften
    return out.sort((a, b) => (isTikTok(b) - isTikTok(a)) || ((s.urls[a] || {}).at || 0) - ((s.urls[b] || {}).at || 0));
  }

  let running = null;
  /* Ein Prüfdurchlauf. opts.force: alle Links (Knopf "Jetzt prüfen"), sonst nur fällige und max. 1x täglich.
     Rückgabe: { checked, removed: [Titel], skipped } */
  async function run(opts) {
    opts = opts || {};
    const S = window.RecipeSync, Store = window.Store;
    if (!S || !S.enabled || !S.checkLinks || !S.email()) return { checked: 0, removed: [], skipped: 'offline' };
    if (running) return running;
    running = (async () => {
      const s = load();
      const now = Date.now();
      if (!opts.force && now - s.lastRun < DAY) return { checked: 0, removed: [], skipped: 'heute schon' };
      const list = due(Store.recipes(), s, now, !!opts.force);
      const todo = opts.force ? list : list.slice(0, BATCH);
      const removed = [];
      let checked = 0;
      for (let i = 0; i < todo.length; i += BATCH) {
        const part = todo.slice(i, i + BATCH);
        let results;
        try { results = await S.checkLinks(part); } catch (e) { break; } // offline o. ä.: später weiter
        for (const u of part) {
          const d = decide(s.urls[u], results[u] || 'unknown', Date.now());
          s.urls[u] = d.note;
          checked++;
          if (d.remove) {
            for (const r of Store.recipes().filter(x => x.sourceUrl === u)) {
              Store.saveRecipe({ ...r, sourceUrl: '', deadSourceUrl: u });
              removed.push(r.title);
            }
            delete s.urls[u];
          }
        }
        save(s);
      }
      s.lastRun = now;
      if (removed.length) { s.removed += removed.length; s.lastRemoved = removed.slice(0, 10); }
      // Notizen zu Links, die es in keinem Rezept mehr gibt, aufräumen
      const live = new Set(Store.recipes().map(r => r.sourceUrl).filter(Boolean));
      for (const u in s.urls) if (!live.has(u)) delete s.urls[u];
      save(s);
      return { checked, removed };
    })();
    try { return await running; } finally { running = null; }
  }

  function stats() {
    const s = load();
    const total = new Set((window.Store ? window.Store.recipes() : []).map(r => r.sourceUrl).filter(u => u && /^https?:/.test(u))).size;
    return { lastRun: s.lastRun, total, removed: s.removed, lastRemoved: s.lastRemoved };
  }

  // Automatisch: kurz nach dem Start und beim Zurückkehren in die App (höchstens 1x täglich)
  function auto() {
    const S = window.RecipeSync;
    if (!S || !S.enabled || !S.whenSignedIn) return;
    S.whenSignedIn().then(() => setTimeout(() => run().then(r => {
      if (r.removed && r.removed.length && window.RecipeToast) window.RecipeToast(r.removed.length === 1 ? '1 toter Link entfernt' : r.removed.length + ' tote Links entfernt');
    }).catch(() => {}), 8000));
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', auto);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') auto(); });
  }

  window.RecipeLinkCheck = { run, stats, decide, due, isTikTok };
})();
