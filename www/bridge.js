/* bridge.js — replaces Electron's window.api with web/Capacitor equivalents
   for the Android build of Price Checker.                                 */

(function () {
  'use strict';

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

  async function rpc(url, params) {
    const hasNativeHttp = window.Capacitor &&
      window.Capacitor.Plugins &&
      window.Capacitor.Plugins.CapacitorHttp;

    if (hasNativeHttp) {
      try {
        const res = await window.Capacitor.Plugins.CapacitorHttp.request({
          url,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          data: params
        });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (data.error) {
          const msg = data.error.data?.message || JSON.stringify(data.error);
          throw new Error(msg);
        }
        return data.result;
      } catch (e) {
        console.warn('[bridge.js] CapacitorHttp failed, falling back to fetch:', e.message);
      }
    }

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

  const _logBuffer = [];
  function _log(msg) {
    const line = new Date().toISOString() + ' — ' + msg;
    _logBuffer.push(line);
    if (_logBuffer.length > 300) _logBuffer.shift();
    console.log('[PriceChecker]', msg);
  }

  window.api = {
    rpc,
    saveState,
    loadState,
    log: _log,
    openLog() {
      alert(_logBuffer.length
        ? _logBuffer.slice(-40).join('\n')
        : 'No log entries yet.');
    },
    async toggleFullscreen() { return { isFullscreen: true }; },
    async fetchProductImage(baseUrl, tmplId) {
      return baseUrl + '/web/image/product.template/' + tmplId + '/image_1920';
    },
    setBaseUrl(url) { window._pcBaseUrl = url; }
  };

  console.log('[bridge.js] window.api ready (Capacitor/web mode)');
})();
