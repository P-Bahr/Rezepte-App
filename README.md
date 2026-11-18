# Rezepte-App

Eine eigene Rezept-App für iPad und Handy. Sie läuft als Web-App, die man auf den Home-Bildschirm legt.

## Stand

**Schritt 1 (Grundgerüst):** fertig zum Ausprobieren
- Übersicht aller Rezepte als Kacheln
- Suche, die Umlaute, Wortteile und kleine Tippfehler verzeiht („hahnchen“ findet „Hähnchenbrust“, „brownis“ findet „Brownies“)
- Filterchips für Sammlung, Rezeptart, Hauptzutat und Zubereitung, mit Trefferzahl
- Rezept öffnet sich als Fenster über der Übersicht, Suche und Filter bleiben erhalten
- Personen-Regler im Rezept: startet bei 4 Personen, rechnet alle Mengen um (z. B. „1 kg“ für 2 → „500 g“ für 1)
- Blech- und Formgröße; bei runden Formen (Ø) zweiter Regler (12–32 cm, 2-cm-Schritte wie im Handel), der nach Fläche umrechnet
- Zeit wird automatisch aus den Schritten geschätzt (Zeitangaben im Text + Arbeitsschritte wie Schneiden nach Menge)
- „Bio“ wird aus Zutaten entfernt
- Leere Sammlung nach dem Verschieben direkt löschbar
- Notizen verlinken andere eigene Rezepte, die dort erwähnt werden („Dazu passen die Ofenkartoffeln“); × und Wischen vom linken Rand führen zum vorherigen Rezept zurück
- Rezepte anlegen, bearbeiten und löschen; Sammlungen anlegen, umbenennen und löschen
- Speichern **nur auf diesem Gerät** (vorläufig)

**Als Nächstes:**
1. Speichern online, damit alle Geräte dieselben Rezepte sehen
2. KI erkennt Rezeptart, Hauptzutat und Zubereitung automatisch
3. Import von Webseiten
4. Import aus TikTok, Instagram und Pinterest über das Teilen-Menü (per Apple-Kurzbefehl)
5. Rezepte aus Videos auslesen
6. Zutaten an die Einkaufslisten-App **Bring!** schicken (mit den Mengen, die gerade am Personen-Regler eingestellt sind)

## Aufbau (für Entwickler)

Reines HTML, CSS und JavaScript, ohne Bauwerkzeuge.

| Datei | Aufgabe |
|---|---|
| `index.html` | Seitengerüst |
| `css/app.css` | Aussehen (Systemschrift, 17 pt Text, Touch-Ziele mindestens 44 pt, heller und dunkler Modus) |
| `js/store.js` | Datenspeicher; hier wird später die Online-Datenbank angeschlossen |
| `js/search.js` | Suchlogik |
| `js/scale.js` | Mengen auf andere Personenzahlen umrechnen |
| `js/links.js` | Erwähnte Rezepte in Notizen finden |
| `js/time.js` | Zubereitungszeit schätzen |
| `js/app.js` | Bedienoberfläche |
| `js/examples.js` | Beispielrezepte |
| `tests/app.test.js` | Automatischer Test im Browser |
| `tests/scale.test.js` | Test der Mengen-Umrechnung (`node tests/scale.test.js`) |

Lokal starten: `python3 -m http.server 8123 --bind 127.0.0.1`, dann `node tests/app.test.js` für den Test.
