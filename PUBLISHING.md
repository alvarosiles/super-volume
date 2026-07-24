# Cómo publicar Super Volume en la Chrome Web Store

Guía paso a paso para subir la extensión al [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## 0. Generar el paquete

Antes de subir nada, genera el `.zip` con el script de compilación (valida
`manifest.json`, revisa la sintaxis de los `.js` y empaqueta solo lo que la
extensión necesita en tiempo de ejecución):

```bash
./scripts/3-build.sh
# → dist/super-volume-v2.0.0.zip
```

Vuelve a correrlo cada vez que cambies el código, antes de subir una nueva
versión.

## 1. Subir el paquete

Clic en **"+ Nuevo elemento"** (arriba a la derecha) → arrastra o selecciona
`dist/super-volume-v2.0.0.zip`.

## 2. Completar la ficha del Store

Google te va a pedir, como mínimo:

| Campo | Qué poner |
|---|---|
| Nombre | Super Volume |
| Descripción resumida (132 caracteres) | "Aumenta el volumen de cualquier pestaña hasta 600% con Web Audio API, sin tocar el volumen del sistema." |
| Descripción detallada | Copia y pega el bloque de abajo |
| Categoría | Herramientas (Tools) |
| Idioma | Español |
| Capturas de pantalla (mín. 1, recomendado 3-5, 1280×800 o 640×400) | Del popup en acción |
| Icono de la tienda (128×128) | Ya lo tienes en `icons/icon128.png` |

Texto listo para pegar en "Descripción detallada":

```
🔊 Super Volume — el volumen de tu navegador, a tu manera

¿Ese video suena bajísimo aunque tengas el volumen del sistema al
máximo? Super Volume amplifica el audio de cualquier pestaña hasta
600%, directamente en el navegador, sin tocar el volumen de tu equipo.

🚀 Características

⭐️ Aumento de volumen de hasta el 600%
⭐️ Controla el volumen de cualquier pestaña, de forma independiente
⭐️ Ecualizador con presets: 🎬 Cine, 🎵 Música y 🎮 Juegos
⭐️ Voice Boost, para resaltar voces y diálogos
⭐️ Bass Boost, para graves más profundos
⭐️ Recuerda el volumen guardado, sitio por sitio
⭐️ Botones de Reset y Mute con un solo clic
⭐️ Tema Claro, Oscuro o Automático (según tu sistema)
⭐️ Disponible en Español e Inglés, con detección automática de idioma
⭐️ Indicador en el icono con el % de volumen activo

🔒 Tu privacidad, primero

Todo el procesamiento de audio ocurre en tu propio navegador con la
Web Audio API nativa de Chrome. No hay cuentas, no hay analítica, no
hay servidores propios: ningún dato sale nunca de tu dispositivo.

⚡ Liviano y sin distracciones

Sin dependencias externas, sin scripts de terceros, sin publicidad.
Solo lo justo y necesario para que tu audio suene como querés.

Completamente gratis y sin anuncios

Hecho con ❤️ por Alvaro Siles E.
```

## 3. La parte que más rechazos causa: justificar permisos

Como el manifest pide `host_permissions: ["<all_urls>"]`, la pestaña
**"Privacidad"** del listing te va a exigir:

- **Justificación de "Host permission usage"**: explica que la extensión
  necesita inyectarse en cualquier sitio para detectar y amplificar el audio
  de `<video>`/`<audio>`, sin importar el dominio (no es una lista fija de
  sitios soportados).
- **Declaración de "Single Purpose"**: describe el propósito único
  ("amplificar el volumen de audio/video de la pestaña activa mediante Web
  Audio API").
- **Política de privacidad (Privacy Policy)**: Google la exige casi siempre
  que hay `host_permissions` amplios, aunque la extensión no recolecte ni
  envíe datos a ningún servidor. Ya está escrita en `docs/privacy.html`;
  falta que quede publicada y accesible por URL pública (ver nota abajo)
  para pegarla en este campo del Dashboard.

  > **Importante**: `docs/` solo existe en la rama `dev` por ahora. Si
  > publicás la política vía GitHub Pages (sirviendo `main` + carpeta
  > `/docs`, la configuración típica), primero tenés que mergear `dev` a
  > `main` y pushear — si no, la URL da 404 y Google rechaza el listing.

## 4. Cuenta de desarrollador

Antes de que "Nuevo elemento" te deje continuar, si es tu primera
publicación te van a pedir:

- Pagar la cuota única de registro (~$5 USD), si aún no la pagaste.
- Tener la **verificación en 2 pasos (2FA)** activada en la cuenta de
  Google que usas para publicar. Si al subir el `.zip` ves el error
  *"Ocurrió un problema al subir el archivo... es necesario que habilites
  la verificación en 2 pasos"*, actívala en
  [myaccount.google.com/security](https://myaccount.google.com/security)
  y reintenta la subida. Es un paso único por cuenta.

## 5. Enviar a revisión

Botón **"Enviar para revisión"** al final. La revisión suele tardar de
horas a unos días; extensiones con `<all_urls>` a veces tardan más por el
escrutinio extra de permisos.

## Actualizar una versión ya publicada

1. Sube la versión en `manifest.json` (ej. `1.0.0` → `1.0.1`).
2. Corre `./scripts/3-build.sh` de nuevo.
3. En el Dashboard, entra al elemento ya publicado → **"Paquete"** →
   sube el nuevo `.zip`.
4. Enviar a revisión otra vez (las actualizaciones también pasan por
   revisión, aunque normalmente más rápida que la primera publicación).
