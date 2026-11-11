#!/bin/sh
# M0-Spike: baut alles, was die Tauri-App mitliefert.
#  - Backend als eine ausführbare Datei (bun --compile) → src-tauri/binaries/app-pal-backend-<triple>
#  - Frontend (vite build, ohne tsc -b: das schreibt sonst .js-Dateien nach frontend/src)
#  - PGlite-Assets (WASM + Daten) und die Schema-Migration als Ressourcen
set -e
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
TRIPLE=$(rustc -vV | sed -n 's/^host: //p')
OUT="$ROOT/desktop/src-tauri"

npm run build --workspace shared >/dev/null
(cd frontend && npx vite build >/dev/null)

case "$TRIPLE" in
  aarch64-apple-darwin) BUN_TARGET=bun-darwin-arm64 ;;
  x86_64-apple-darwin)  BUN_TARGET=bun-darwin-x64 ;;
  x86_64-pc-windows-msvc) BUN_TARGET=bun-windows-x64 ;;
  *) echo "Unbekanntes Ziel $TRIPLE"; exit 1 ;;
esac
mkdir -p "$OUT/binaries" "$OUT/resources/pglite"
bun build backend/src/index.ts --compile --minify --target=$BUN_TARGET \
  --outfile "$OUT/binaries/app-pal-backend-$TRIPLE"
cp node_modules/@electric-sql/pglite/dist/pglite.wasm \
   node_modules/@electric-sql/pglite/dist/initdb.wasm \
   node_modules/@electric-sql/pglite/dist/pglite.data "$OUT/resources/pglite/"
echo "Sidecar fertig: $OUT/binaries/app-pal-backend-$TRIPLE"
