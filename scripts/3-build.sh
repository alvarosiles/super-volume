#!/usr/bin/env bash
#
# 3-build.sh — Super Volume
# ─────────────────────────────────────────────────────────────────────────
# Empaqueta la extensión en un .zip listo para subir a la Chrome Web Store
# (o para distribuir manualmente). Solo incluye los archivos que la
# extensión necesita en tiempo de ejecución (nada de scripts/, README,
# LICENSE, gen_icons.py, .git, etc.), y valida que manifest.json sea JSON
# válido y que todos los iconos declarados existan antes de comprimir.
#
# Uso:
#   ./scripts/3-build.sh
#
# Salida:
#   dist/super-volume-v<version>.zip

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
MANIFEST="$ROOT_DIR/manifest.json"

cd "$ROOT_DIR"

if ! command -v zip >/dev/null 2>&1; then
  echo "Falta el comando 'zip'. Instálalo (ej: sudo apt install zip) y reintenta." >&2
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "No se encontró manifest.json en $ROOT_DIR" >&2
  exit 1
fi

# ── 1. Validar manifest.json ──────────────────────────────────────────────
if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$MANIFEST" 2>/dev/null; then
  echo "manifest.json no es un JSON válido. Corrígelo antes de compilar." >&2
  exit 1
fi

VERSION="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['version'])")"
echo "Versión detectada: $VERSION"

# ── 2. Archivos que forman parte del paquete final ─────────────────────────
FILES=(
  manifest.json
  background.js
  content.js
  popup.html
  popup.css
  popup.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
)

MISSING=0
for f in "${FILES[@]}"; do
  if [[ ! -f "$ROOT_DIR/$f" ]]; then
    echo "Falta un archivo requerido: $f" >&2
    MISSING=1
  fi
done
if [[ "$MISSING" -eq 1 ]]; then
  echo "Compilación cancelada: hay archivos requeridos ausentes." >&2
  exit 1
fi

# ── 3. Validar sintaxis de los .js si Node está disponible ─────────────────
if command -v node >/dev/null 2>&1; then
  for js in background.js content.js popup.js; do
    if ! node --check "$js"; then
      echo "Error de sintaxis en $js. Corrígelo antes de compilar." >&2
      exit 1
    fi
  done
  echo "Sintaxis de los .js OK"
fi

# ── 4. Empaquetar ───────────────────────────────────────────────────────────
mkdir -p "$DIST_DIR"
ZIP_PATH="$DIST_DIR/super-volume-v${VERSION}.zip"
rm -f "$ZIP_PATH"

zip -q -X "$ZIP_PATH" "${FILES[@]}"

echo
echo "======================================================"
echo " Paquete generado: $ZIP_PATH"
echo "======================================================"
du -h "$ZIP_PATH" | cut -f1 | xargs -I{} echo "Tamaño: {}"
echo
echo "Contenido:"
unzip -l "$ZIP_PATH"
echo
echo "Listo para subir a https://chrome.google.com/webstore/devconsole"
