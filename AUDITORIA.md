# Auditoría de publicación — extensiones alvarosiles

Fecha: 2026-07-16
Autor: alvarosiles (alvarosiles.developer@gmail.com)

Auditoría de los tres proyectos de extensión de Chrome (Manifest V3) antes de
publicarlos en la Chrome Web Store:

- [super-volume](https://github.com/alvarosiles/super-volume)
- [super-video-downloader](https://github.com/alvarosiles/super-video-downloader)
- [super-video-popup](https://github.com/alvarosiles/super-video-popup)

Objetivo: detectar lo que podría hacer que la Chrome Web Store rechace o dé
de baja alguna de las tres al publicarlas o actualizarlas.

---

## 1. Identidad de cada proyecto (nombre / repo / descripción)

Se verificó que en los tres, el `name` de `manifest.json`, el `homepage_url`
y el remoto de git (`origin`) sean consistentes entre sí:

| Proyecto | Repo (`git remote`) | `manifest.json` → `name` | `homepage_url` | Descripción coherente con el nombre |
|---|---|---|---|---|
| super-volume | `alvarosiles/super-volume` | "Super Volume" | coincide | Sí — amplifica volumen de pestaña (Web Audio API / GainNode) |
| super-video-downloader | `alvarosiles/super-video-downloader` | "Super Video Downloader" | coincide | Sí — detecta y descarga video de sitios soportados |
| super-video-popup | `alvarosiles/super-video-popup` | "Super Video Popup" | coincide | Sí — video flotante en Picture-in-Picture |

`author: "alvarosiles"` en los tres. Correo de contacto verificado y
correcto en los tres README: `alvarosiles.developer@gmail.com`.

**Conclusión: sin inconsistencias.** No se requiere ningún cambio en nombre,
repo o descripción.

---

## 2. Permisos declarados vs. permisos realmente usados en el código

Se comparó el array `permissions`/`host_permissions` de cada `manifest.json`
contra el uso real de las APIs `chrome.*` en el código (`grep` de
`chrome\.[a-zA-Z]+\.[a-zA-Z]+` en todos los `.js`). Un permiso declarado que
no se usa es la causa más común de fricción/rechazo en la revisión de
Google, porque el formulario de "Privacidad" del Developer Dashboard exige
justificar cada uno.

### super-volume

| Permiso | ¿Usado en código? | Dónde |
|---|---|---|
| `storage` | Sí | `popup.js` (`chrome.storage.local`) |
| `activeTab` | Sí | `popup.js` (`chrome.tabs.query`) |
| `host_permissions: <all_urls>` | Sí | `content.js` se inyecta en `<all_urls>` para detectar `<video>`/`<audio>` en cualquier sitio |

Sin permisos sobrantes.

### super-video-downloader

| Permiso | ¿Usado en código? | Dónde |
|---|---|---|
| `storage` | Sí | `scripts/storage.js`, `background.js` |
| `activeTab` | Sí | `popup/popup.js` (`chrome.tabs.query`) |
| `downloads` | Sí | `background.js`, `scripts/downloader.js` (`chrome.downloads.download/search/onChanged`) |
| `notifications` | Sí | `background.js` (`chrome.notifications.create`, condicionado a `settings.showNotifications`) |
| `host_permissions: <all_urls>` | Sí | detección de medios en cualquier sitio |

Se verificó además un falso positivo: `scripts/downloader.js:9` menciona
`chrome.scripting.executeScript` **en un comentario**, no en código
ejecutable — no falta declarar el permiso `scripting`, no se usa esa API.

Sin permisos sobrantes.

### super-video-popup

| Permiso | ¿Usado en código? | Dónde |
|---|---|---|
| `activeTab` | Sí | `popup.js` (`chrome.tabs.query`) |
| `scripting` | Sí | `popup.js` (`chrome.scripting.executeScript`) |
| `host_permissions: <all_urls>` | Sí | Picture-in-Picture disponible en cualquier sitio con video |

Sin permisos sobrantes.

**Conclusión: los tres piden exactamente los permisos que usan.** El único
permiso "caro" en revisión es `host_permissions: <all_urls>`, presente en
los tres — es legítimo dado su propósito (funcionar en cualquier sitio, no
en una lista fija), pero es el que más exige justificación y política de
privacidad (ver sección 4).

---

## 3. Patrones de código de alto riesgo (código remoto, ofuscación, DRM)

Búsqueda de patrones prohibidos o de alto escrutinio por la política de la
Chrome Web Store (`eval`, `new Function`, `document.write`, `<script
src="http...">`, llamadas `fetch`/`XHR` a servidores propios):

- **`eval` / `new Function` / `document.write` / scripts remotos**: no se
  encontró ninguno en los tres proyectos. Cumple con la prohibición de
  Manifest V3 de ejecutar código remoto o dinámico.
- **`fetch`/`XMLHttpRequest`**: el único uso encontrado es en
  `super-video-downloader/scripts/detector.js:160` — un `fetch(url, {
  method: 'HEAD' })` hacia la **URL del propio video detectado**, solo para
  leer el header `Content-Length` y mostrar el tamaño del archivo. No se
  envían datos a ningún servidor propio ni de terceros. Confirmado también
  por la propia FAQ del README: *"¿La extensión envía mis datos a algún
  servidor? No."*
- **Elusión de DRM / streaming cifrado**: riesgo específico y crítico para
  una extensión de descarga de video. Se verificó que
  `super-video-downloader` **evita esto explícitamente por diseño**: detecta
  los fragmentos `blob:`/`mediasource:` de YouTube/Netflix/Twitch pero los
  marca como "no disponible para descarga directa" en lugar de
  reconstruirlos. Esto es exactamente lo que exige la política de la Chrome
  Web Store sobre contenido protegido — es la causa #1 de rechazo/baja para
  este tipo de extensiones y aquí ya está resuelto correctamente.

**Conclusión: sin código de riesgo.** El punto más delicado (descarga de
contenido protegido) ya está mitigado por diseño en el proyecto que podría
tener ese problema.

---

## 4. Huecos encontrados (a resolver antes de publicar)

### 4.1 Falta política de privacidad pública (los tres)

Ninguno de los tres `manifest.json` tiene un campo `privacy_policy`, y
ninguno de los README menciona una URL pública de política de privacidad.
Con `host_permissions: <all_urls>`, el formulario de "Privacidad" del
Developer Dashboard **casi siempre la exige**, incluso si la extensión no
recolecta ni transmite ningún dato (que es el caso en los tres).

**Acción sugerida:** publicar un `PRIVACY.md` (o página estática) por
proyecto, dejando explícito que todo el procesamiento es local y no hay
telemetría ni envío de datos a servidores propios.

### 4.2 Cuenta de desarrollador sin verificar

No verificable desde el código, pero documentado en `PUBLISHING.md` de cada
proyecto: la primera publicación falla si la cuenta de Google usada para
publicar no tiene **verificación en 2 pasos (2FA)** activada. Es un paso
único por cuenta, pero bloquea la subida del primer `.zip` si no está
hecho.

**Acción sugerida:** activar 2FA en la cuenta de Google/Chrome Web Store
antes del primer submit, en <https://myaccount.google.com/security>.

### 4.3 Detalle cosmético menor (super-video-popup)

`content.js:24-25` usa internamente el nombre de variable
`window.__floatVideoProInjected`, resto del nombre de trabajo anterior del
proyecto ("Float Video Pro" — también queda un `dist/float-video-pro-v1.0.0.zip`
obsoleto sin usar, ignorado por git). No es visible para el usuario final ni
afecta la revisión de Google, es solo inconsistencia interna de nombres.

**Acción sugerida (opcional, no bloqueante):** renombrar la variable a algo
como `__superVideoPopupInjected` y borrar el zip obsoleto de `dist/`.

---

## 5. Empaquetado (`3-build.sh` / `tools/3-build.sh`)

Se revisó el script de build de cada proyecto y el contenido real del
`.zip` generado:

- Los tres validan que `manifest.json` sea JSON válido antes de empaquetar.
- Los tres validan la sintaxis de los `.js` con `node --check` si Node está
  disponible.
- Los tres empaquetan **únicamente** los archivos necesarios en tiempo de
  ejecución (manifest, JS, HTML, CSS, iconos) — quedan fuera `README.md`,
  `LICENSE`, `PUBLISHING.md`, `gen_icons.py`, `scripts/`/`tools/` de
  desarrollo y `.git`, lo cual mantiene el paquete liviano y sin archivos
  irrelevantes que puedan generar preguntas en la revisión.
- Se confirmó (en `super-video-downloader`) que el `.zip` ya generado en
  `dist/` está actualizado respecto al código fuente actual (mismas fechas
  de modificación).

**Conclusión: el empaquetado está bien planteado en los tres.** Solo hay
que recordar correr el build script antes de cada submit para no subir una
versión vieja.

---

## 6. Resumen ejecutivo

| Ítem | super-volume | super-video-downloader | super-video-popup |
|---|---|---|---|
| Nombre/repo/descripción coherentes | ✅ | ✅ | ✅ |
| Permisos sin excedentes | ✅ | ✅ | ✅ |
| Sin código remoto/eval/ofuscado | ✅ | ✅ | ✅ |
| Evita elusión de DRM | N/A | ✅ | N/A |
| Política de privacidad publicada | ❌ falta | ❌ falta | ❌ falta |
| Build empaqueta solo lo necesario | ✅ | ✅ | ✅ |
| 2FA en cuenta de publicación | Pendiente de verificar por el usuario | Pendiente de verificar por el usuario | Pendiente de verificar por el usuario |

**Nada en el código bloquea la publicación.** El único pendiente real y
compartido por los tres es publicar una política de privacidad accesible
por URL antes de enviar a revisión, y confirmar que la cuenta de Google
tenga 2FA activado.
