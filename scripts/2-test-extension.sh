#!/usr/bin/env bash
#
# 2-test-extension.sh — Super Volume
# ─────────────────────────────────────────────────────────────────────────
# Abre Google Chrome (o Chromium/Edge) con la extensión "Super Volume" ya
# cargada, usando un perfil de pruebas SEPARADO en /tmp para no tocar tu
# sesión, extensiones ni sesiones abiertas del Chrome que usas normalmente.
# Ideal para probar cambios rápidamente mientras desarrollas.
#
# Uso:
#   ./scripts/2-test-extension.sh                # abre Chrome con la extensión cargada
#   ./scripts/2-test-extension.sh https://youtube.com/watch?v=dQw4w9WgXcQ
#                                                 # además abre esa URL de una vez
#
# Nota: --load-extension es la forma oficial de Chrome para cargar una
# extensión descomprimida desde línea de comandos. Para instalarla de forma
# permanente en tu perfil habitual usa ./scripts/1-install.sh.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="/tmp/super-volume-test-profile"
URL="${1:-}"

# Busca un navegador basado en Chromium disponible en el sistema.
BROWSER=""
for bin in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable; do
  if command -v "$bin" >/dev/null 2>&1; then
    BROWSER="$bin"
    break
  fi
done

if [[ -z "$BROWSER" ]]; then
  echo "No se encontró Chrome/Chromium/Edge instalado en el sistema." >&2
  echo "Instala Google Chrome o abre manualmente chrome://extensions y usa 'Cargar descomprimida'." >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/manifest.json" ]]; then
  echo "No se encontró manifest.json en $ROOT_DIR" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

echo "Navegador: $BROWSER"
echo "Extensión: $ROOT_DIR"
echo "Perfil de pruebas: $PROFILE_DIR (aislado, no afecta tu perfil normal)"
echo

ARGS=(
  --user-data-dir="$PROFILE_DIR"
  --load-extension="$ROOT_DIR"
  --no-first-run
  --no-default-browser-check
)

if [[ -n "$URL" ]]; then
  ARGS+=("$URL")
else
  ARGS+=("chrome://extensions")
fi

"$BROWSER" "${ARGS[@]}" >/dev/null 2>&1 &
disown

echo "Chrome se está abriendo con Super Volume ya cargada."
echo "Si no ves el icono en la barra, haz clic en la pieza de rompecabezas (⋮ extensiones) y fíjala."
