# Rezepte-App

Eine eigene Rezept-App für iPad und Handy. Sie läuft als Web-App, die man auf den Home-Bildschirm legt.

## Stand

**Schritt 1 (Grundgerüst):** fertig zum Ausprobieren
- Übersicht aller Rezepte als Kacheln
- Suche, die Umlaute, Wortteile und kleine Tippfehler verzeiht („hahnchen“ findet „Hähnchenbrust“, „brownis“ findet „Brownies“)
- Filterchips für Sammlung, Rezeptart, Hauptzutat und Zubereitung, mit Trefferzahl
- Rezept öffnet sich als Fenster über der Übersicht, Suche und Filter bleiben erhalten
- Rezepte anlegen, bearbeiten und löschen; Sammlungen anlegen, umbenennen und löschen
- Speichern **nur auf diesem Gerät** (vorläufig)

**Als Nächstes:**
1. Speichern online, damit alle Geräte dieselben Rezepte sehen
2. KI erkennt Rezeptart, Hauptzutat und Zubereitung automatisch
3. Import von Webseiten
4. Import aus TikTok, Instagram und Pinterest über das Teilen-Menü (per Apple-Kurzbefehl)
5. Rezepte aus Videos auslesen

## Aufbau (für Entwickler)

Reines HTML, CSS und JavaScript, ohne Bauwerkzeuge.

| Datei | Aufgabe |
|---|---|
| `index.html` | Seitengerüst |
| `css/app.css` | Aussehen (Systemschrift, 17 pt Text, Touch-Ziele mindestens 44 pt, heller und dunkler Modus) |
| `js/store.js` | Datenspeicher; hier wird später die Online-Datenbank angeschlossen |
| `js/search.js` | Suchlogik |
| `js/app.js` | Bedienoberfläche |
| `js/examples.js` | Beispielrezepte |
| `tests/app.test.js` | Automatischer Test im Browser |

Lokal starten: `python3 -m http.server 8123 --bind 127.0.0.1`, dann `node tests/app.test.js` für den Test.
