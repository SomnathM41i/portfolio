/* tracker.js — visitor device fingerprint + IP/geo capture.
   Fires once per browser session on page load and posts the data
   to the portfolio Formspree endpoint (emails the owner).

   Design rules:
   - Never block or break the page. Everything async, everything timed out.
   - One email per session (sessionStorage dedupe).
   - Silent failure: tracking must be invisible to the visitor. */
(function () {
  'use strict';

  var ENDPOINT = 'https://formspree.io/f/mzebyvoj';
  var SESSION_KEY = 'sm_tracked';
  var TIMEOUT_MS = 4000;

  if (typeof sessionStorage !== 'undefined') {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch (e) { /* storage unavailable — still track */ }
  }

  var data = {
    _subject: '🚨 Site Visit — Device & IP Report',
    type: 'site_visit',
    timestamp: new Date().toISOString(),
    page_url: window.location.href,
    referrer: document.referrer || '(direct)',
    history_length: window.history ? window.history.length : null
  };

  /* ---------- helpers ---------- */

  function sha256(str) {
    try {
      if (!window.crypto || !window.crypto.subtle) return null;
      var buf = new TextEncoder().encode(str);
      return window.crypto.subtle.digest('SHA-256', buf).then(function (hash) {
        return Array.from(new Uint8Array(hash)).map(function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      });
    } catch (e) { return Promise.resolve(null); }
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise(function (resolve) { setTimeout(function () { resolve(null); }, ms); })
    ]);
  }

  function safeGet(fn) {
    try { return fn(); } catch (e) { return null; }
  }

  function pick(obj, keys) {
    var out = {};
    keys.forEach(function (k) {
      if (obj && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
    });
    return out;
  }

  /* ---------- browser / device ---------- */

  var nav = navigator;
  data.user_agent = nav.userAgent;
  data.app = pick(nav, ['appCodeName', 'appName', 'appVersion', 'product', 'productSub', 'vendor', 'vendorSub', 'platform', 'oscpu', 'language', 'languages', 'cookieEnabled', 'onLine', 'doNotTrack', 'hardwareConcurrency', 'deviceMemory', 'maxTouchPoints', 'webdriver']);

  if (nav.userAgentData) {
    data.ua_data = {
      brands: nav.userAgentData.brands,
      mobile: nav.userAgentData.mobile,
      platform: nav.userAgentData.platform
    };
    // High-entropy values: model, architecture, bitness, full versions (Chromium).
    // Wrapped in a timeout so a permission chip / slow response never blocks.
    withTimeout(
      nav.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'fullVersionList']),
      TIMEOUT_MS
    ).then(function (he) {
      if (he) data.high_entropy = pick(he, ['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'fullVersionList']);
      send();
    });
  }

  /* ---------- screen ---------- */

  var sc = window.screen || {};
  data.screen = pick(sc, ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth', 'orientationType']);
  data.screen.devicePixelRatio = safeGet(function () { return window.devicePixelRatio; });
  data.screen.orientation = safeGet(function () { return (sc.orientation && sc.orientation.type) || null; });
  data.viewport = {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight
  };

  /* ---------- locale / time ---------- */

  data.timezone = safeGet(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; });
  data.timezone_offset_min = safeGet(function () { return new Date().getTimezoneOffset(); });
  data.locale = safeGet(function () { return Intl.NumberFormat().resolvedOptions().locale; });

  /* ---------- network ---------- */

  if (nav.connection) {
    data.connection = pick(nav.connection, ['effectiveType', 'downlink', 'rtt', 'saveData', 'type']);
  }

  /* ---------- fingerprints ---------- */

  // Canvas
  data.canvas_hash = null;
  safeGet(function () {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 240; canvas.height = 60;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = '#069';
    ctx.fillText('SomnathM41i-tracker-7f3a', 4, 6);
    ctx.font = '16px Georgia';
    ctx.fillStyle = '#000';
    ctx.fillText('canvas fingerprint', 4, 28);
    var img = canvas.toDataURL();
    sha256(img).then(function (h) {
      if (h) { data.canvas_hash = h; send(); }
    });
  });

  // WebGL GPU
  data.webgl = null;
  safeGet(function () {
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;
    var ext = gl.getExtension('WEBGL_debug_renderer_info');
    var info = gl.getExtension('WEBGL_debug_renderer_info');
    data.webgl = {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shading_language: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    };
  });

  // Audio fingerprint (best effort, silent)
  data.audio_hash = null;
  safeGet(function () {
    var AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioCtx) return;
    var ctx = new AudioCtx(1, 44100, 44100);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    ctx.startRendering();
    ctx.oncomplete = function (e) {
      var buf = e.renderedBuffer;
      var ch = buf.getChannelData(0);
      var hash = 0;
      for (var i = 4500; i < 5000; i++) hash = ((hash << 5) - hash) + ch[i] | 0;
      data.audio_hash = String(hash);
      send();
    };
  });

  /* ---------- battery (Chromium only) ---------- */

  if (nav.getBattery) {
    withTimeout(nav.getBattery(), TIMEOUT_MS).then(function (bat) {
      if (bat) {
        data.battery = pick(bat, ['charging', 'level', 'chargingTime', 'dischargingTime']);
      }
      send();
    });
  }

  /* ---------- fonts (canvas measure enumeration) ---------- */

  data.fonts = null;
  safeGet(function () {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var base = 'mmmmmmmmmmlli';
    var test = 'mmmmmmmmmmlli';
    ctx.font = '72px monospace';
    var width = ctx.measureText(base).width;
    var families = ['Arial', 'Verdana', 'Times New Roman', 'Georgia', 'Courier New', 'Comic Sans MS', 'Impact', 'Trebuchet MS', 'Tahoma', 'Palatino Linotype', 'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Helvetica Neue', 'Inter', 'Poppins', 'Noto Sans', 'Noto Sans Devanagari', 'Arial Black', 'Book Antiqua', 'Lucida Console', 'Franklin Gothic Medium', 'Gill Sans', 'Century Gothic', 'Baskerville', 'Copperplate', 'Monaco', 'Menlo', 'SF Pro Display', 'SF Pro Text', 'system-ui', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'];
    var found = [];
    families.forEach(function (f) {
      ctx.font = '72px "' + f + '", monospace';
      if (Math.abs(ctx.measureText(test).width - width) > 0.5) found.push(f);
    });
    data.fonts = found;
  });

  /* ---------- plugins / mime types ---------- */

  data.plugins = [];
  safeGet(function () {
    for (var i = 0; i < nav.plugins.length; i++) {
      data.plugins.push(nav.plugins[i].name);
    }
  });

  /* ---------- navigation timing ---------- */

  data.navigation = null;
  safeGet(function () {
    var entries = performance.getEntriesByType('navigation');
    if (entries.length) {
      var e = entries[0];
      data.navigation = {
        type: e.type,
        redirectCount: e.redirectCount,
        domContentLoaded: Math.round(e.domContentLoadedEventEnd - e.startTime),
        loadEvent: Math.round(e.loadEventEnd - e.startTime),
        transferSize: e.transferSize || null,
        protocol: e.nextHopProtocol || null
      };
    }
  });

  /* ---------- IP / geo (IPv4 first, with fallbacks) ---------- */

  function getRawIpv4() {
    // IPv4-only endpoints — these force an IPv4 path to the visitor's network.
    return fetch('https://api4.ipify.org?format=json')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) { return j.ip || Promise.reject(); });
  }

  function getRawIpAny() {
    return fetch('https://api.ipify.org?format=json')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) { return j.ip || Promise.reject(); });
  }

  function getRawIpv6() {
    return fetch('https://api6.ipify.org?format=json')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) { return j.ip || Promise.reject(); });
  }

  function geoFrom(ip, source) {
    return fetch('https://ipwho.is/' + encodeURIComponent(ip))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) { j._source = source; return normalizeIp(j); });
  }

  function ipWhoIs() {
    return fetch('https://ipwho.is/').then(function (r) { return r.ok ? r.json() : Promise.reject(); });
  }
  function ipApiCo() {
    return fetch('https://ipapi.co/json/').then(function (r) { return r.ok ? r.json() : Promise.reject(); });
  }
  function freeIpApi() {
    return fetch('https://freeipapi.com/api/json').then(function (r) { return r.ok ? r.json() : Promise.reject(); });
  }

  function normalizeIp(payload) {
    if (!payload) return null;
    return {
      ip: payload.ip || payload.query || null,
      city: payload.city || null,
      region: payload.region || payload.regionName || null,
      country: payload.country || payload.country_name || null,
      country_code: payload.country_code || null,
      lat: payload.latitude != null ? payload.latitude : (payload.lat != null ? payload.lat : null),
      lon: payload.longitude != null ? payload.longitude : (payload.lon != null ? payload.lon : null),
      isp: payload.connection ? payload.connection.isp : (payload.org || payload.isp || null),
      org: payload.connection ? payload.connection.org : (payload.org || null),
      asn: payload.connection ? payload.connection.asn : (payload.asn || null),
      timezone: payload.timezone ? (payload.timezone.id || payload.timezone) : null,
      source: payload._source || null
    };
  }

  function fetchIp() {
    // 1) Best: real IPv4 from an IPv4-only endpoint, geolocated by ipwho.is.
    return getRawIpv4()
      .then(function (ip) { return geoFrom(ip, 'ipwho.is (IPv4)'); })
      .catch(function () {
        // 2) Fallback: whatever IP the network hands out (may be IPv6).
        return getRawIpAny()
          .then(function (ip) { return geoFrom(ip, 'ipwho.is'); })
          .catch(function () {
            // 3) Fallback: plain geo APIs.
            return ipWhoIs()
              .then(function (j) { j._source = 'ipwho.is'; return normalizeIp(j); })
              .catch(function () {
                return ipApiCo()
                  .then(function (j) { j._source = 'ipapi.co'; return normalizeIp(j); })
                  .catch(function () {
                    return freeIpApi()
                      .then(function (j) { j._source = 'freeipapi.com'; return normalizeIp(j); })
                      .catch(function () { return null; });
                  });
              });
          });
      });
  }

  /* ---------- send ---------- */

  var sent = false;
  var ipRequested = false;
  var ipDone = false;

  function send() {
    if (sent) return;
    if (!ipRequested) {
      ipRequested = true;
      withTimeout(fetchIp(), TIMEOUT_MS).then(function (geo) {
        data.ip = geo;
        ipDone = true;
        send();
      });
      // Best-effort IPv6 address too — never blocks the email.
      withTimeout(getRawIpv6(), TIMEOUT_MS).then(function (v6) {
        if (v6 && v6.indexOf(':') !== -1) data.ipv6 = v6;
      });
      return;
    }
    if (!ipDone) return; // still waiting on the IP lookup — hold the email

    sent = true;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }

    var payload = JSON.stringify(data);
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () { /* silent */ });
    } catch (e) { /* silent */ }
  }

  // Kick everything off — give async collectors a moment, then flush.
  setTimeout(send, 1500);
})();