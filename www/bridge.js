/* bridge.js — replaces Electron's window.api with web/Capacitor equivalents
   for the Android build of Price Checker.                                 */

(function () {
  'use strict';

  // ── Persistent storage (localStorage works fine in Capacitor WebView) ──
  function saveState(data) {
    try { localStorage.setItem('priceCheckerState', JSON.stringify(data)); }
    catch (e) { console.warn('saveState failed', e); }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('priceCheckerState');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ── HTTP RPC (direct fetch — Capacitor WebView allows cross-origin) ──
  async function rpc(url, params) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const data = await res.json();
    if (data.error) {
      const msg = data.error.data?.message || JSON.stringify(data.error);
      throw new Error(msg);
    }
    return data.result;
  }

  // ── Expose window.api matching the Electron preload interface ──
  window.api = {
    rpc,
    saveState,
    loadState,
    log(msg)    { console.log('[PriceChecker]', msg); },
    openLog()   { alert('Logs are in the browser dev console on Android.'); },
    async toggleFullscreen() { return { isFullscreen: true }; },
    async fetchProductImage(baseUrl, tmplId) {
      return baseUrl + '/web/image/product.template/' + tmplId + '/image_1920';
    },
    setBaseUrl(url) { window._pcBaseUrl = url; }
  };

  console.log('[bridge.js] window.api ready (Capacitor/web mode)');
})();
