/* tracker.js — visitor device fingerprint + IP/geo capture (STRONG build).
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
  var FLUSH_MS = 3000;      // give async collectors time to land in the email
  var ICE_CAP_MS = 2000;    // WebRTC gather cap
  var GPU_CAP_MS = 2000;    // WebGPU adapter cap

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
  data.window_geom = safeGet(function () {
    return {
      screenX: window.screenX,
      screenY: window.screenY,
      screenLeft: window.screenLeft,
      screenTop: window.screenTop,
      availLeft: sc.availLeft,
      availTop: sc.availTop,
      orientation_angle: sc.orientation ? sc.orientation.angle : null
    };
  });

  /* ---------- locale / time ---------- */

  data.timezone = safeGet(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; });
  data.timezone_offset_min = safeGet(function () { return new Date().getTimezoneOffset(); });
  data.locale = safeGet(function () { return Intl.NumberFormat().resolvedOptions().locale; });

  data.intl = null;
  safeGet(function () {
    if (typeof Intl.supportedValuesOf !== 'function') return;
    var keys = ['calendar', 'collation', 'currency', 'numberingSystem', 'timeZone', 'unit'];
    var out = {};
    keys.forEach(function (k) {
      try { out[k] = Intl.supportedValuesOf(k); } catch (e) { out[k] = []; }
    });
    data.intl = out;
  });

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
    data.webgl = {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shading_language: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    };
  });

  // WebGPU adapter — real GPU model on Chromium desktop.
  data.webgpu = null;
  safeGet(function () {
    if (!nav.gpu || !nav.gpu.requestAdapter) return;
    withTimeout(nav.gpu.requestAdapter(), GPU_CAP_MS).then(function (adapter) {
      if (!adapter) return;
      var infoPromise = adapter.requestAdapterInfo
        ? adapter.requestAdapterInfo()
        : Promise.resolve(adapter.info || null);
      withTimeout(infoPromise, GPU_CAP_MS).then(function (info) {
        if (info) {
          data.webgpu = {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
            vendorID: info.vendorID,
            deviceID: info.deviceID
          };
        }
        send();
      });
    });
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

  /* ---------- fonts ---------- */

  // Canvas measure enumeration.
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

  // Exotic font probe via document.fonts.check (finer signal).
  data.exotic_fonts = null;
  safeGet(function () {
    if (!document.fonts || !document.fonts.check) return;
    var probes = ['Arial', 'Helvetica Neue', 'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Tahoma', 'Comic Sans MS', 'Impact', 'Palatino Linotype', 'Book Antiqua', 'Lucida Console', 'Franklin Gothic Medium', 'Gill Sans', 'Century Gothic', 'Monaco', 'Menlo', 'SF Pro Display', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Inter', 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Bengali', 'Noto Sans Tamil', 'system-ui', 'Apple Color Emoji', 'Segoe UI Emoji', 'Wingdings', 'Webdings', 'Symbol', 'MS Gothic', 'Yu Gothic', 'Meiryo', 'Malgun Gothic', 'SimSun', 'Arial Black'];
    var found = [];
    probes.forEach(function (f) {
      try { if (document.fonts.check('16px "' + f + '"')) found.push(f); } catch (e) { /* skip */ }
    });
    data.exotic_fonts = found;
  });

  /* ---------- plugins / mime types ---------- */

  data.plugins = [];
  safeGet(function () {
    for (var i = 0; i < nav.plugins.length; i++) {
      data.plugins.push(nav.plugins[i].name);
    }
  });

  /* ---------- navigation timing / resources ---------- */

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

  data.resource_timing = null;
  data.heap = null;
  data.cpu_bench_ms = null;
  safeGet(function () {
    var entries = performance.getEntriesByType('resource');
    var origins = {};
    entries.forEach(function (e) {
      try {
        var u = new URL(e.name);
        origins[u.origin] = (origins[u.origin] || 0) + 1;
      } catch (err) { /* skip */ }
    });
    var sorted = Object.keys(origins).sort(function (a, b) { return origins[b] - origins[a]; }).slice(0, 15);
    data.resource_timing = {
      count: entries.length,
      origins: sorted.map(function (o) { return o + ' (' + origins[o] + ')'; }),
      largest_transfer: entries.reduce(function (max, e) { return (e.transferSize || 0) > (max || 0) ? e.transferSize : max; }, 0)
    };
    if (performance.memory) {
      data.heap = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize
      };
    }
    var t0 = performance.now();
    var x = 0;
    for (var i = 0; i < 500000; i++) x += Math.sqrt(i);
    data.cpu_bench_ms = Math.round(performance.now() - t0);
    data.cpu_bench_sum = Math.round(x);
  });

  data.timer_precision = safeGet(function () {
    var t = performance.now();
    var min = 1e9;
    for (var i = 0; i < 200; i++) {
      var t2 = performance.now();
      if (t2 > t) {
        var d = t2 - t;
        if (d < min) min = d;
        t = t2;
      }
    }
    return min === 1e9 ? null : min;
  });

  /* ---------- prefers-* media query sweep ---------- */

  data.prefers = null;
  safeGet(function () {
    var mq = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return null; } };
    data.prefers = {
      dark: mq('(prefers-color-scheme: dark)'),
      light: mq('(prefers-color-scheme: light)'),
      reduced_motion: mq('(prefers-reduced-motion: reduce)'),
      reduced_transparency: mq('(prefers-reduced-transparency: reduce)'),
      reduced_data: mq('(prefers-reduced-data: reduce)'),
      high_contrast: mq('(prefers-contrast: high)'),
      forced_colors: mq('(forced-colors: active)'),
      pointer_fine: mq('(pointer: fine)'),
      pointer_coarse: mq('(pointer: coarse)'),
      any_pointer_fine: mq('(any-pointer: fine)'),
      any_pointer_coarse: mq('(any-pointer: coarse)'),
      hover: mq('(hover: hover)'),
      any_hover: mq('(any-hover: hover)'),
      color_gamut_p3: mq('(color-gamut: p3)'),
      color_gamut_rec2020: mq('(color-gamut: rec2020)'),
      resolution_2dppx: mq('(resolution: 2dppx)'),
      display_mode: mq('(display-mode: standalone)') ? 'standalone' : (mq('(display-mode: fullscreen)') ? 'fullscreen' : 'browser')
    };
  });

  /* ---------- permission-state recon (silent, no prompts) ---------- */

  data.permissions = null;
  safeGet(function () {
    var notif = (typeof Notification !== 'undefined') ? Notification.permission : null;
    if (!nav.permissions || !nav.permissions.query) {
      data.permissions = { notification: notif };
      return;
    }
    var names = ['geolocation', 'camera', 'microphone', 'notifications', 'clipboard-read', 'persistent-storage'];
    Promise.all(names.map(function (n) {
      return nav.permissions.query({ name: n })
        .then(function (s) { return { name: n, state: s.state }; })
        .catch(function () { return { name: n, state: 'error' }; });
    })).then(function (results) {
      var perms = {};
      results.forEach(function (r) { perms[r.name] = r.state; });
      perms.notification = notif;
      data.permissions = perms;
      send();
    });
  });

  /* ---------- media devices (counts, no labels) ---------- */

  data.media_devices = null;
  safeGet(function () {
    if (!nav.mediaDevices || !nav.mediaDevices.enumerateDevices) return;
    nav.mediaDevices.enumerateDevices().then(function (devices) {
      var counts = { audioinput: 0, audiooutput: 0, videoinput: 0 };
      devices.forEach(function (d) { if (counts[d.kind] !== undefined) counts[d.kind]++; });
      data.media_devices = counts;
      send();
    }).catch(function () { /* silent */ });
  });

  /* ---------- storage ---------- */

  data.storage = null;
  safeGet(function () {
    if (nav.storage && nav.storage.estimate) {
      nav.storage.estimate().then(function (est) {
        data.storage = { quota: est.quota, usage: est.usage };
        send();
      }).catch(function () { /* silent */ });
    }
  });

  data.indexeddb = null;
  safeGet(function () {
    try {
      var dbName = 'sm_probe_' + Date.now();
      var req = indexedDB.open(dbName);
      req.onsuccess = function () {
        data.indexeddb = 'available';
        req.result.close();
        try { indexedDB.deleteDatabase(dbName); } catch (e) { /* ignore */ }
        send();
      };
      req.onerror = function () { data.indexeddb = 'blocked'; send(); };
    } catch (e) { data.indexeddb = 'unavailable'; }
  });

  /* ---------- browser marker (Brave / Chromium forks) ---------- */

  data.browser_marker = null;
  safeGet(function () {
    var marker = {
      edge: /Edg\//.test(nav.userAgent),
      opera: /OPR\//.test(nav.userAgent),
      samsung: /SamsungBrowser/.test(nav.userAgent),
      firefox: /Firefox\//.test(nav.userAgent),
      safari: /^((?!chrome|android|crios|fxios|edg|opr|samsung).)*safari/i.test(nav.userAgent),
      chrome: !!window.chrome,
      brave: false
    };
    if (nav.brave && typeof nav.brave.isBrave === 'function') {
      nav.brave.isBrave().then(function (res) {
        marker.brave = !!res;
        data.browser_marker = marker;
        send();
      }).catch(function () {
        data.browser_marker = marker;
        send();
      });
    } else {
      data.browser_marker = marker;
    }
  });

  /* ---------- GPC (Global Privacy Control) signal ---------- */

  data.gpc = safeGet(function () {
    return 'globalPrivacyControl' in nav ? nav.globalPrivacyControl : null;
  });

  /* ---------- media constraints (engine build fingerprint) ---------- */

  data.media_constraints = null;
  safeGet(function () {
    if (nav.mediaDevices && nav.mediaDevices.getSupportedConstraints) {
      data.media_constraints = Object.keys(nav.mediaDevices.getSupportedConstraints());
    }
  });

  /* ---------- device / codec feature matrix ---------- */

  data.device_codes = null;
  safeGet(function () {
    var d = {
      webgpu: !!nav.gpu,
      webxr: !!nav.xr,
      webgl2: (function () { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } })(),
      offscreen_canvas: typeof OffscreenCanvas !== 'undefined',
      pdf_viewer: nav.pdfViewerEnabled,
      wake_lock: 'wakeLock' in nav,
      media_capabilities: 'mediaCapabilities' in nav,
      locks: 'locks' in nav,
      clipboard: 'clipboard' in nav,
      share: 'share' in nav,
      vibrate: 'vibrate' in nav,
      bluetooth: 'bluetooth' in nav,
      usb: 'usb' in nav,
      serial: 'serial' in nav,
      hid: 'hid' in nav,
      gamepads: !!nav.getGamepads,
      media_session: 'mediaSession' in nav,
      credentials: 'credentials' in nav,
      contacts: 'contacts' in nav,
      media_devices_api: !!nav.mediaDevices,
      service_worker: 'serviceWorker' in nav,
      storage_api: 'storage' in nav,
      permissions_api: 'permissions' in nav,
      battery_api: !!nav.getBattery,
      presentation: 'presentation' in nav,
      scheduling: 'scheduling' in nav,
      keyboard: 'keyboard' in nav,
      virtual_keyboard: 'virtualKeyboard' in nav,
      ink: 'ink' in nav,
      installed_apps_api: 'getInstalledRelatedApps' in nav,
      app_installed: 'appInstalled' in nav,
      standalone: 'standalone' in nav
    };
    var MS = window.MediaSource;
    if (MS && MS.isTypeSupported) {
      var codecs = {
        h264: 'video/mp4; codecs="avc1.42E01E"',
        hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
        vp9: 'video/webm; codecs="vp09.00.10.08"',
        av1: 'video/webm; codecs="av01.0.04M.08"',
        aac: 'audio/mp4; codecs="mp4a.40.2"',
        opus: 'audio/webm; codecs="opus"',
        mp3: 'audio/mpeg'
      };
      d.codecs = {};
      Object.keys(codecs).forEach(function (k) { d.codecs[k] = MS.isTypeSupported(codecs[k]); });
    }
    data.device_codes = d;
  });

  /* ---------- image format / decode matrix ---------- */

  data.image_formats = null;
  safeGet(function () {
    var formats = {};
    var canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    var ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1);
      formats.png = canvas.toDataURL('image/png').indexOf('data:image/png') === 0;
      formats.jpeg = canvas.toDataURL('image/jpeg').indexOf('data:image/jpeg') === 0;
      formats.webp = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }
    data.image_formats = formats;
  });

  data.image_decode = null;
  safeGet(function () {
    if (!window.createImageBitmap) return;
    var webp = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
    var avif = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeImxvY2MAAAAAAAAAAAAAAAEAAQAAAgAAAQABAAABhQAAAGhtZGQAAAAAAAAAAAAAAAAAAABkZHJjAAAAAAAAAAEAAAABAAAAAG1kYXQAAAAAAAAAAAAAAADgAAAADm1pbmYA';
    var svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    var tests = { webp: webp, avif: avif, svg: svg };
    var results = {};
    var chain = Promise.resolve();
    Object.keys(tests).forEach(function (fmt) {
      chain = chain.then(function () {
        return fetch(tests[fmt]).then(function (r) { return r.blob(); }).then(function (blob) {
          return createImageBitmap(blob).then(function () { results[fmt] = true; }).catch(function () { results[fmt] = false; });
        }).catch(function () { results[fmt] = false; });
      });
    });
    chain.then(function () { data.image_decode = results; send(); });
  });

  /* ---------- speech voices ---------- */

  data.speech_voices = [];
  safeGet(function () {
    var synth = window.speechSynthesis;
    if (!synth) return;
    var read = function () {
      var v = synth.getVoices() || [];
      data.speech_voices = v.map(function (v) { return v.name + ' (' + v.lang + ')'; });
      send();
    };
    read();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', read);
  });

  /* ---------- full navigator surface sweep ---------- */

  data.navigator_surface = null;
  safeGet(function () {
    var out = {};
    var keys = [];
    try { keys = Object.getOwnPropertyNames(Object.getPrototypeOf(nav)); } catch (e) { /* ignore */ }
    Object.keys(nav).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
    keys.forEach(function (k) {
      try {
        var v = nav[k];
        if (typeof v === 'function') out[k] = 'fn';
        else if (v !== null && typeof v === 'object') out[k] = 'obj';
        else out[k] = v;
      } catch (e) { out[k] = 'err'; }
    });
    if (nav.getGamepads) {
      try {
        var gps = nav.getGamepads();
        var n = 0;
        for (var i = 0; i < gps.length; i++) if (gps[i]) n++;
        out.gamepads_connected = n;
      } catch (e) { /* ignore */ }
    }
    data.navigator_surface = out;
  });

  /* ---------- WebRTC ICE harvest (LAN/CGNAT IP leak) ---------- */

  data.webrtc = null;
  safeGet(function () {
    if (!window.RTCPeerConnection) return;
    var pc = null;
    var candidates = [];
    var done = false;
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] });
    } catch (e) { return; }
    var finish = function () {
      if (done) return;
      done = true;
      try { pc.close(); } catch (e) { /* ignore */ }
      var ips = [];
      candidates.forEach(function (c) {
        var parts = c.split(' ');
        if (parts.length > 4 && parts[4] && parts[4].indexOf('.local') === -1 && parts[4] !== '0.0.0.0' && parts[4] !== '::') {
          if (ips.indexOf(parts[4]) === -1) ips.push(parts[4]);
        }
      });
      data.webrtc = {
        candidates: candidates.slice(0, 20),
        ips_leaked: ips.slice(0, 10),
        candidate_count: candidates.length
      };
      send();
    };
    pc.onicecandidate = function (e) {
      if (e.candidate) {
        candidates.push(e.candidate.candidate);
        if (candidates.length > 25) finish();
      } else {
        finish();
      }
    };
    try {
      pc.createDataChannel('probe');
      pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); }).catch(finish);
    } catch (e) { finish(); }
    setTimeout(finish, ICE_CAP_MS);
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

  // Kick everything off — flush after the capture window.
  setTimeout(send, FLUSH_MS);
})();