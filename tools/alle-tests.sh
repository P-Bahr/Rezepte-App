#!/bin/sh
# Führt alle Tests aus; Ende mit Fehlercode, sobald einer fehlschlägt.
# Voraussetzung: lokaler Server, z. B. python3 -m http.server 8123 --bind 127.0.0.1
cd "$(dirname "$0")/.."
OUT=${1:-/tmp}
fail=0
run() { echo "== $1"; shift; out=$("$@" 2>&1); echo "$out" | grep -v '^ok' | grep -v '^    ' ; echo "$out" | grep -q -E 'FEHLER|Error|Timeout|exceeded' && fail=1; }
run "Umrechnung"        node tests/scale.test.js
run "Abgleich-Regeln"   node tests/sync.test.js
run "Link-Prüfung"      node tests/linkcheck.test.js
run "Import"            node --experimental-strip-types --no-warnings tests/import.test.js
run "App"               node tests/app.test.js "$OUT"
run "Import im Browser" node --experimental-strip-types --no-warnings tests/import-e2e.test.js
run "Zwei Geräte"       node tests/sync-e2e.test.js
[ $fail -eq 0 ] && echo "ALLE TESTS OK" || echo "TESTS FEHLGESCHLAGEN"
exit $fail
