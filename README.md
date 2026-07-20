# 🔊 Super Volume

Extensión para **Google Chrome** (Manifest V3) que permite aumentar el volumen
de la pestaña activa hasta **600%** usando la **Web Audio API** (`AudioContext`
+ `GainNode`), sin tocar en ningún momento el volumen del sistema operativo.

Diseño oscuro inspirado en las apps de Google, slider animado, recuerda el
volumen por dominio y funciona automáticamente en cualquier página con
elementos `<video>` o `<audio>`.

- **Autor:** [alvarosiles](https://github.com/alvarosiles)
- **Contacto:** alvarosiles.developer@gmail.com

---

## Índice

1. [Características](#características)
2. [Estructura del proyecto](#estructura-del-proyecto)
3. [Cómo funciona (arquitectura)](#cómo-funciona-arquitectura)
4. [Instalación en modo desarrollador](#instalación-en-modo-desarrollador)
5. [Publicar en la Chrome Web Store](#publicar-en-la-chrome-web-store) — guía completa en [PUBLISHING.md](PUBLISHING.md)
6. [Personalización](#personalización)
   - [Cambiar los iconos](#cambiar-los-iconos)
   - [Cambiar los colores](#cambiar-los-colores)
   - [Aumentar el límite de volumen](#aumentar-el-límite-de-volumen-más-de-600)
   - [Agregar nuevas funciones](#agregar-nuevas-funciones)
7. [Permisos utilizados](#permisos-utilizados)
8. [Compatibilidad](#compatibilidad)
9. [Rendimiento](#rendimiento)

---

## Características

- Volumen ajustable de **0% a 600%** con un slider moderno y animado.
- Porcentaje actual visible en tiempo real.
- Botón **Reset** (vuelve a 100%).
- Botón **Mute** / Unmute.
- **Recuerda el volumen por dominio** (ej: un sitio a 250%, otro a 180%),
  con un interruptor para activar/desactivar ese comportamiento.
- El volumen guardado se re-aplica automáticamente al volver a visitar el
  sitio, sin necesidad de abrir el popup.
- Solo afecta a la **pestaña activa**.
- Detecta automáticamente elementos `<video>` y `<audio>`, incluidos los
  que aparecen dinámicamente en sitios de una sola página (SPA).
- Muestra el **favicon**, el **título** y el **dominio** de la pestaña actual.
- Indicador (badge) en el icono de la extensión con el % activo del sitio.
- Tema oscuro estilo Google, esquinas redondeadas, transiciones suaves,
  hover en los botones.
- Sin dependencias externas, sin llamadas de red, 100% código propio.

---

## Estructura del proyecto

```
super-volume/
├── manifest.json        # Configuración Manifest V3
├── background.js        # Service worker (badge + valores por defecto)
├── content.js            # Se inyecta en cada página: Web Audio API + GainNode
├── popup.html            # Interfaz del popup
├── popup.css              # Estilos (tema oscuro estilo Google)
├── popup.js                # Lógica del popup (UI, storage, mensajería)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── gen_icons.py           # Regenera los iconos (ver "Cambiar los iconos")
├── scripts/
│   ├── 1-install.sh       # Abre chrome://extensions en tu Chrome real
│   ├── 2-test-extension.sh # Abre Chrome con la extensión ya cargada (perfil aislado)
│   └── 3-build.sh         # Empaqueta la extensión en dist/*.zip
└── README.md
```

---

## Cómo funciona (arquitectura)

```
┌─────────────┐   chrome.tabs.sendMessage    ┌───────────────────┐
│  popup.js   │ ────────────────────────────▶│    content.js     │
│ (interfaz)  │◀──────────────────────────── │ (dentro de la web)│
└─────┬───────┘        respuesta / estado     └─────────┬─────────┘
      │                                                    │
      │ chrome.storage.local                     AudioContext + GainNode
      │ (volumen por dominio,                     conectado a cada
      │  preferencia "recordar")                  <video>/<audio> de la página
      ▼
┌─────────────┐
│ background.js│  ← service worker: badge del icono + valores por defecto
└─────────────┘
```

- **`content.js`** vive dentro de la página web (se inyecta en todos los
  frames, `<all_urls>`). Busca los elementos `<video>`/`<audio>`, los
  conecta a un único `GainNode` mediante `AudioContext.createMediaElementSource()`
  y ajusta `gainNode.gain.value` entre `0` y `6` (0%–600%). Un
  `MutationObserver` detecta elementos añadidos dinámicamente (SPAs).
- **`popup.js`** solo controla la pestaña activa: lee/(escribe su estado
  vía mensajes `chrome.runtime.onMessage`, y guarda el volumen por dominio
  en `chrome.storage.local`.
- **`background.js`** es un service worker ligero: no maneja audio, solo
  inicializa la configuración por defecto y actualiza el badge del icono.
- El `AudioContext` **nunca se crea de forma innecesaria**: solo se
  instancia la primera vez que el volumen se aleja de 100% (o hay un valor
  recordado distinto de 100% para ese dominio). Si el usuario nunca toca el
  volumen, no se gasta CPU/memoria extra en esa pestaña.

---

## Instalación en modo desarrollador

### Opción A — manual

1. Descarga o clona este repositorio.
2. Abre Chrome (o Edge) y ve a `chrome://extensions` (`edge://extensions`).
3. Activa el **Modo desarrollador** (interruptor arriba a la derecha).
4. Haz clic en **"Cargar descomprimida"** (*Load unpacked*).
5. Selecciona la carpeta raíz del proyecto (`super-volume/`, la que
   contiene `manifest.json`).
6. El icono de Super Volume aparecerá en la barra de extensiones. Ábrelo
   sobre cualquier pestaña con video/audio y ajusta el slider.

> Si editas el código, vuelve a `chrome://extensions` y pulsa el botón de
> recarga (↻) en la tarjeta de la extensión para aplicar los cambios.

### Opción B — con los scripts de `scripts/`

Hay tres scripts listos para usar (`chmod +x` ya aplicado):

```bash
./scripts/1-install.sh        # 1. Abre chrome://extensions en TU Chrome real
                               #    (con la ruta del proyecto lista para pegar
                               #    en el diálogo "Cargar descomprimida")

./scripts/2-test-extension.sh # 2. Abre Chrome con la extensión YA cargada,
                               #    en un perfil de pruebas aislado en /tmp
                               #    (no toca tu perfil ni tus sesiones reales).
                               #    Acepta una URL opcional:
                               #    ./scripts/2-test-extension.sh https://ejemplo.com/video

./scripts/3-build.sh          # 3. Valida manifest.json + sintaxis JS y genera
                               #    dist/super-volume-v<version>.zip listo para
                               #    la Chrome Web Store.
```

Chrome no permite instalar una extensión descomprimida de forma totalmente
silenciosa por línea de comandos (el clic en "Cargar descomprimida" es
obligatorio por seguridad); `1-install.sh` automatiza todo lo demás.

---

## Publicar en la Chrome Web Store

Guía completa, paso a paso (ficha del Store, justificación de permisos,
política de privacidad, el error de verificación en 2 pasos, cómo subir
actualizaciones...) en **[PUBLISHING.md](PUBLISHING.md)**.

Resumen rápido:

```bash
./scripts/3-build.sh
# → dist/super-volume-v1.0.0.zip
```

Sube ese `.zip` en el
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
con **"+ Nuevo elemento"**, completa la ficha y envía a revisión.

---

## Personalización

### Cambiar los iconos

Reemplaza los archivos dentro de `icons/` manteniendo los mismos nombres y
tamaños (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`, todos
cuadrados). No hace falta tocar `manifest.json`, ya apunta a esas rutas.

Si quieres regenerar los iconos actuales (un altavoz azul sobre fondo
redondeado), hay un script de referencia en `gen_icons.py` (usa
[Pillow](https://pillow.readthedocs.io/)) que dibuja el glifo a alta
resolución y lo reescala a cada tamaño.

### Cambiar los colores

Todos los colores están centralizados como variables CSS al inicio de
[`popup.css`](popup.css):

```css
:root {
  --bg: #202124;       /* fondo del popup */
  --card: #2d2f33;     /* tarjetas */
  --accent: #4285f4;   /* botones, slider, acentos (azul Google) */
  --text-primary: #ffffff;
  --text-secondary: #9aa0a6;
  ...
}
```

Cambia esos valores y toda la interfaz (slider, botones, interruptor,
badges) se actualiza automáticamente.

### Aumentar el límite de volumen (más de 600%)

El límite está definido en **dos lugares** (deben coincidir):

1. `content.js` → constante `MAX_VOLUME_PERCENT`.
2. `popup.js` → constante `MAX_VOLUME`.
3. `popup.html` → atributo `max="600"` del `<input id="volumeSlider">`.

Por ejemplo, para subir el tope a 1000%, cambia esos tres valores a `1000`.
Ten en cuenta que valores de ganancia muy altos pueden producir distorsión
o *clipping* del audio; 600% ya es un valor agresivo pensado para
altavoces/auriculares con volumen originalmente muy bajo.

### Agregar nuevas funciones

- **Nuevo botón en el popup** → añade el elemento en `popup.html`, su
  estilo en `popup.css` y su listener en `popup.js` (sección "Eventos de
  usuario"). Si necesita afectar el audio, envía un nuevo tipo de mensaje
  (`chrome.runtime.sendMessage`) y agrégalo al `switch` del
  `chrome.runtime.onMessage.addListener` en `content.js`.
- **Nueva preferencia persistente** → guárdala con
  `chrome.storage.local.set({...})` y léela en `content.js`/`popup.js` con
  `chrome.storage.local.get([...])`, siguiendo el mismo patrón usado para
  `rememberEnabled` y `volumes`.
- **Atajo de teclado** → añade una sección `"commands"` en `manifest.json`
  y escucha `chrome.commands.onCommand` en `background.js`.

---

## Permisos utilizados

| Permiso | Para qué se usa |
|---|---|
| `storage` | Guardar el volumen por dominio y la preferencia "recordar volumen" (`chrome.storage.local`). |
| `activeTab` | Identificar la pestaña activa al abrir el popup. |
| `host_permissions: <all_urls>` | Inyectar `content.js` en cualquier sitio para poder detectar y amplificar sus elementos `<video>`/`<audio>` (requisito imprescindible para que la extensión funcione en cualquier página, no solo en una lista fija de sitios). |

La extensión **no** usa `tabCapture` ni envía datos a ningún servidor: todo
el procesamiento de audio ocurre localmente en el `AudioContext` de cada
pestaña.

---

## Compatibilidad

- Google Chrome 102+ (Manifest V3).
- Microsoft Edge (Chromium) — mismo motor de extensiones, funciona sin
  cambios.
- Cualquier página con etiquetas `<video>` o `<audio>` accesibles desde el
  mismo origen (algunos reproductores con audio de terceros sin cabeceras
  CORS pueden no poder amplificarse por restricciones del propio
  navegador; en ese caso el elemento simplemente se ignora en lugar de
  romper la página).

---

## Rendimiento

- No se crea ningún `AudioContext` hasta que realmente hace falta
  (volumen ≠ 100% o mute).
- Un único `GainNode` por pestaña/frame, reutilizado para todos sus
  elementos multimedia.
- El `MutationObserver` solo actúa si ya existe un boost activo.
- Al cambiar de pestaña o navegar a otra URL, el propio navegador destruye
  el contexto del content script (y con él el `AudioContext`); no queda
  ningún proceso de audio huérfano.
- Sin librerías externas ni peticiones de red: el popup pesa unos pocos KB.
