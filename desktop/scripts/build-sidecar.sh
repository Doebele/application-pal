#!/bin/sh
# Baut alles, was die Tauri-App mitliefert:
#  - Backend als eine ausführbare Datei (bun --compile) → src-tauri/binaries/app-pal-backend-<triple>[.exe]
#  - Frontend (vite build, ohne tsc -b: das schreibt sonst .js-Dateien nach frontend/src)
#  - PGlite-Assets (WASM + Daten) als Ressourcen
# Ziel = Host, ausser TARGET_TRIPLE ist gesetzt (CI baut z.B. x86_64-apple-darwin auf einem
# Apple-Silicon-Runner; bun kompiliert dafür quer).
set -e
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
TRIPLE=${TARGET_TRIPLE:-$(rustc -vV | sed -n 's/^host: //p')}
OUT="$ROOT/desktop/src-tauri"

npm run build --workspace shared >/dev/null
(cd frontend && npx vite build >/dev/null)

EXT=""
case "$TRIPLE" in
  aarch64-apple-darwin)   BUN_TARGET=bun-darwin-arm64; CANVAS=darwin-arm64 ;;
  x86_64-apple-darwin)    BUN_TARGET=bun-darwin-x64;   CANVAS=darwin-x64 ;;
  x86_64-pc-windows-msvc) BUN_TARGET=bun-windows-x64;  CANVAS=win32-x64-msvc; EXT=".exe" ;;
  *) echo "Unbekanntes Ziel $TRIPLE"; exit 1 ;;
esac

# @napi-rs/canvas ist ein natives Addon, das bun ins Binary einbettet. npm installiert
# nur die Variante des Build-Rechners; fehlt die des Ziels, startet der Sidecar nicht
# ("Failed to load native binding"). Dann die passende Variante in gleicher Version holen.
CANVAS_DIR="node_modules/@napi-rs/canvas-$CANVAS"
if [ ! -d "$CANVAS_DIR" ]; then
  V=$(node -p "require('./node_modules/@napi-rs/canvas/package.json').version")
  TMP=$(mktemp -d)
  (cd "$TMP" && npm pack "@napi-rs/canvas-$CANVAS@$V" --silent >/dev/null)
  mkdir -p "$CANVAS_DIR"
  tar -xzf "$TMP"/*.tgz -C "$CANVAS_DIR" --strip-components=1
  rm -rf "$TMP"
  echo "canvas-$CANVAS@$V für $TRIPLE nachgeladen"
fi
mkdir -p "$OUT/binaries" "$OUT/resources/pglite"
bun build backend/src/index.ts --compile --minify --target=$BUN_TARGET \
  --outfile "$OUT/binaries/app-pal-backend-$TRIPLE$EXT"
cp node_modules/@electric-sql/pglite/dist/pglite.wasm \
   node_modules/@electric-sql/pglite/dist/initdb.wasm \
   node_modules/@electric-sql/pglite/dist/pglite.data "$OUT/resources/pglite/"
echo "Sidecar fertig: $OUT/binaries/app-pal-backend-$TRIPLE$EXT"
