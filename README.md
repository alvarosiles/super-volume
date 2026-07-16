Actúa como un desarrollador Senior especializado en Google Chrome Extensions (Manifest V3), JavaScript, HTML, CSS y Web Audio API.

Quiero desarrollar una extensión profesional para Google Chrome llamada "Volume Booster".

Objetivo:
Crear una extensión que permita aumentar el volumen de cualquier pestaña del navegador hasta un máximo de 600% utilizando la Web Audio API (GainNode), sin modificar el volumen del sistema operativo.

La extensión debe ser moderna, rápida, optimizada y cumplir con los requisitos de Google Chrome Web Store.

====================================
FUNCIONES
====================================

• Aumentar el volumen desde 0% hasta 600%.
• Slider moderno.
• Mostrar el porcentaje actual.
• Botón Reset (100%).
• Botón Mute.
• Recordar el último volumen utilizado.
• Funcionar únicamente en la pestaña activa.
• Detectar automáticamente elementos:
    - video
    - audio
• Compatible con:
    - YouTube
    - Netflix
    - Twitch
    - Spotify Web
    - Facebook Videos
    - Vimeo
    - TikTok
    - Cualquier página con etiquetas <video> o <audio>

====================================
DISEÑO
====================================

Quiero un diseño moderno similar a las aplicaciones de Google.

Colores:

Fondo:
#202124

Tarjetas:
#2d2f33

Botones:
#4285F4

Slider:
Color azul Google

Texto:
Blanco

Bordes:
Redondeados

Animaciones:
Suaves

Iconos:
Material Icons

====================================
INTERFAZ
====================================

La ventana popup debe mostrar:

--------------------------------

🔊 Volume Booster

Volumen

[========●=======]

250%

Botón Reset

Botón Mute

Interruptor:

✓ Recordar volumen

Sitio actual:

youtube.com

--------------------------------

====================================
FUNCIONALIDADES
====================================

La extensión debe usar:

Manifest V3

background.js

popup.html

popup.css

popup.js

content.js

Debe utilizar:

Chrome Tabs API

Chrome Storage API

Web Audio API

GainNode

AudioContext

====================================
ESTRUCTURA
====================================

Quiero el proyecto organizado así:

Volume-Booster/

manifest.json

background.js

popup.html

popup.css

popup.js

content.js

icons/

icon16.png

icon32.png

icon48.png

icon128.png

README.md

====================================
CÓDIGO
====================================

Quiero el código completamente comentado.

Cada archivo debe explicarse.

No omitir ninguna línea.

No resumir.

Generar archivos completos.

====================================
EXTRAS
====================================

Agregar:

Modo oscuro

Guardar configuración

Recordar volumen por dominio

Ejemplo:

youtube.com → 250%

spotify.com → 180%

netflix.com → 300%

Mostrar el nombre de la pestaña.

Mostrar favicon del sitio.

Mostrar dominio actual.

====================================
ANIMACIONES
====================================

El slider debe tener animación.

Los botones deben tener hover.

El popup debe tener transición.

====================================
RENDIMIENTO
====================================

La extensión debe consumir la menor memoria posible.

No crear AudioContext innecesarios.

Destruir conexiones cuando cambie la pestaña.

Optimizar todo el código.

====================================
COMPATIBILIDAD
====================================

Compatible con Chrome y Microsoft Edge.

====================================
CALIDAD
====================================

El código debe ser de calidad profesional.

Seguir buenas prácticas.

Usar ES6+.

Código limpio.

Sin dependencias externas.

====================================
DOCUMENTACIÓN
====================================

Explicar cómo:

• instalar la extensión
• cargarla en modo desarrollador
• publicarla en Chrome Web Store
• cambiar iconos
• cambiar colores
• aumentar el límite de volumen
• agregar nuevas funciones

====================================
ENTREGA
====================================

Genera el proyecto completo archivo por archivo.

No resumas.

No omitas archivos.

Espera mi confirmación antes de continuar con el siguiente archivo.