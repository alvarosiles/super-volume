/**
 * popup.js — Super Volume
 * ─────────────────────────────────────────────────────────────────────────
 * Controla la interfaz del popup:
 *   - Lee la pestaña activa (título, dominio, favicon).
 *   - Pregunta a content.js el estado real aplicado (volumen/mute).
 *   - Envía cambios de volumen/mute al content script de la pestaña activa.
 *   - Persiste el volumen por dominio y la preferencia "recordar volumen"
 *     en chrome.storage.local.
 *   - Actualiza el badge del icono de la extensión para esa pestaña.
 *
 * Este popup SOLO afecta a la pestaña activa (chrome.tabs.query con
 * {active: true, currentWindow: true}), tal como pide el requisito de
 * "funcionar únicamente en la pestaña activa".
 */

(() => {
  'use strict';

  const MAX_VOLUME = 600;
  const STORAGE_SAVE_DEBOUNCE_MS = 300;

  // ── Referencias al DOM ────────────────────────────────────────────────
  const els = {
    favicon: document.getElementById('siteFavicon'),
    title: document.getElementById('siteTitle'),
    domain: document.getElementById('siteDomain'),
    noMediaBadge: document.getElementById('noMediaBadge'),
    slider: document.getElementById('volumeSlider'),
    value: document.getElementById('volumeValue'),
    resetBtn: document.getElementById('resetBtn'),
    muteBtn: document.getElementById('muteBtn'),
    muteLabel: document.getElementById('muteLabel'),
    iconUnmuted: document.querySelector('.icon--unmuted'),
    iconMuted: document.querySelector('.icon--muted'),
    rememberToggle: document.getElementById('rememberToggle'),
    status: document.getElementById('statusMessage'),
    siteCard: document.getElementById('siteCard'),
  };

  // Estado local del popup para esta apertura.
  const local = {
    tabId: null,
    domain: '',
    rememberEnabled: true,
    muted: false,
    volumeBeforeMute: 100,
    saveTimer: null,
    contentScriptAvailable: true,
  };

  const FALLBACK_FAVICON =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239aa0a6">' +
        '<path d="M3 9v6h4l5 5V4L7 9H3z"/></svg>'
    );

  /** Envía un mensaje al content script de la pestaña activa (con manejo de error). */
  function sendToContentScript(message) {
    return new Promise((resolve) => {
      if (local.tabId == null) return resolve(null);
      chrome.tabs.sendMessage(local.tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          // No hay content script en esta página (chrome://, Web Store, PDF, etc.)
          local.contentScriptAvailable = false;
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    });
  }

  /** Actualiza el gradiente de relleno del slider según el valor actual. */
  function paintSliderFill(percent) {
    const pct = (percent / MAX_VOLUME) * 100;
    els.slider.style.background =
      `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--border) ${pct}%)`;
  }

  /** Refleja un valor de volumen en toda la UI (slider, número, colores). */
  function renderVolume(percent) {
    els.slider.value = percent;
    els.value.textContent = `${percent}%`;
    paintSliderFill(percent);

    els.value.classList.toggle('volume-card__value--boosted', percent > 100 && !local.muted);
    els.value.classList.toggle('volume-card__value--muted', local.muted);
  }

  /** Refleja el estado de mute en el botón correspondiente. */
  function renderMute(muted) {
    local.muted = muted;
    els.muteBtn.setAttribute('aria-pressed', String(muted));
    els.muteLabel.textContent = muted ? 'Unmute' : 'Mute';
    els.iconUnmuted.classList.toggle('hidden', muted);
    els.iconMuted.classList.toggle('hidden', !muted);
    els.value.classList.toggle('volume-card__value--muted', muted);
  }

  function showStatus(text) {
    els.status.textContent = text;
    if (text) {
      clearTimeout(showStatus._t);
      showStatus._t = setTimeout(() => {
        els.status.textContent = '';
      }, 1800);
    }
  }

  /** Pinta el badge de la extensión con el % actual para esta pestaña. */
  function updateBadge(percent) {
    if (local.tabId == null) return;
    if (percent === 100) {
      chrome.action.setBadgeText({ tabId: local.tabId, text: '' });
      return;
    }
    chrome.action.setBadgeBackgroundColor({ tabId: local.tabId, color: '#4285F4' });
    chrome.action.setBadgeText({ tabId: local.tabId, text: `${percent}` });
  }

  /** Guarda (con debounce) el volumen del dominio actual, si "recordar" está activo. */
  function persistVolume(percent) {
    if (!local.rememberEnabled || !local.domain) return;

    clearTimeout(local.saveTimer);
    local.saveTimer = setTimeout(() => {
      chrome.storage.local.get(['volumes'], (data) => {
        const volumes = data.volumes || {};
        if (percent === 100) {
          delete volumes[local.domain]; // 100% es el valor por defecto: no hace falta guardarlo
        } else {
          volumes[local.domain] = percent;
        }
        chrome.storage.local.set({ volumes });
      });
    }, STORAGE_SAVE_DEBOUNCE_MS);
  }

  /** Aplica un nuevo volumen: UI + content script + storage + badge. */
  async function setVolume(percent, { persist = true } = {}) {
    const clamped = Math.min(MAX_VOLUME, Math.max(0, percent));
    renderVolume(clamped);
    updateBadge(clamped);
    if (persist) persistVolume(clamped);

    await sendToContentScript({ type: 'SV_SET_VOLUME', value: clamped });
  }

  async function toggleMute() {
    const next = !local.muted;

    if (next) {
      local.volumeBeforeMute = Number(els.slider.value);
    }

    renderMute(next);
    await sendToContentScript({ type: 'SV_SET_MUTED', value: next });

    if (!next) {
      // Al desmutear, la UI ya refleja el volumen previo (no lo tocamos).
      renderVolume(local.volumeBeforeMute);
    }
  }

  // ── Inicialización ──────────────────────────────────────────────────────
  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    local.tabId = tab.id;

    let domain = '';
    try {
      domain = new URL(tab.url).hostname.replace(/^www\./i, '');
    } catch (_err) {
      domain = '';
    }
    local.domain = domain;

    els.title.textContent = tab.title || 'Pestaña sin título';
    els.domain.textContent = domain || 'Página especial del navegador';
    els.favicon.src = tab.favIconUrl || FALLBACK_FAVICON;
    els.favicon.onerror = () => {
      els.favicon.src = FALLBACK_FAVICON;
    };

    // 1. Leer preferencias guardadas.
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(['rememberEnabled', 'volumes'], resolve)
    );
    local.rememberEnabled = stored.rememberEnabled !== false;
    els.rememberToggle.checked = local.rememberEnabled;

    const savedVolume =
      domain && stored.volumes && typeof stored.volumes[domain] === 'number'
        ? stored.volumes[domain]
        : 100;

    // 2. Preguntar al content script el estado REAL aplicado en la página
    //    (puede diferir si el content script ya auto-aplicó el volumen
    //    guardado al cargar la página).
    const response = await sendToContentScript({ type: 'SV_GET_STATE' });

    if (response && response.ok) {
      const { volume, muted, hasMedia } = response.state;
      renderVolume(volume);
      renderMute(muted);
      local.volumeBeforeMute = muted ? savedVolume : volume;
      els.noMediaBadge.classList.toggle('hidden', hasMedia);
      updateBadge(volume);
    } else {
      // No hay content script disponible en esta página (p. ej. chrome://,
      // Chrome Web Store, un PDF, o una pestaña recién abierta). Mostramos
      // el último valor guardado solo como referencia y deshabilitamos los
      // controles para no generar una falsa sensación de control.
      renderVolume(savedVolume);
      els.noMediaBadge.textContent = 'No disponible aquí';
      els.noMediaBadge.classList.remove('hidden');
      els.slider.disabled = true;
      els.resetBtn.disabled = true;
      els.muteBtn.disabled = true;
      showStatus('Esta página no permite ajustar el audio.');
    }
  }

  // ── Eventos de usuario ──────────────────────────────────────────────────

  // Cambios en vivo mientras se arrastra el slider.
  els.slider.addEventListener('input', () => {
    const value = Number(els.slider.value);
    if (local.muted) renderMute(false); // mover el slider desmutea, como es intuitivo
    setVolume(value, { persist: false });
  });

  // Al soltar el slider, persistimos en storage (evita escrituras excesivas).
  els.slider.addEventListener('change', () => {
    persistVolume(Number(els.slider.value));
  });

  els.resetBtn.addEventListener('click', () => {
    if (local.muted) renderMute(false);
    setVolume(100);
    showStatus('Volumen restablecido a 100%');
  });

  els.muteBtn.addEventListener('click', () => {
    toggleMute();
  });

  els.rememberToggle.addEventListener('change', () => {
    local.rememberEnabled = els.rememberToggle.checked;
    chrome.storage.local.set({ rememberEnabled: local.rememberEnabled });
    showStatus(local.rememberEnabled ? 'Se recordará el volumen de este sitio' : 'Ya no se recordará el volumen');
  });

  init();
})();
