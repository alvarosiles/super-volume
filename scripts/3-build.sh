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

if ! command -v node >/dev/null 2>&1; then
  echo "Se necesita Node.js para validar manifest.json/_locales (no se encontró en PATH)." >&2
  exit 1
fi

# ── 1. Validar manifest.json (y _locales/, si usa i18n) con Node ──────────
# Nota: se usa Node en vez de python3 porque en Windows "python3" suele ser
# solo el alias-stub de Microsoft Store (no un intérprete real). Los logs de
# validación van a stderr; stdout imprime únicamente la versión.
VERSION="$(node -e "
const fs = require('fs');
const path = require('path');
const manifestPath = process.argv[1];
const rootDir = process.argv[2];

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error('manifest.json no es un JSON válido. Corrígelo antes de compilar.');
  console.error(err.message);
  process.exit(1);
}

const desc = manifest.description || '';
if (!/^__MSG_.+__\$/.test(desc) && desc.length > 132) {
  console.error(\`manifest.json: 'description' tiene \${desc.length} caracteres (máx. 132 para la Chrome Web Store).\`);
  process.exit(1);
}

if (manifest.default_locale) {
  const fields = [manifest.name, manifest.short_name, manifest.description];
  for (const lang of ['en', 'es']) {
    const msgPath = path.join(rootDir, '_locales', lang, 'messages.json');
    if (!fs.existsSync(msgPath)) {
      console.error(\`Falta _locales/\${lang}/messages.json (declarado vía default_locale/__MSG_ en manifest.json).\`);
      process.exit(1);
    }
    let messages;
    try {
      messages = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
    } catch (err) {
      console.error(\`_locales/\${lang}/messages.json no es JSON válido.\`);
      process.exit(1);
    }
    for (const field of fields) {
      const m = /^__MSG_(.+)__\$/.exec(field || '');
      if (m && !(m[1] in messages)) {
        console.error(\`_locales/\${lang}/messages.json no tiene la key '\${m[1]}' que usa manifest.json (__MSG_\${m[1]}__).\`);
        process.exit(1);
      }
    }
  }
  console.error('Archivos _locales/*/messages.json OK');
}

console.log(manifest.version);
" "$MANIFEST" "$ROOT_DIR")" || exit 1

if [[ -z "$VERSION" ]]; then
  echo "No se pudo determinar la versión desde manifest.json." >&2
  exit 1
fi
echo "Versión detectada: $VERSION"

# Nombrar marcas de plataformas de terceros en textos/capturas de la ficha
# fue justo lo que causó el rechazo por "Spam con palabras clave" (Yellow
# Argon) — se busca en manifest.json y en todo lo que sirve de fuente para
# pegar en el Dashboard (store-assets/, README.md, docs/).
BRAND_PATTERN='\bYouTube\b|\bNetflix\b|\bTwitch\b|\bSpotify\b|\bTikTok\b|\bVimeo\b|\bFacebook\b|\bInstagram\b|\bDisney\+|\bAmazon Prime\b|\bHBO\b|\bHulu\b'
BRAND_HITS="$(grep -rniE "$BRAND_PATTERN" "$MANIFEST" store-assets/ README.md docs/ _locales/ 2>/dev/null || true)"
if [[ -n "$BRAND_HITS" ]]; then
  echo "Se encontraron nombres de plataformas de terceros (posible 'Spam con palabras clave'):" >&2
  echo "$BRAND_HITS" >&2
  echo "Quitalos o generalizalos (ej: 'plataformas con protección DRM') antes de compilar." >&2
  exit 1
fi

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
  _locales/en/messages.json
  _locales/es/messages.json
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
