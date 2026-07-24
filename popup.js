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
    eqPresetButtons: Array.from(document.querySelectorAll('.eq-preset')),
    voiceBoostToggle: document.getElementById('voiceBoostToggle'),
    bassBoostToggle: document.getElementById('bassBoostToggle'),
    surroundModeButtons: Array.from(document.querySelectorAll('.surround-mode')),
    surroundModeDesc: document.getElementById('surroundModeDesc'),
    surroundIntensityRow: document.getElementById('surroundIntensityRow'),
    surroundIntensitySlider: document.getElementById('surroundIntensitySlider'),
    surroundIntensityValue: document.getElementById('surroundIntensityValue'),
    status: document.getElementById('statusMessage'),
    siteCard: document.getElementById('siteCard'),
    themeToggle: document.getElementById('themeToggle'),
    themeIconAuto: document.querySelector('.icon--theme-auto'),
    themeIconLight: document.querySelector('.icon--theme-light'),
    themeIconDark: document.querySelector('.icon--theme-dark'),
    langToggle: document.getElementById('langToggle'),
    langToggleLabel: document.querySelector('.lang-toggle-label'),
  };

  // Estado local del popup para esta apertura.
  const local = {
    tabId: null,
    domain: '',
    rememberEnabled: false,
    muted: false,
    volumeBeforeMute: 100,
    saveTimer: null,
    contentScriptAvailable: true,
    theme: 'auto',
    eqPreset: 'none',
    surroundMode: 'stereo',
    surroundIntensity: 60,
    language: 'auto',
    tabInfoLoaded: false,
    tabTitleRaw: '',
    noContentScript: false,
  };

  const THEME_ORDER = ['auto', 'light', 'dark'];
  const THEME_LABEL_KEYS = { auto: 'themeLabelAuto', light: 'themeLabelLight', dark: 'themeLabelDark' };
  const EQ_LABEL_KEYS = { none: 'eqPresetNone', cine: 'eqPresetCine', musica: 'eqPresetMusica', juegos: 'eqPresetJuegos' };

  const SURROUND_MODE_ORDER = ['stereo', 'virtual21', 'virtual51', 'virtual71'];
  const SURROUND_LABEL_KEYS = {
    stereo: 'surroundModeStereo',
    virtual21: 'surroundModeVirtual21',
    virtual51: 'surroundModeVirtual51',
    virtual71: 'surroundModeVirtual71',
  };
  const SURROUND_DESC_KEYS = {
    stereo: 'surroundDescStereo',
    virtual21: 'surroundDescVirtual21',
    virtual51: 'surroundDescVirtual51',
    virtual71: 'surroundDescVirtual71',
  };

  const LANG_ORDER = ['auto', 'en', 'es'];
  const LANG_LABEL_KEYS = { auto: 'langLabelAuto', en: 'langLabelEn', es: 'langLabelEs' };
  const LANG_BUTTON_TEXT = { auto: 'A', en: 'EN', es: 'ES' };

  // Mensajes del idioma forzado (en/es), cargados desde _locales/<lang>/messages.json
  // cuando el usuario elige un idioma explícito en vez de "Automático". chrome.i18n
  // solo sabe seguir el idioma del navegador, así que para poder forzarlo leemos
  // directamente el mismo JSON que usa Chrome, sin duplicar los textos.
  let overrideMessages = null;

  async function loadOverrideMessages(lang) {
    if (lang === 'auto') {
      overrideMessages = null;
      return;
    }
    try {
      const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
      overrideMessages = await res.json();
    } catch (_err) {
      overrideMessages = null; // si falla, seguimos con chrome.i18n como respaldo
    }
  }

  /** Atajo de traducción: usa el idioma forzado si hay uno, si no el del navegador (chrome.i18n). */
  function t(key, substitutions) {
    const entry = overrideMessages && overrideMessages[key];
    if (entry) {
      const subs = substitutions == null ? [] : [].concat(substitutions);
      let msg = entry.message;
      if (entry.placeholders) {
        for (const [name, def] of Object.entries(entry.placeholders)) {
          const idx = Number(String(def.content).replace('$', '')) - 1;
          msg = msg.replace(new RegExp(`\\$${name}\\$`, 'gi'), subs[idx] != null ? subs[idx] : '');
        }
      }
      return msg;
    }
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  /** Rellena todo el texto estático del popup con el idioma del navegador (chrome.i18n). */
  function localizeStaticText() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
  }

  /**
   * Textos que dependen a la vez del idioma Y de datos dinámicos (título real
   * de la pestaña, si hay content script disponible). No pueden vivir en
   * data-i18n porque localizeStaticText() los pisaría con el placeholder
   * genérico; se recalculan a mano cada vez que cambia el idioma.
   */
  function refreshSiteText() {
    els.title.textContent = local.tabInfoLoaded ? local.tabTitleRaw || t('siteUntitledTab') : t('siteLoading');
    if (local.tabInfoLoaded) {
      els.domain.textContent = local.domain || t('siteSpecialPage');
    }
    els.noMediaBadge.textContent = local.noContentScript ? t('badgeNotAvailable') : t('badgeNoAudio');
  }

  /** Cambia el idioma (auto/en/es), recarga los mensajes si hace falta y re-traduce todo. */
  async function applyLanguage(lang) {
    local.language = LANG_ORDER.includes(lang) ? lang : 'auto';
    await loadOverrideMessages(local.language);

    localizeStaticText();
    refreshSiteText();
    renderMute(local.muted);
    applyTheme(local.theme);
    els.surroundModeDesc.textContent = t(SURROUND_DESC_KEYS[local.surroundMode]);

    const label = t(LANG_LABEL_KEYS[local.language]);
    els.langToggleLabel.textContent = LANG_BUTTON_TEXT[local.language];
    els.langToggle.setAttribute('aria-label', t('langAriaLabel', [label]));
    els.langToggle.title = t('langTitle', [label]);
  }

  /** Marca el botón de preset activo y refleja aria-pressed en el resto. */
  function applyEqPreset(preset) {
    local.eqPreset = preset in EQ_LABEL_KEYS ? preset : 'none';
    els.eqPresetButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.preset === local.eqPreset));
    });
  }

  /** Marca el modo de sonido activo, actualiza la descripción y muestra/oculta el slider de intensidad (solo Virtual 7.1). */
  function applySurroundMode(mode) {
    local.surroundMode = SURROUND_MODE_ORDER.includes(mode) ? mode : 'stereo';
    els.surroundModeButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === local.surroundMode));
    });
    els.surroundModeDesc.textContent = t(SURROUND_DESC_KEYS[local.surroundMode]);
    els.surroundIntensityRow.classList.toggle('hidden', local.surroundMode !== 'virtual71');
  }

  /** Refleja el % de intensidad (solo relevante en Virtual 7.1) en el slider. */
  function renderSurroundIntensity(percent) {
    local.surroundIntensity = percent;
    els.surroundIntensitySlider.value = percent;
    els.surroundIntensityValue.textContent = `${percent}%`;
  }

  /** Aplica el tema elegido al documento y refleja el icono/estado del botón. */
  function applyTheme(theme) {
    local.theme = theme;
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    const label = t(THEME_LABEL_KEYS[theme]);
    els.themeIconAuto.classList.toggle('hidden', theme !== 'auto');
    els.themeIconLight.classList.toggle('hidden', theme !== 'light');
    els.themeIconDark.classList.toggle('hidden', theme !== 'dark');
    els.themeToggle.setAttribute('aria-label', t('themeAriaLabel', [label]));
    els.themeToggle.title = t('themeTitle', [label]);
  }

  const FALLBACK_FAVICON =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239aa0a6">' +
        '<path d="M3 9v6h4l5 5V4L7 9H3z"/></svg>'
    );

  /** Envía `message` a un frame concreto de la pestaña activa (o a todos si se omite `frameId`). */
  function sendToFrame(message, frameId) {
    return new Promise((resolve) => {
      const options = frameId == null ? {} : { frameId };
      chrome.tabs.sendMessage(local.tabId, message, options, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    });
  }

  /**
   * Envía un mensaje al content script de la pestaña activa. Páginas como
   * YouTube cargan varios frames a la vez en la misma pestaña (el frame
   * principal, un iframe oculto de accounts.google.com, un about:blank...);
   * como todos matchean <all_urls> también tienen su propia instancia de
   * content.js. chrome.tabs.sendMessage sin frameId puede devolver la
   * respuesta de CUALQUIERA de esos frames, y si contesta uno sin <video>
   * (el de login, el about:blank) el popup ve "sin audio" aunque el video
   * real esté sonando en el frame principal. Por eso primero preguntamos
   * puntualmente al frame principal (frameId 0); solo si ahí no hay medios
   * (p. ej. un sitio que embebe el reproductor en un <iframe> propio)
   * probamos sin frameId como respaldo.
   */
  async function sendToContentScript(message) {
    if (local.tabId == null) return null;

    const topResponse = await sendToFrame(message, 0);
    if (topResponse && topResponse.ok && topResponse.state && topResponse.state.hasMedia) {
      return topResponse;
    }

    const anyResponse = await sendToFrame(message);
    if (anyResponse) return anyResponse;

    // Nada respondió: no hay content script disponible en esta página
    // (chrome://, Web Store, un PDF, etc.).
    local.contentScriptAvailable = false;
    return topResponse;
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
    els.muteLabel.textContent = muted ? t('btnUnmute') : t('btnMute');
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
    localizeStaticText(); // síncrono con chrome.i18n: evita parpadeo mientras se lee el idioma guardado

    const [[tab], stored] = await Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      new Promise((resolve) =>
        chrome.storage.local.get(
          [
            'rememberEnabled',
            'volumes',
            'theme',
            'eqPreset',
            'bassBoostEnabled',
            'voiceBoostEnabled',
            'surroundMode',
            'surroundIntensity',
            'language',
          ],
          resolve
        )
      ),
    ]);

    await applyLanguage(LANG_ORDER.includes(stored.language) ? stored.language : 'auto');
    applyTheme(THEME_ORDER.includes(stored.theme) ? stored.theme : 'auto');

    if (!tab) return;

    local.tabId = tab.id;

    let domain = '';
    try {
      domain = new URL(tab.url).hostname.replace(/^www\./i, '');
    } catch (_err) {
      domain = '';
    }
    local.domain = domain;
    local.tabTitleRaw = tab.title || '';
    local.tabInfoLoaded = true;
    refreshSiteText();
    els.favicon.src = tab.favIconUrl || FALLBACK_FAVICON;
    els.favicon.onerror = () => {
      els.favicon.src = FALLBACK_FAVICON;
    };

    // 1. Aplicar preferencias ya cargadas.
    local.rememberEnabled = stored.rememberEnabled === true;
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
      const { volume, muted, hasMedia, eqPreset, bassBoost, voiceBoost, surroundMode, surroundIntensity } = response.state;
      renderVolume(volume);
      renderMute(muted);
      applyEqPreset(eqPreset);
      els.voiceBoostToggle.checked = Boolean(voiceBoost);
      els.bassBoostToggle.checked = Boolean(bassBoost);
      renderSurroundIntensity(typeof surroundIntensity === 'number' ? surroundIntensity : 60);
      applySurroundMode(surroundMode);
      local.volumeBeforeMute = muted ? savedVolume : volume;
      els.noMediaBadge.classList.toggle('hidden', hasMedia);
      updateBadge(volume);
    } else {
      // No hay content script disponible en esta página (p. ej. chrome://,
      // Chrome Web Store, un PDF, o una pestaña recién abierta). Mostramos
      // el último valor guardado solo como referencia y deshabilitamos los
      // controles para no generar una falsa sensación de control.
      renderVolume(savedVolume);
      applyEqPreset(stored.eqPreset);
      els.voiceBoostToggle.checked = Boolean(stored.voiceBoostEnabled);
      els.bassBoostToggle.checked = Boolean(stored.bassBoostEnabled);
      renderSurroundIntensity(typeof stored.surroundIntensity === 'number' ? stored.surroundIntensity : 60);
      applySurroundMode(stored.surroundMode);
      local.noContentScript = true;
      refreshSiteText();
      els.noMediaBadge.classList.remove('hidden');
      els.slider.disabled = true;
      els.resetBtn.disabled = true;
      els.muteBtn.disabled = true;
      els.eqPresetButtons.forEach((btn) => { btn.disabled = true; });
      els.voiceBoostToggle.disabled = true;
      els.bassBoostToggle.disabled = true;
      els.surroundModeButtons.forEach((btn) => { btn.disabled = true; });
      els.surroundIntensitySlider.disabled = true;
      showStatus(t('statusNoAudioPage'));
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
    showStatus(t('statusVolumeReset'));
  });

  els.muteBtn.addEventListener('click', () => {
    toggleMute();
  });

  els.rememberToggle.addEventListener('change', () => {
    local.rememberEnabled = els.rememberToggle.checked;
    chrome.storage.local.set({ rememberEnabled: local.rememberEnabled });
    showStatus(t(local.rememberEnabled ? 'statusRememberOn' : 'statusRememberOff'));
  });

  els.eqPresetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset === local.eqPreset) return;
      applyEqPreset(preset);
      chrome.storage.local.set({ eqPreset: preset });
      sendToContentScript({ type: 'SV_SET_EQ_PRESET', value: preset });
      showStatus(preset === 'none' ? t('statusEqOff') : t('statusEqOn', [t(EQ_LABEL_KEYS[preset])]));
    });
  });

  els.voiceBoostToggle.addEventListener('change', () => {
    const enabled = els.voiceBoostToggle.checked;
    chrome.storage.local.set({ voiceBoostEnabled: enabled });
    sendToContentScript({ type: 'SV_SET_VOICE_BOOST', value: enabled });
    showStatus(t(enabled ? 'statusVoiceBoostOn' : 'statusVoiceBoostOff'));
  });

  els.bassBoostToggle.addEventListener('change', () => {
    const enabled = els.bassBoostToggle.checked;
    chrome.storage.local.set({ bassBoostEnabled: enabled });
    sendToContentScript({ type: 'SV_SET_BASS_BOOST', value: enabled });
    showStatus(t(enabled ? 'statusBassBoostOn' : 'statusBassBoostOff'));
  });

  els.surroundModeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === local.surroundMode) return;
      applySurroundMode(mode);
      chrome.storage.local.set({ surroundMode: mode });
      sendToContentScript({ type: 'SV_SET_SURROUND_MODE', value: mode });
      showStatus(t('statusSurroundMode', [t(SURROUND_LABEL_KEYS[local.surroundMode])]));
    });
  });

  els.surroundIntensitySlider.addEventListener('input', () => {
    const value = Number(els.surroundIntensitySlider.value);
    renderSurroundIntensity(value);
    sendToContentScript({ type: 'SV_SET_SURROUND_INTENSITY', value });
  });

  els.surroundIntensitySlider.addEventListener('change', () => {
    chrome.storage.local.set({ surroundIntensity: Number(els.surroundIntensitySlider.value) });
  });

  els.themeToggle.addEventListener('click', () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(local.theme) + 1) % THEME_ORDER.length];
    applyTheme(next);
    chrome.storage.local.set({ theme: next });
    showStatus(t('themeTitle', [t(THEME_LABEL_KEYS[next])]));
  });

  els.langToggle.addEventListener('click', async () => {
    const next = LANG_ORDER[(LANG_ORDER.indexOf(local.language) + 1) % LANG_ORDER.length];
    await applyLanguage(next);
    chrome.storage.local.set({ language: next });
    showStatus(t('langTitle', [t(LANG_LABEL_KEYS[next])]));
  });

  init();
})();
