#!/bin/sh
# Vor jeder Veröffentlichung ausführen: setzt eine neue Versionsnummer,
# damit geöffnete Apps die neue Version erkennen und selbst laden.
set -e
cd "$(dirname "$0")/.."
V=$(date -u +%Y-%m-%dT%H:%M:%S)
sed -i "s|<meta name=\"app-version\" content=\"[^\"]*\">|<meta name=\"app-version\" content=\"$V\">|" index.html
printf '{ "version": "%s" }\n' "$V" > version.json
echo "Version $V"
