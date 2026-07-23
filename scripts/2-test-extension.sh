#!/usr/bin/env bash
#
# 2-test-extension.sh — Super Volume
# ─────────────────────────────────────────────────────────────────────────
# Deja la extensión lista para probar de un solo comando:
#
#   1. Abre Chrome en un perfil de pruebas AISLADO en /tmp (no toca tu
#      perfil ni tus sesiones habituales).
#   2. Activa "Developer mode" automáticamente (Chrome ya no acepta
#      extensiones descomprimidas sin esto).
#   3. Carga Super Volume con el método oficial del DevTools Protocol
#      (Extensions.loadUnpacked) — el reemplazo moderno de --load-extension,
#      que Chrome empezó a ignorar si Developer mode está apagado.
#   4. Abre YouTube (o la URL que le pases) para que pruebes directo.
#
# Uso:
#   ./scripts/2-test-extension.sh
#   ./scripts/2-test-extension.sh https://www.netflix.com/

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="/tmp/super-volume-test-profile"
PORT=9333
URL="${1:-https://www.youtube.com/shorts/hY0Xz-GBPh8}"
# URL="${1:-https://www.youtube.com/watch?v=jNQXAC9IVRw}"

BROWSER=""
for bin in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable; do
  if command -v "$bin" >/dev/null 2>&1; then
    BROWSER="$bin"
    break
  fi
done

if [[ -z "$BROWSER" ]]; then
  # Windows (Git Bash/MSYS): los binarios no viven en el PATH con esos
  # nombres de Linux, hay que buscarlos en sus rutas típicas de instalación.
  for win_path in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
    "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; do
    if [[ -f "$win_path" ]]; then
      BROWSER="$win_path"
      break
    fi
  done
fi

if [[ -z "$BROWSER" ]]; then
  echo "No se encontró Chrome/Chromium/Edge instalado en el sistema." >&2
  exit 1
fi

LOADER_CMD=()
if command -v node >/dev/null 2>&1; then
  LOADER_CMD=(node "$(dirname "${BASH_SOURCE[0]}")/_cdp_loader.js")
elif command -v python3 >/dev/null 2>&1; then
  LOADER_CMD=(python3 "$(dirname "${BASH_SOURCE[0]}")/_cdp_loader.py")
fi

if [[ ${#LOADER_CMD[@]} -eq 0 ]]; then
  echo "Se necesita Node.js o Python 3 para automatizar la carga (no se encontró ninguno en PATH)." >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/manifest.json" ]]; then
  echo "No se encontró manifest.json en $ROOT_DIR" >&2
  exit 1
fi

# Perfil siempre fresco: evita acumular recargas duplicadas de la extensión
# entre corridas y garantiza un estado predecible.
pkill -9 -f "user-data-dir=$PROFILE_DIR" >/dev/null 2>&1 || true
sleep 0.5
rm -rf "$PROFILE_DIR"
mkdir -p "$PROFILE_DIR"

echo "Navegador: $BROWSER"
echo "Extensión: $ROOT_DIR"
echo "Perfil de pruebas: $PROFILE_DIR (aislado, no afecta tu perfil normal)"
echo

"$BROWSER" \
  --user-data-dir="$PROFILE_DIR" \
  --remote-debugging-port="$PORT" \
  --no-first-run \
  --no-default-browser-check \
  about:blank \
  >/dev/null 2>&1 &
disown

echo "Chrome abriéndose... activando Developer mode e instalando la extensión..."

if "${LOADER_CMD[@]}" "$PORT" "$ROOT_DIR" "$URL"; then
  echo
  echo "Listo. Super Volume está instalada y activa en esta ventana de Chrome."
  echo "Abre el popup (icono de la barra de extensiones) sobre la pestaña de YouTube y mueve el slider."
else
  echo
  echo "No se pudo automatizar la instalación (ver error arriba)." >&2
  echo "Puedes hacerlo a mano: en la ventana que se abrió, ve a chrome://extensions," >&2
  echo "activa 'Developer mode' y usa 'Cargar descomprimida' seleccionando:" >&2
  echo "  $ROOT_DIR" >&2
  exit 1
fi
