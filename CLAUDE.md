# Rezepte-App – Hinweise für Claude

## Zusammenarbeit
- Deutsch, einfache Worte, genaue Tipp-Anleitungen, keine Fachbegriffe. Kurz, aber über alles Wichtige informieren.
- Vor größeren Änderungen fragen. Nur bauen, was gewünscht ist; eigene Ideen vorher vorschlagen.
- Funktion vor Aussehen. Touch-Flächen mindestens 44 pt, Text 17 pt.
- Aussehen ändern: immer Vorher/Nachher-Bilder vom gleichen Bildschirm nebeneinander zeigen und auf „Go“ warten.
- Rot-Grün-Schwäche: kein Grün/Orange/Gelb als Unterscheidungsfarbe.
- Vor jedem Commit: `./tools/alle-tests.sh <scratchpad>` muss „ALLE TESTS OK“ melden, dann `./tools/neue-version.sh`.

## Sicherheit
- Nie einen Supabase-„service_role“-/„secret“-Schlüssel verlangen oder annehmen. Schlüssel nie in den Chat einfügen lassen.
- Keine Testkonten im Supabase-Projekt anlegen. Private Daten (Sicherungen, Exporte) nie ins Repository.
- Der Anthropic-Schlüssel liegt nur als Supabase-Secret `ANTHROPIC_API_KEY`.

## Supabase-Zugangsschlüssel erneuern (zum Einspielen des Import-Programms)
Zeichen, dass er abgelaufen ist: Das Einspielen antwortet mit `401 Invalid access token`.
Dann der Nutzerin **diese Anleitung komplett auf einmal** geben (sie möchte die Fragen nicht noch einmal stellen müssen):

1. In Safari **supabase.com/dashboard/account/tokens** öffnen und anmelden.
2. **Generate new token** antippen.
3. Name z. B. „Rezepte-Claude“, Ablaufzeit z. B. 90 Tage.
4. Bei der Frage **Projekt oder Organisation**: **Projekt** wählen, dann das Rezepte-Projekt.
5. Bei den **Berechtigungen**: **Application services** aufklappen → **Edge Functions** auf **Read and write**. Alles andere so lassen (kein Zugriff).
6. **Review access** → **Generate token**, den Token kopieren (wird nur einmal angezeigt).
7. Nicht in den Chat einfügen. Kurz „Token ist da“ schreiben – Claude öffnet dann das sichere Eingabefeld (Host `api.supabase.com`), dort einfügen.
   Falls das Feld nicht erscheint: oben im Chat das Umgebungs-Menü (Cloud-Umgebung) → Bearbeiten → Network secrets → Adresse `api.supabase.com`, Token einfügen.

Danach einspielen mit:
```
curl -X POST "https://api.supabase.com/v1/projects/raokoztpgowlsmfmmcbd/functions/deploy?slug=import" -H "Authorization: Bearer proxy-injected" -F 'metadata={"entrypoint_path":"index.ts","name":"import","verify_jwt":false};type=application/json' -F 'file=@supabase/functions/import/index.ts;filename=index.ts;type=application/typescript'
```
Prüfen: Ein Aufruf ohne Anmeldung muss `401 „Bitte in der App neu anmelden.“` liefern.

## Anthropic-Schlüssel (KI-Import)
Läuft er ab oder ist das Guthaben leer, zeigt die App oben in den Einstellungen einen Hinweis. Neuer Schlüssel: console.anthropic.com → API Keys → Create Key, dann in Supabase unter Edge Functions → Secrets bei `ANTHROPIC_API_KEY` eintragen (die Nutzerin selbst, nie über den Chat). Guthaben: console.anthropic.com → Billing.
