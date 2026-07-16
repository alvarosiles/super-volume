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

  // Estado interno de este frame/pestaña. Todo vive en memoria; nada se
  // guarda aquí en disco (eso lo hace el popup vía chrome.storage).
  const state = {
    audioContext: null,
    gainNode: null,
    sources: new WeakMap(), // HTMLMediaElement -> MediaElementAudioSourceNode
    attachedElements: new Set(), // para poder recorrerlos (WeakMap no es iterable)
    currentPercent: 100, // volumen "objetivo" (0-600)
    muted: false,
    percentBeforeMute: 100,
    observer: null,
  };

  /** Obtiene el dominio actual sin "www." (mismo criterio que usa el popup). */
  function getDomain() {
    try {
      return location.hostname.replace(/^www\./i, '');
    } catch (_err) {
      return '';
    }
  }

  /** Crea (si no existe) el AudioContext + GainNode compartidos del frame. */
  function ensureAudioGraph() {
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContextClass();
      state.gainNode = state.audioContext.createGain();
      state.gainNode.connect(state.audioContext.destination);
      state.gainNode.gain.value = state.currentPercent / 100;
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
      source.connect(state.gainNode);
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

  /** Aplica el porcentaje de volumen (0-600) al GainNode compartido. */
  function applyVolume(percent) {
    const clamped = Math.min(MAX_VOLUME_PERCENT, Math.max(0, Number(percent) || 0));
    state.currentPercent = clamped;

    // Si estamos en 100% (volumen nativo) y todavía no existe AudioContext,
    // no hace falta crear nada: dejamos que el navegador reproduzca normal.
    if (clamped === 100 && !state.audioContext) {
      return;
    }

    ensureAudioGraph();
    scanAndAttach(document);

    if (!state.muted) {
      // setTargetAtTime evita "clicks"/saltos bruscos al mover el slider.
      state.gainNode.gain.setTargetAtTime(clamped / 100, state.audioContext.currentTime, 0.015);
    }
  }

  /** Activa o desactiva el mute conservando el volumen previo. */
  function setMuted(shouldMute) {
    if (shouldMute === state.muted) return;

    if (shouldMute) {
      state.percentBeforeMute = state.currentPercent;
      ensureAudioGraph();
      scanAndAttach(document);
      state.muted = true;
      state.gainNode.gain.setTargetAtTime(0, state.audioContext.currentTime, 0.01);
    } else {
      state.muted = false;
      applyVolume(state.percentBeforeMute);
    }
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
      // Solo nos interesa reaccionar si ya hay un boost activo (audioContext
      // creado) o si el elemento nuevo necesita quedar registrado para un
      // futuro cambio de volumen. Igualmente es una operación barata.
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
            if (state.audioContext) attachElement(node);
          } else if (node.querySelectorAll) {
            const found = node.querySelectorAll('video, audio');
            if (found.length && state.audioContext) {
              found.forEach(attachElement);
            }
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
    scanAndAttach(document);

    // Si el usuario activó "recordar volumen por sitio", aplicamos de una
    // vez el valor guardado para este dominio (si existe y no es 100%).
    chrome.storage.local.get(['rememberEnabled', 'volumes'], (data) => {
      if (chrome.runtime.lastError) return;

      const rememberEnabled = data.rememberEnabled !== false; // true por defecto
      const volumes = data.volumes || {};
      const domain = getDomain();
      const saved = volumes[domain];

      if (rememberEnabled && typeof saved === 'number' && saved !== 100) {
        applyVolume(saved);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
