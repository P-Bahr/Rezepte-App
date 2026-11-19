# Rezepte-App

**App:** https://p-bahr.github.io/Rezepte-App/ (GitHub Pages aus dem Zweig `claude/recipe-app-ipad-mobile-7qk12y`)
**Online-Speicher:** Supabase-Projekt `raokoztpgowlsmfmmcbd` – eingerichtet, Abgleich zwischen Handy und iPad läuft, neue Konten gesperrt.

Eine eigene Rezept-App für iPad und Handy. Sie läuft als Web-App, die man auf den Home-Bildschirm legt.

## Stand

**Schritt 1 (Grundgerüst):** fertig zum Ausprobieren
- Übersicht aller Rezepte als Kacheln
- Suche, die Umlaute, Wortteile und kleine Tippfehler verzeiht („hahnchen“ findet „Hähnchenbrust“, „brownis“ findet „Brownies“)
- Filterchips für Sammlung, Rezeptart, Hauptzutat und Zubereitung, mit Trefferzahl; einklappbar, Reihenfolge der Filterzeilen frei anordnen
- Sortieren: A–Z, Neueste, Schnellste
- Rezept öffnet sich als Fenster über der Übersicht, Suche und Filter bleiben erhalten
- Personen-Regler im Rezept: startet bei 4 Personen, rechnet alle Mengen um (z. B. „1 kg“ für 2 → „500 g“ für 1)
- Einheit als Auswahl: Personen, Stück, Gläser, Blech, Springform, Kastenform; Größenfeld nur bei Formen
- Kuchen: Umschalter Springform ↔ Blech und Durchmesser 12–32 cm, Mengen nach Bodenfläche
- Zeit wird automatisch aus den Schritten geschätzt (Zeitangaben im Text + Arbeitsschritte wie Schneiden nach Menge)
- „Bio“ wird aus Zutaten entfernt
- Eier immer als ganze Zahl
- Gläser mit Glasgröße (150 ml bis 1 l), im Rezept umstellbar, Mengen nach Inhalt
- Fachbegriffe (blanchieren, ablöschen, Ober-/Unterhitze …) antippen für eine kurze Erklärung; Alltagswörter wie EL werden nicht erklärt
- Zutaten als Text in beliebiger Reihenfolge („Mehl 200g“, „Eier 4“, „eine Prise Salz“); Vorschau zeigt die Erkennung, gespeichert wird einheitlich („200 g Mehl“)
- Doppelte Rezepte (auch mit anderem Namen oder für andere Personenzahl) werden erkannt: beim Speichern Rückfrage, beim Abgleich automatisch nur einmal
- Favoriten: Stern im Rezept, fester Chip „★ Favoriten“ ganz vorn
- Foto aufnehmen oder auswählen (verkleinert, im Bildspeicher des Geräts), alternativ Bild-Adresse
- Beim Bearbeiten: antippbare Vorschläge für Rezeptart, Hauptzutat und Zubereitung aus den eigenen Rezepten
- Alternativen für ausgefallene Zutaten („Dijon-Senf → mittelscharfer Senf“)
- Leere Sammlung nach dem Verschieben direkt löschbar
- Notizen zeigen erwähnte eigene Rezepte als „Passt dazu ›“-Knopf („Dazu passen die Ofenkartoffeln“); × und Wischen vom linken Rand führen zum vorherigen Rezept zurück
- Rezepte anlegen, bearbeiten und löschen; Sammlungen anlegen, umbenennen und löschen
- 25 Beispielrezepte; unter „Sammlungen“ hinzufügen oder alle auf einmal entfernen
- Online-Abgleich (Supabase): Anmeldung mit E-Mail und Passwort, Rezepte, Sammlungen und Fotos auf allen Geräten; funktioniert auch offline und gleicht später ab; wurde ein Rezept auf zwei Geräten geändert, zeigt ein Fenster beide Versionen zur Auswahl

**Als Nächstes (Import), abgesprochene Reihenfolge:**
1. ✅ Rezeptseiten importieren über die eingebetteten Rezeptangaben (schema.org), kostenlos – gebaut, Server-Programm muss einmalig eingerichtet werden
2. ✅ TikTok-Beschreibung abrufen (oEmbed) und mit der eigenen Zutatenerkennung zerlegen, kostenlos – gebaut
3. **Bildschirmfotos importieren (Pflicht):** Foto(s) teilen oder auswählen; Texterkennung kostenlos in der App, optional per KI genauer (ca. 1 Cent)
4. Instagram prüfen (offizieller Zugang nötig)
5. Eigene Mini-KI für Rezeptart, Hauptzutat, Zubereitung (in der App, kostenlos)
6. Zählen pro Konto und Obergrenze für KI-Importe gleich mit einbauen
Kein Auslesen direkt aus Videos (bewusst weggelassen).

**Technische Notizen Import + KI:**
- Import-Funktion als Supabase Edge Function (kein weiteres Konto nötig); liest Webseiten, später TikTok/Instagram/Pinterest
- Dafür nötig: ein Claude-API-Schlüssel (console.anthropic.com), sicher als Geheimnis in Supabase hinterlegt, nie in der App
- Doppelte-Rezepte-Prüfung (js/dupes.js) auch beim Import anwenden

**Plan:**
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
| `js/forms.js` | Einheiten, Backformen und ihre Flächen |
| `js/substitutes.js` | Alternativen für ausgefallene Zutaten |
| `js/glossary.js` | Erklärungen für Kochbegriffe |
| `js/sync.js` | Online-Abgleich und Anmeldung |
| `js/config.js` | Zugangsdaten für den Online-Speicher |
| `supabase/einrichtung.sql` | Datenbank-Einrichtung (einmal in Supabase ausführen) |
| `js/vendor/supabase.js` | Supabase-Bibliothek 2.45.4 (MIT-Lizenz) |
| `js/importer.js` | Import: Rezeptseiten und freien Text in Rezepte umwandeln |
| `supabase/functions/import/index.ts` | Server-Programm: Rezeptseite abrufen (Supabase Edge Function) |
| `js/dupes.js` | Doppelte Rezepte erkennen |
| `js/images.js` | Fotos verkleinern und im Bildspeicher (IndexedDB) ablegen |
| `js/app.js` | Bedienoberfläche |
| `js/examples.js` | Beispielrezepte |
| `tests/app.test.js` | Automatischer Test im Browser |
| `tests/sync.test.js` | Regeln für das Zusammenführen (`node tests/sync.test.js`) |
| `tests/sync-e2e.test.js` | Zwei Geräte mit nachgebautem Online-Speicher |
| `tests/import.test.js` | Import ohne Netz (`node --experimental-strip-types tests/import.test.js`) |
| `tests/import-e2e.test.js` | Import im Browser mit nachgebautem Server |
| `tests/scale.test.js` | Test der Mengen-Umrechnung (`node tests/scale.test.js`) |

Lokal starten: `python3 -m http.server 8123 --bind 127.0.0.1`, dann `node tests/app.test.js` für den Test.
