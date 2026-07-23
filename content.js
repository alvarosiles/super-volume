/**
 * content.js — Super Volume
 * ─────────────────────────────────────────────────────────────────────────
 * Se inyecta en TODAS las páginas (y en todos sus iframes, ver manifest.json
 * "all_frames": true) y es responsable de:
 *
 *   1. Detectar automáticamente los elementos <video> y <audio> de la página
 *      (incluidos los que aparecen después de cargar la página, como en
 *      YouTube, Netflix, Twitch, TikTok, etc. que son SPAs).
 *   2. Enrutar el audio de esos elementos a través de un único GainNode
 *      (Web Audio API) para poder amplificarlo hasta 600%.
 *   3. Responder a los mensajes que le envía el popup (subir/bajar volumen,
 *      mute/unmute, consultar el estado actual).
 *   4. Aplicar automáticamente el volumen recordado para el dominio actual
 *      (si el usuario activó "Recordar volumen por sitio").
 *
 * Nota de rendimiento: el AudioContext NUNCA se crea "por si acaso". Solo se
 * crea la primera vez que hace falta (el usuario sube/baja del 100% o activa
 * el mute, o el sitio tiene un volumen recordado distinto de 100%). Si el
 * usuario nunca toca el volumen, esta pestaña no gasta un solo ciclo extra
 * de audio processing. Al navegar a otra página, el propio navegador destruye
 * el contexto del content script (y con él el AudioContext), así que no hace
 * falta limpieza manual entre pestañas.
 */

(() => {
  'use strict';

  // Evita doble inyección si Chrome llega a ejecutar el content script más
  // de una vez sobre el mismo documento (puede pasar con extensiones que
  // fuerzan recargas de content scripts).
  if (window.__superVolumeInjected) return;
  window.__superVolumeInjected = true;

  const MAX_VOLUME_PERCENT = 600;

  // Presets del ecualizador de 3 bandas (dB de ganancia por banda).
  // bass: low-shelf ~150Hz · mid: peaking ~2.5kHz (rango de diálogo) · treble: high-shelf ~8kHz.
  const EQ_PRESETS = {
    none: { bass: 0, mid: 0, treble: 0 },
    cine: { bass: 6, mid: 7, treble: -1 }, // graves de impacto + diálogo claro, agudos suavizados
    musica: { bass: 5, mid: 1, treble: 4 }, // curva en "V": graves y agudos realzados
    juegos: { bass: 3, mid: 2, treble: 7 }, // agudos para pasos/direccionalidad, graves moderados
  };

  // Voice/Bass Boost son un refuerzo adicional que se SUMA al preset activo
  // (incluido 'none'), en vez de ser presets propios.
  const BASS_BOOST_EXTRA_DB = 9;
  const VOICE_BOOST_EXTRA_DB = 10;

  // Estado interno de este frame/pestaña. Todo vive en memoria; nada se
  // guarda aquí en disco (eso lo hace el popup vía chrome.storage).
  const state = {
    audioContext: null,
    gainNode: null,
    bassFilter: null, // BiquadFilterNode 'lowshelf'
    midFilter: null, // BiquadFilterNode 'peaking'
    trebleFilter: null, // BiquadFilterNode 'highshelf'
    sources: new WeakMap(), // HTMLMediaElement -> MediaElementAudioSourceNode
    attachedElements: new Set(), // para poder recorrerlos (WeakMap no es iterable)
    currentPercent: 100, // volumen "objetivo" (0-600)
    muted: false,
    percentBeforeMute: 100,
    eqPreset: 'none',
    bassBoost: false,
    voiceBoost: false,
    observer: null,
  };

  /** Ganancia final por banda: la del preset activo + los boosts independientes que estén activos. */
  function computeEqGains() {
    const preset = EQ_PRESETS[state.eqPreset] || EQ_PRESETS.none;
    return {
      bass: preset.bass + (state.bassBoost ? BASS_BOOST_EXTRA_DB : 0),
      mid: preset.mid + (state.voiceBoost ? VOICE_BOOST_EXTRA_DB : 0),
      treble: preset.treble,
    };
  }

  /** Hay algo del ecualizador (preset o boost) activo que valga la pena mantener/crear. */
  function hasEqActive() {
    return state.eqPreset !== 'none' || state.bassBoost || state.voiceBoost;
  }

  /** Obtiene el dominio actual sin "www." (mismo criterio que usa el popup). */
  function getDomain() {
    try {
      return location.hostname.replace(/^www\./i, '');
    } catch (_err) {
      return '';
    }
  }

  /** Crea (si no existe) el AudioContext + grafo de nodos compartidos del frame. */
  function ensureAudioGraph() {
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContextClass();

      // Cadena: fuente -> bassFilter -> midFilter -> trebleFilter -> gainNode -> salida.
      // Los filtros nacen con la ganancia combinada actual (preset + boosts
      // independientes), por ejemplo recordada de una apertura anterior.
      const gains = computeEqGains();

      state.bassFilter = state.audioContext.createBiquadFilter();
      state.bassFilter.type = 'lowshelf';
      state.bassFilter.frequency.value = 150;
      state.bassFilter.gain.value = gains.bass;

      state.midFilter = state.audioContext.createBiquadFilter();
      state.midFilter.type = 'peaking';
      state.midFilter.frequency.value = 2500;
      state.midFilter.Q.value = 0.9;
      state.midFilter.gain.value = gains.mid;

      state.trebleFilter = state.audioContext.createBiquadFilter();
      state.trebleFilter.type = 'highshelf';
      state.trebleFilter.frequency.value = 8000;
      state.trebleFilter.gain.value = gains.treble;

      state.gainNode = state.audioContext.createGain();
      state.gainNode.gain.value = state.currentPercent / 100;

      state.bassFilter.connect(state.midFilter);
      state.midFilter.connect(state.trebleFilter);
      state.trebleFilter.connect(state.gainNode);
      state.gainNode.connect(state.audioContext.destination);
    }

    // Los navegadores suspenden el AudioContext hasta que hay interacción
    // del usuario con la página. Como estas páginas siempre tienen un
    // <video>/<audio> que el usuario ya reprodujo, normalmente ya hay
    // "user activation", pero intentamos reanudar por si acaso.
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume().catch(() => {});
    }

    return state.audioContext;
  }

  /**
   * Conecta un elemento <video>/<audio> al grafo de Web Audio para que su
   * salida pase por nuestro GainNode. Es seguro llamarla varias veces sobre
   * el mismo elemento: si ya está conectado, no hace nada.
   */
  function attachElement(el) {
    if (!el || state.sources.has(el)) return;
    if (el.dataset && el.dataset.svSkip === '1') return;

    try {
      const ctx = ensureAudioGraph();
      const source = ctx.createMediaElementSource(el);
      source.connect(state.bassFilter);
      state.sources.set(el, source);
      state.attachedElements.add(el);
    } catch (_err) {
      // Puede fallar si el elemento ya está conectado a otro AudioContext
      // (otra extensión, o el propio sitio usa Web Audio API) o si el medio
      // es de otro origen sin cabeceras CORS. En ese caso lo marcamos para
      // no reintentar en cada mutación del DOM.
      if (el.dataset) el.dataset.svSkip = '1';
    }
  }

  /** Busca todos los <video>/<audio> del documento y los conecta. */
  function scanAndAttach(root) {
    const scope = root || document;
    if (typeof scope.querySelectorAll !== 'function') return;
    scope.querySelectorAll('video, audio').forEach(attachElement);
  }

  /** Crea el grafo de audio (si hace falta), conecta `elements` y aplica la ganancia actual. */
  function activateBoost(elements) {
    ensureAudioGraph();
    elements.forEach(attachElement);

    if (!state.muted) {
      // setTargetAtTime evita "clicks"/saltos bruscos al mover el slider.
      state.gainNode.gain.setTargetAtTime(state.currentPercent / 100, state.audioContext.currentTime, 0.015);
    }
  }

  /** Aplica el porcentaje de volumen (0-600) al GainNode compartido. */
  function applyVolume(percent) {
    const clamped = Math.min(MAX_VOLUME_PERCENT, Math.max(0, Number(percent) || 0));
    state.currentPercent = clamped;

    // Si estamos en 100% (volumen nativo) y todavía no existe AudioContext,
    // no hace falta crear nada: dejamos que el navegador reproduzca normal.
    if (clamped === 100 && !state.audioContext) {
      return;
    }

    const elements = document.querySelectorAll('video, audio');

    // Si todavía no hay ningún <video>/<audio> en la página (p. ej. un sitio
    // sin medios, o un SPA que aún no montó su reproductor) no tiene sentido
    // crear un AudioContext sin nada que amplificar: además de ser trabajo
    // desperdiciado, Chrome registra una advertencia de autoplay porque ese
    // contexto nace suspendido sin gesto de usuario. El MutationObserver se
    // encargará de crear el grafo en cuanto aparezca un elemento real.
    if (!state.audioContext && elements.length === 0) {
      return;
    }

    activateBoost(elements);
  }

  /** Activa o desactiva el mute conservando el volumen previo. */
  function setMuted(shouldMute) {
    if (shouldMute === state.muted) return;

    if (shouldMute) {
      state.percentBeforeMute = state.currentPercent;
      state.muted = true;

      // Igual que en applyVolume: sin elementos reales no hace falta crear
      // el AudioContext todavía (el observer lo hará si aparece uno).
      const elements = document.querySelectorAll('video, audio');
      if (state.audioContext || elements.length > 0) {
        ensureAudioGraph();
        elements.forEach(attachElement);
        state.gainNode.gain.setTargetAtTime(0, state.audioContext.currentTime, 0.01);
      }
    } else {
      state.muted = false;
      applyVolume(state.percentBeforeMute);
    }
  }

  /** Re-aplica la ganancia combinada (preset + boosts) a los 3 filtros, creando el grafo si hace falta. */
  function applyEqGains() {
    const elements = document.querySelectorAll('video, audio');
    if (!state.audioContext) {
      // Sin AudioContext y sin nada que amplificar: no hace falta crear el
      // grafo todavía. El MutationObserver lo hará (con el estado correcto,
      // porque ya guardamos eqPreset/bassBoost/voiceBoost) en cuanto aparezca
      // un elemento real, y activateBoost() lo hará si ya hay elementos.
      if (!hasEqActive() || elements.length === 0) return;
      activateBoost(elements);
    }

    const gains = computeEqGains();
    const t = state.audioContext.currentTime;
    state.bassFilter.gain.setTargetAtTime(gains.bass, t, 0.02);
    state.midFilter.gain.setTargetAtTime(gains.mid, t, 0.02);
    state.trebleFilter.gain.setTargetAtTime(gains.treble, t, 0.02);
  }

  /** Aplica un preset del ecualizador, reutilizando el mismo patrón lazy de applyVolume/setMuted. */
  function setEqPreset(preset) {
    const key = EQ_PRESETS[preset] ? preset : 'none';
    if (key === state.eqPreset) return;
    state.eqPreset = key;
    applyEqGains();
  }

  /** Activa/desactiva el refuerzo independiente de graves o voz (se suma al preset activo). */
  function setEqBoost(kind, enabled) {
    const key = kind === 'bass' ? 'bassBoost' : 'voiceBoost';
    if (enabled === state[key]) return;
    state[key] = enabled;
    applyEqGains();
  }

  function hasMediaElements() {
    return document.querySelectorAll('video, audio').length > 0;
  }

  function currentState() {
    return {
      volume: state.currentPercent,
      muted: state.muted,
      hasMedia: hasMediaElements(),
      domain: getDomain(),
      eqPreset: state.eqPreset,
      bassBoost: state.bassBoost,
      voiceBoost: state.voiceBoost,
    };
  }

  // ── Observador de mutaciones ───────────────────────────────────────────
  // Sitios como YouTube, Netflix o TikTok son SPAs: reemplazan el <video>
  // al cambiar de contenido sin recargar la página. Este observer detecta
  // esos nuevos elementos y los conecta automáticamente al grafo de audio
  // ya existente, para que el boost se mantenga sin que el usuario tenga
  // que volver a abrir el popup.
  function startObserving() {
    if (state.observer) return;

    state.observer = new MutationObserver((mutations) => {
      // Si no hay ningún boost activo (volumen, mute o ecualizador), no hay
      // nada que mantener: ignoramos por completo los elementos nuevos
      // (barato y sin crear ningún AudioContext de más).
      if (state.currentPercent === 100 && !state.muted && !hasEqActive()) return;

      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          let found = [];
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
            found = [node];
          } else if (node.querySelectorAll) {
            found = Array.from(node.querySelectorAll('video, audio'));
          }
          if (!found.length) return;

          if (state.audioContext) {
            found.forEach(attachElement);
            const target = state.muted ? 0 : state.currentPercent / 100;
            state.gainNode.gain.setTargetAtTime(target, state.audioContext.currentTime, 0.015);
          } else {
            // Primer elemento real de la página: recién ahora vale la pena
            // crear el AudioContext.
            activateBoost(found);
            if (state.muted) state.gainNode.gain.setTargetAtTime(0, state.audioContext.currentTime, 0.01);
          }
        });
      }
    });

    state.observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  }

  // ── Mensajería con el popup / background ───────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    switch (message.type) {
      case 'SV_SET_VOLUME':
        applyVolume(message.value);
        sendResponse({ ok: true, state: currentState() });
        break;

      case 'SV_SET_MUTED':
        setMuted(Boolean(message.value));
        sendResponse({ ok: true, state: currentState() });
        break;

      case 'SV_SET_EQ_PRESET':
        setEqPreset(String(message.value));
        sendResponse({ ok: true, state: currentState() });
        break;

      case 'SV_SET_BASS_BOOST':
        setEqBoost('bass', Boolean(message.value));
        sendResponse({ ok: true, state: currentState() });
        break;

      case 'SV_SET_VOICE_BOOST':
        setEqBoost('voice', Boolean(message.value));
        sendResponse({ ok: true, state: currentState() });
        break;

      case 'SV_GET_STATE':
        sendResponse({ ok: true, state: currentState() });
        break;

      default:
        return false;
    }

    return true; // mantenemos el canal abierto por si sendResponse es async
  });

  // ── Inicialización ──────────────────────────────────────────────────────
  function init() {
    startObserving();

    // Nota: NO se hace un scanAndAttach(document) aquí. Conectar un elemento
    // al grafo de Web Audio exige crear el AudioContext, y hacerlo en cada
    // carga de página (aunque el volumen siga en 100%) es exactamente el
    // desperdicio que este archivo dice evitar. applyVolume() ya se encarga
    // de escanear y conectar los elementos la primera vez que de verdad
    // hace falta (volumen ≠ 100% o mute).

    // Si el usuario activó "recordar volumen por sitio", aplicamos de una
    // vez el valor guardado para este dominio (si existe y no es 100%).
    chrome.storage.local.get(
      ['rememberEnabled', 'volumes', 'eqPreset', 'bassBoostEnabled', 'voiceBoostEnabled'],
      (data) => {
        if (chrome.runtime.lastError) return;

        const rememberEnabled = data.rememberEnabled === true; // false por defecto
        const volumes = data.volumes || {};
        const domain = getDomain();
        const saved = volumes[domain];

        if (rememberEnabled && typeof saved === 'number' && saved !== 100) {
          applyVolume(saved);
        }

        // El preset y los boosts del ecualizador son preferencias globales
        // (no por sitio): si el usuario los activó la última vez, se
        // restauran en cada pestaña. Por defecto el preset es 'none'.
        if (data.eqPreset && data.eqPreset !== 'none') setEqPreset(data.eqPreset);
        if (data.bassBoostEnabled) setEqBoost('bass', true);
        if (data.voiceBoostEnabled) setEqBoost('voice', true);
      }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
