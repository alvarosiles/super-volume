Actúa como un diseñador UI/UX Senior especializado en aplicaciones móviles premium para Android e iOS. Tu objetivo es crear una interfaz moderna, futurista y visualmente impactante para una aplicación de mejora de sonido (Sound Booster + Equalizer).

## Estilo visual

Quiero un diseño inspirado en interfaces premium de Dribbble y Behance.

Características:

- Tema oscuro AMOLED (#050505).
- Colores principales: Neon Cyan (#00E5FF), Electric Blue (#00B8FF), Deep Blue (#007BFF).
- Colores secundarios: Purple Glow (#7B61FF) y Magenta (#FF3CAC) utilizados únicamente como acentos.
- Efectos Glow suaves alrededor de botones, iconos y controles.
- Glassmorphism.
- Gradientes modernos.
- Sombras suaves.
- Bordes redondeados (20–28 px).
- Iluminación ambiental.
- Apariencia premium.
- Diseño minimalista.
- Mucho espacio en blanco.
- Alto contraste.
- Tipografía elegante y moderna.

## Sensación

La aplicación debe transmitir:

- Tecnología
- Potencia
- Inteligencia Artificial
- Audio profesional
- Lujo
- Futurismo
- Calidad Premium

## Componentes

Diseña una pantalla principal con:

- Indicador circular de volumen (gran tamaño)
- Botón principal "BOOST"
- Ecualizador profesional
- Visualizador de ondas de audio
- Presets:
  - Music
  - Movie
  - Gaming
  - Bass Boost
  - Voice
- Tarjetas modernas
- Iconos minimalistas
- Barra inferior de navegación
- Animaciones sugeridas
- Botones flotantes
- Indicadores luminosos

## Paleta

Background:
#050505

Primary:
#00E5FF

Secondary:
#00B8FF

Accent:
#7B61FF

Glow:
#00FFFF

Text:
#FFFFFF

Secondary Text:
#A0A0A0

## Estilo de iluminación

Usa iluminación tipo:

- Neon Glow
- Ambient Light
- Bloom
- Soft Reflection
- Glass Reflection
- Futuristic HUD

## Referencias de estilo

El resultado debe verse como una mezcla de:

- Apple Human Interface
- Samsung One UI
- Nothing OS
- Cyberpunk UI
- Dribbble Premium Design
- Behance Featured UI
- Futuristic Dashboard
- Luxury Audio Application

## Calidad

Quiero un diseño digno de aparecer en Dribbble y Behance.

Debe sentirse como una aplicación de pago (Premium), extremadamente limpia, elegante y moderna.

Evita cualquier apariencia antigua, plana o genérica.

Piensa como un diseñador de interfaces que trabaja para una empresa tecnológica de alto nivel.

Genera un mockup altamente detallado y profesional.

---

## Resumen de lo hecho (2026-07-24)

### 1. Feature nueva: Modos de sonido (Stereo 2.0 / Virtual 2.1 / 5.1 / 7.1)

Implementado en la extensión real (`content.js`, `popup.html`, `popup.css`, `popup.js`, `_locales/es` y `_locales/en`):

- **`content.js`**: nuevo stage de audio agregado a la cadena Web Audio existente (bassFilter → midFilter → trebleFilter), sin romper nada de lo anterior:
  - **Virtual 2.1**: refuerzo extra de graves/medios sumado al ecualizador existente (no crea nodos nuevos, reutiliza bass/mid filter).
  - **Virtual 5.1 / 7.1**: stage nuevo de espacialización con `ChannelSplitter`/`ChannelMerger` + cross-feed de polaridad invertida (ensancha estéreo) + `DelayNode` (efecto Haas, delay muy chico) + reverb ligera sintética generada en código (ruido blanco con caída exponencial, sin archivos externos).
  - **Virtual 7.1** además expone una intensidad configurable (0-100%) que escala cross-feed/delay/reverb.
  - `Stereo 2.0` es el modo por defecto: dejaba el audio intacto, tal cual pediste.
  - Todo con `setTargetAtTime` (sin clicks/pops al cambiar de modo) y creación lazy del `AudioContext` (mismo patrón que ya usaba el ecualizador).
  - Nuevos mensajes: `SV_SET_SURROUND_MODE`, `SV_SET_SURROUND_INTENSITY`.
- **Popup**: tarjeta "Modo de sonido" con 4 botones + slider de intensidad (solo visible en Virtual 7.1), preferencia global persistida en `chrome.storage.local`.
- **i18n**: strings agregados en español e inglés.

**Verificación real**: cargué la extensión en un Chrome aislado (perfil de prueba, `scripts/2-test-extension.sh`) y probé los 4 modos + cambio de intensidad contra una pestaña real de YouTube vía mensajes CDP directos a `content.js` — 0 excepciones, respuestas correctas en cada cambio.

### 2. Rediseño del popup real (ajustes visuales, no solo la feature nueva)

- Quité los emojis de los botones de "Modo de sonido" (a pedido tuyo).
- Integré "Modo de sonido" **dentro de la misma tarjeta del Ecualizador** (con línea divisoria, como ya hacían Voice/Bass Boost) en vez de una tarjeta aparte — más compacto y coherente.
- Recorté paddings/gaps en toda la interfaz (tarjetas, botones, filas) para que todo entre sin scrollbar en el caso normal (~581px de alto) y con scroll mínimo solo en Virtual 7.1, que muestra el slider extra (~634px).
- Validado con capturas reales (CDP) antes/después de los ajustes.

### 3. Build y validación

- Corrido `scripts/3-build.ps1` varias veces: valida `manifest.json`, sintaxis de los `.js`, los `_locales/*/messages.json`, y regenera `dist/super-volume-v2.0.0.zip`. Todo OK.
- La versión del manifest sigue en `2.0.0` (no la subí; si querés publicar esta feature nueva conviene subirla a `2.1.0` antes de mandar a revisión).

### 4. Mockup premium "VOLT" (concepto aparte, no es el popup real)

A partir del brief de diseño de arriba, armé un mockup de app móvil (no es código de la extensión, es una pieza de portfolio/inspiración) publicado como Artifact:

**https://claude.ai/code/artifact/88f5dbfb-4057-43dc-a0b5-e75e5d780ee2**

- Paleta exacta pedida: AMOLED `#050505`, Neon Cyan `#00E5FF`, Electric Blue `#00B8FF`, Deep Blue `#007BFF`, Purple `#7B61FF`, Magenta `#FF3CAC` (como acento puntual).
- Tipografía real embebida (no system-font): **Cabinet Grotesk** (display/números grandes) + **Switzer** (texto/UI), ambas descargadas de Fontshare y metidas en el HTML como `@font-face` en base64 (para que se vean igual en cualquier navegador, sin depender de internet).
- Componentes: dial circular de volumen (hasta 600%, gradiente cónico con glow), botón BOOST pulsante, visualizador de ondas animado, 5 presets (Music/Movie/Gaming/Bass/Voice) con iconos propios minimalistas (sin emoji), ecualizador de 6 bandas con curva de respuesta superpuesta, bottom nav con indicador luminoso, botón flotante con glow, glassmorphism + reflejo de vidrio, iluminación ambiental de fondo.
- A propósito hace referencia a la feature real que construimos (segmentado Stereo/2.1/5.1/7.1 abajo), para que no sea un mockup genérico sino ligado al proyecto real.
- Es de un solo tema (dark AMOLED) a propósito, como pediste explícitamente en el brief.

### Archivos tocados

```
content.js
popup.html
popup.css
popup.js
_locales/es/messages.json
_locales/en/messages.json
dist/super-volume-v2.0.0.zip   (regenerado)
```
