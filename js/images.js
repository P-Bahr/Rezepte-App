/* Fotos zu Rezepten. Fotos werden verkleinert (lange Seite max. 1600 px, JPEG)
   und in der Gerätedatenbank (IndexedDB) gespeichert. Die fasst viel mehr als der
   normale Speicher (localStorage, ca. 5 MB), in den sonst nur 2–3 Handyfotos passen. */
(function () {
  'use strict';

  const DB = 'rezepte-bilder';
  const STORE = 'bilder';
  const MAX = 1600;
  let dbPromise = null;
  const urls = new Map(); // id -> blob:-Adresse (zwischengespeichert)

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(DB, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('Bildspeicher nicht verfügbar'));
        } catch (e) { reject(e); }
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      const req = fn(store);
      if (req) req.onsuccess = () => { result = req.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error('Bildspeicher-Fehler'));
      t.onabort = () => reject(t.error || new Error('Bildspeicher voll oder gesperrt'));
    }));
  }

  function id() {
    return 'bild-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  // Foto verkleinern -> JPEG-Blob
  function resize(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || 'image/')) { reject(new Error('Das ist kein Bild.')); return; }
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const hgt = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = hgt;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt); // transparente Bilder: weißer Hintergrund
        ctx.drawImage(img, 0, 0, w, hgt);
        URL.revokeObjectURL(src);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Das Bild konnte nicht verarbeitet werden.'))), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Das Bild konnte nicht geöffnet werden.')); };
      img.src = src;
    });
  }

  const Images = {
    resize,
    // Speichert ein Bild und gibt die neue ID zurück
    save(blob) {
      const key = id();
      return tx('readwrite', s => s.put(blob, key)).then(() => key);
    },
    // blob:-Adresse zum Anzeigen (oder null, wenn es das Bild nicht gibt)
    url(key) {
      if (!key) return Promise.resolve(null);
      if (urls.has(key)) return Promise.resolve(urls.get(key));
      return tx('readonly', s => s.get(key)).then(blob => {
        if (!blob) return null;
        const u = URL.createObjectURL(blob);
        urls.set(key, u);
        return u;
      });
    },
    remove(key) {
      if (!key) return Promise.resolve();
      if (urls.has(key)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); }
      return tx('readwrite', s => s.delete(key)).catch(() => {});
    }
  };

  window.RecipeImages = Images;
})();
