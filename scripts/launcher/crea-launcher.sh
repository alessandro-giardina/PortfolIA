#!/bin/bash
#
# Costruisce PortfolIA.app: un'icona da cliccare per usare l'applicazione senza
# passare dal terminale.
#
#   npm run launcher                 -> installa in /Applications
#   npm run launcher -- ~/Desktop    -> installa altrove
#
# Il bundle incide al proprio interno il percorso del progetto e quello di Node,
# quindi funziona ovunque lo si sposti, ma va rigenerato se il progetto cambia
# posizione o se nvm cambia versione di Node.

set -euo pipefail

QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$QUI/../.." && pwd)"
DESTINAZIONE="${1:-/Applications}"
APP="$DESTINAZIONE/PortfolIA.app"

command -v node >/dev/null 2>&1 || { echo "Node.js non trovato nel PATH." >&2; exit 1; }
PERCORSO_NODE="$(cd "$(dirname "$(command -v node)")" && pwd)"

[ -d "$DESTINAZIONE" ] || { echo "La cartella di destinazione non esiste: $DESTINAZIONE" >&2; exit 1; }
[ -w "$DESTINAZIONE" ] || { echo "Non ho permessi di scrittura su $DESTINAZIONE" >&2; exit 1; }

LAVORO="$(mktemp -d)"
trap 'rm -rf "$LAVORO"' EXIT

# --- icona --------------------------------------------------------------------

echo "Genero l'icona…"
node "$QUI/genera-icona.mjs" "$LAVORO/icona.png" >/dev/null

ICONSET="$LAVORO/portfolia.iconset"
mkdir -p "$ICONSET"
for coppia in "16 icon_16x16" "32 icon_16x16@2x" "32 icon_32x32" "64 icon_32x32@2x" \
              "128 icon_128x128" "256 icon_128x128@2x" "256 icon_256x256" \
              "512 icon_256x256@2x" "512 icon_512x512" "1024 icon_512x512@2x"; do
  lato="${coppia% *}"
  nome="${coppia#* }"
  sips -z "$lato" "$lato" "$LAVORO/icona.png" --out "$ICONSET/$nome.png" >/dev/null 2>&1
done
iconutil -c icns "$ICONSET" -o "$LAVORO/portfolia.icns"

# --- bundle -------------------------------------------------------------------

NUOVA="$LAVORO/PortfolIA.app"
mkdir -p "$NUOVA/Contents/MacOS" "$NUOVA/Contents/Resources"

VERSIONE="$(node -p "require('$REPO/package.json').version")"

cat >"$NUOVA/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>              <string>PortfolIA</string>
  <key>CFBundleDisplayName</key>       <string>PortfolIA</string>
  <key>CFBundleIdentifier</key>        <string>it.portfolia.launcher</string>
  <key>CFBundleExecutable</key>        <string>portfolia</string>
  <key>CFBundleIconFile</key>          <string>portfolia</string>
  <key>CFBundlePackageType</key>       <string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSIONE</string>
  <key>CFBundleVersion</key>           <string>$VERSIONE</string>
  <key>LSMinimumSystemVersion</key>    <string>11.0</string>
  <key>NSHighResolutionCapable</key>   <true/>
</dict>
</plist>
PLIST

# I due segnaposto dello script vengono risolti qui: da questo momento il
# bundle sa dove sta il progetto e quale Node usare.
sed -e "s|@@REPO@@|$REPO|g" -e "s|@@NODE_BIN@@|$PERCORSO_NODE|g" \
  "$QUI/avvia.sh" >"$NUOVA/Contents/MacOS/portfolia"
chmod +x "$NUOVA/Contents/MacOS/portfolia"
cp "$LAVORO/portfolia.icns" "$NUOVA/Contents/Resources/portfolia.icns"

# --- installazione ------------------------------------------------------------

rm -rf "$APP"
mv "$NUOVA" "$APP"
touch "$APP"  # invita il Finder a rileggere l'icona invece di usare la cache

echo
echo "Fatto: $APP"
echo "  progetto: $REPO"
echo "  node:     $PERCORSO_NODE"
echo
echo "Aprila da Launchpad o con Spotlight. Per tenerla a portata di mano,"
echo "trascina l'icona nel Dock."
