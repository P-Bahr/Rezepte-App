# Rezepte-App

**App:** https://p-bahr.github.io/Rezepte-App/ (GitHub Pages aus dem Zweig `claude/recipe-app-ipad-mobile-7qk12y`)
**Online-Speicher:** Supabase-Projekt `raokoztpgowlsmfmmcbd` – eingerichtet, Abgleich zwischen Handy und iPad läuft, neue Konten gesperrt.

Eine eigene Rezept-App für iPad und Handy. Sie läuft als Web-App, die man auf den Home-Bildschirm legt.

## Stand

**Schritt 1 (Grundgerüst):** fertig zum Ausprobieren
- Übersicht aller Rezepte als Kacheln
- Suche, die Umlaute, Wortteile und kleine Tippfehler verzeiht („hahnchen“ findet „Hähnchenbrust“, „brownis“ findet „Brownies“)
- Feste Sammlungen automatisch aus der Zubereitung: Ofen, Pfanne, Topf, Grill, Kalt (js/collections.js); keine Auswahl beim Anlegen/Import
- Filterchips für Sammlung, Rezeptart und Hauptzutat (als feste Gruppen: Fleisch, Fisch, Nudeln, Kartoffeln, Reis & Getreide, Hülsenfrüchte, Käse & Eier, Obst, Süßes, Gemüse, Sonstiges), mit Trefferzahl; einklappbar, Reihenfolge der Filterzeilen frei anordnen
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
- 25 Beispielrezepte; unter „Einstellungen“ hinzufügen oder alle auf einmal entfernen
- Online-Abgleich (Supabase): Anmeldung mit E-Mail und Passwort, Rezepte, Sammlungen und Fotos auf allen Geräten; funktioniert auch offline und gleicht später ab; wurde ein Rezept auf zwei Geräten geändert, zeigt ein Fenster beide Versionen zur Auswahl

**Hinzufügen / Import** (Knopf „+ Hinzufügen“, js/app.js `openImport`): ✅ fertig
- Startseite: ein Feld für Link oder Rezepttext (erkennt selbst; Einsetzen startet den Import), Kacheln: Selbst eintragen, Bildschirmfotos (ein Rezept / viele Rezepte je Foto), Pinterest-Pinnwand, Aus anderer App (Recipe Keeper), Über Teilen (Anleitung Kurzbefehl); Eingangsfach-Hinweis „Alle importieren“
- Quellen: Rezeptseiten (JSON-LD, Microdata wie Kaufland, Seitentext als Notlösung), TikTok (Beschreibung aus der Videoseite, Kurzlinks), Facebook (og:title), Pinterest-Pin (Widget-API → Rezeptseite), Pinterest-Pinnwand (neueste 50, direkt vom Gerät), Bildschirmfotos (Tesseract auf dem Gerät), Text, Recipe-Keeper-Export (.zip mit Fotos, js/rkimport.js), Teilen-Menü über Apple-Kurzbefehl → Eingangsfach (supabase/eingang.sql, js/inbox.js)
- Instagram gestrichen (nur mit Meta-Prüfung); offizieller Pinterest-Zugang (alle Pins) erst bei Veröffentlichung
- Sammelimporte (openBoardImport): automatisch speichern, „Zu prüfen“ mit konkreten Prüf-Hinweisen (reviewHints), „Passt ✓“ springt zum nächsten, Liste „Nicht geklappt“, Doppelte überspringen, „Import rückgängig“
- Aufräumen beim Import (js/importer.js): Werbung/Zusätze aus Namen (tidyTitle, auch für gespeicherte Rezepte), „wir/ich“-Erzählstil → kurze Anweisungen (condense), pro Satz ein Schritt, Tassen/oz/lb direkt in g/ml (doppelte Angaben nur metrisch), Abkürzungen ausschreiben, Packungsgröße in Klammern, Brüche ½, Doppelpunkte/Klammern/@-Werbung weg
- Schätzungen: Rezeptart (Titel vor Seitenkategorie), Zubereitung, Hauptzutat (Name vor Menge; bei Dessert/Snack/Gebäck nur aus dem Namen), Portionen (ohne Angabe 4 Personen, kein Hinweis); ungeprüfte Importe werden beim Laden mit den aktuellen Regeln neu geschätzt (store.js autoSort)

**Weitere Funktionen:** ✅ Bring!-Export (Vorrat wie Salz/Öl/Milch wird abgefragt statt mitgeschickt; Server erzeugt Rezeptseite aus Link-Daten, GET ?bring=…) · Chip „One Pot“ (nicht für Kuchen/Desserts) · Hauptzutat-Filter als feste Gruppen (js/maingroups.js) · Sicherung als .zip mit Fotos und Einspielen (js/backup.js) · Startassistent nur bei leerer App · „Nach oben“-Knopf · Tote Links prüfen (TikTok alle 7, sonst 30 Tage; entfernt nach zweimal „weg“)

**Offen / später:** Kurzbefehl auf dem iPad einrichten (Anleitung unter Einstellungen → Teilen einrichten) · App Store (Capacitor, 99 €) · offizieller Pinterest-Zugang · KI für Kategorien (kostet, Anthropic-Konto) · Nutzerin wünscht: vor größeren Änderungen fragen, Deutsch, einfache genaue Schritte

**Vor jeder Veröffentlichung:** `./tools/alle-tests.sh <scratch>` muss „ALLE TESTS OK“ melden, dann `./tools/neue-version.sh` – geöffnete Apps erkennen die neue Version (version.json).

**Server-Programm aktualisieren:** `curl -X POST "https://api.supabase.com/v1/projects/raokoztpgowlsmfmmcbd/functions/deploy?slug=import" -H "Authorization: Bearer <Zugangsschlüssel>" -F 'metadata={"entrypoint_path":"index.ts","name":"import","verify_jwt":false};type=application/json' -F 'file=@supabase/functions/import/index.ts;filename=index.ts'`

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
| `js/linkcheck.js` | Tote Quellen-Links regelmäßig prüfen und entfernen |
| `js/collections.js` | Feste Sammlungen aus der Zubereitung |
| `js/ocr.js` | Text aus Bildschirmfotos erkennen (auf dem Gerät) |
| `js/vendor/tesseract/` | Tesseract.js 5.1.1 + deutsche Sprachdaten (Apache-2.0) |
| `js/inbox.js` | Eingangsfach für geteilte Rezepte (Kurzbefehl) |
| `supabase/eingang.sql` | Einrichtung Eingangsfach + Teilen-Schlüssel (einmal ausführen) |
| `js/maingroups.js` | Hauptzutat -> feste Gruppe für den Filter (Fleisch, Fisch, Nudeln …) |
| `js/rkimport.js` | Import aus Recipe Keeper (Export-zip mit recipes.html und Fotos) |
| `js/vendor/jszip.min.js` | JSZip 3.10.1 zum Entpacken (MIT) |
| `js/backup.js` | Sicherung aller Rezepte mit Fotos als .zip und Einspielen |
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
