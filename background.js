/**
 * background.js — Super Volume
 * ─────────────────────────────────────────────────────────────────────────
 * Service worker de Manifest V3. Es intencionalmente ligero: no crea
 * AudioContext ni maneja audio (eso vive por completo en content.js,
 * dentro de la propia pestaña). Sus únicas responsabilidades son:
 *
 *   1. Inicializar la configuración por defecto al instalar la extensión.
 *   2. Mantener el "badge" del icono de la extensión sincronizado con el
 *      volumen guardado del sitio activo, para que el usuario vea el boost
 *      aplicado sin necesidad de abrir el popup.
 *
 * Al ser un service worker, Chrome puede detenerlo en cualquier momento
 * cuando está inactivo; por eso no guarda estado propio en memoria más
 * allá de lo estrictamente necesario para atender el evento actual.
 */

const DEFAULT_SETTINGS = {
  rememberEnabled: false,
  volumes: {}, // { "youtube.com": 250, "spotify.com": 180, ... }
};

/** Instala los valores por defecto la primera vez que se instala la extensión. */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;

  chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (data) => {
    const patch = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (data[key] === undefined) patch[key] = DEFAULT_SETTINGS[key];
    }
    if (Object.keys(patch).length) {
      chrome.storage.local.set(patch);
    }
  });
});

/** Extrae el dominio (sin "www.") de una URL de pestaña. */
function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch (_err) {
    return null;
  }
}

/** Pinta el badge del icono con el % guardado para el dominio de esa pestaña. */
function refreshBadgeForTab(tabId, url) {
  const domain = domainFromUrl(url);
  if (!domain) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  chrome.storage.local.get(['rememberEnabled', 'volumes'], (data) => {
    if (chrome.runtime.lastError) return;

    const rememberEnabled = data.rememberEnabled === true;
    const volumes = data.volumes || {};
    const saved = volumes[domain];

    if (rememberEnabled && typeof saved === 'number' && saved !== 100) {
      chrome.action.setBadgeText({ tabId, text: `${saved}` });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#4285F4' });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  });
}

// Actualiza el badge al cambiar de pestaña activa...
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    refreshBadgeForTab(tabId, tab.url);
  });
});

// ...y cuando una pestaña termina de cargar una URL nueva.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    refreshBadgeForTab(tabId, tab.url);
  }
});
