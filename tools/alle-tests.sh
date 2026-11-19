#!/bin/sh
# Führt alle Tests aus und startet dafür einen eigenen lokalen Testserver.
# Ein Test gilt nur als bestanden, wenn er sich mit Erfolg (Exit-Code 0) beendet.
cd "$(dirname "$0")/.."
OUT=${1:-/tmp}
PORT=8123
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
# warten, bis der Server antwortet
i=0; until curl -s -o /dev/null "http://127.0.0.1:$PORT/" || [ $i -ge 50 ]; do i=$((i+1)); sleep 0.1; done
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then echo "Testserver startet nicht (Port $PORT belegt?)"; exit 1; fi
fail=0
run() {
  name=$1; shift
  echo "== $name"
  out=$("$@" 2>&1); code=$?
  echo "$out" | grep -v '^ok' | grep -v '^    '
  echo "   ($(echo "$out" | grep -c '^ok') Einzelprüfungen bestanden)"
  if [ $code -ne 0 ]; then echo "!! $name FEHLGESCHLAGEN (Exit-Code $code)"; fail=1; fi
}
run "Umrechnung"        node tests/scale.test.js
run "Abgleich-Regeln"   node tests/sync.test.js
run "Link-Prüfung"      node tests/linkcheck.test.js
run "Import"            node --experimental-strip-types --no-warnings tests/import.test.js
run "App"               node tests/app.test.js "$OUT"
run "Import im Browser" node --experimental-strip-types --no-warnings tests/import-e2e.test.js
run "Zwei Geräte"       node tests/sync-e2e.test.js
[ $fail -eq 0 ] && echo "ALLE TESTS OK" || echo "TESTS FEHLGESCHLAGEN"
exit $fail
