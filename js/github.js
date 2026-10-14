/* github.js — fills the "Recent GitHub" strip (#ghStrip) from the public
   GitHub events API.

   api.github.com sends Access-Control-Allow-Origin: *, so a plain fetch works
   from the browser. Unauthenticated requests are rate limited per IP, so a
   403/429 falls back to a single link to the profile rather than an error. */
(function () {
  'use strict';

  const CONFIG = {
    user: 'SomnathM41i',
    maxItems: 4,
    perPage: 30,
    timeoutMs: 8000,
  };

  const strip = document.getElementById('ghStrip');
  if (!strip) return;

  const EVENTS_URL =
    'https://api.github.com/users/' + CONFIG.user + '/events/public?per_page=' + CONFIG.perPage;

  /* --------------------------------------------------------------- helpers */

  const relativeTime = (iso) => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';

    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];

    for (let i = 0; i < units.length; i += 1) {
      const value = Math.floor(seconds / units[i][1]);
      if (value >= 1) return value + ' ' + units[i][0] + (value > 1 ? 's' : '') + ' ago';
    }
    return 'just now';
  };

  /* Returns { icon, text } for the event types worth showing, or null to skip
     the noisier ones (stars, forks, comments). */
  const describe = (event) => {
    const payload = event.payload || {};

    switch (event.type) {
      case 'PushEvent': {
        // GitHub's public events feed strips commits/size from the payload, so
        // the branch is all we can honestly report — no commit count available.
        const branch = String(payload.ref || '').replace('refs/heads/', '') || 'main';
        return { icon: 'fa-code-branch', text: 'Pushed to ' + branch };
      }
      case 'CreateEvent': {
        const ref = payload.ref || payload.ref_type;
        if (!ref) return null;
        return { icon: 'fa-plus', text: 'Created ' + ref };
      }
      case 'PullRequestEvent':
        return { icon: 'fa-code', text: 'Pull request #' + payload.number + ' ' + payload.action };
      case 'ReleaseEvent': {
        const tag = payload.release && payload.release.tag_name;
        return { icon: 'fa-tag', text: tag ? 'Released ' + tag : 'Published a release' };
      }
      case 'IssuesEvent':
        return { icon: 'fa-circle-dot', text: 'Issue #' + payload.issue.number + ' ' + payload.action };
      default:
        return null;
    }
  };

  /* ---------------------------------------------------------------- render */

  const buildItem = (repo, description, createdAt) => {
    const item = document.createElement('a');
    item.className = 'gh-item';
    item.href = 'https://github.com/' + repo;
    item.target = '_blank';
    item.rel = 'noopener';

    const icon = document.createElement('span');
    icon.className = 'gh-icon';
    const iconEl = document.createElement('i');
    iconEl.className = 'fas ' + description.icon;
    icon.appendChild(iconEl);

    const text = document.createElement('div');
    text.className = 'gh-text';

    const repoEl = document.createElement('div');
    repoEl.className = 'gh-repo';
    repoEl.textContent = repo;

    const meta = document.createElement('div');
    meta.className = 'gh-meta';
    meta.textContent = description.text + ' · ' + relativeTime(createdAt);

    text.append(repoEl, meta);
    item.append(icon, text);
    return item;
  };

  const renderItems = (items) => {
    strip.innerHTML = '';
    items.forEach((item) => strip.appendChild(item));
  };

  const renderFallback = (message) => {
    strip.innerHTML = '';

    const item = document.createElement('a');
    item.className = 'gh-item';
    item.href = 'https://github.com/' + CONFIG.user;
    item.target = '_blank';
    item.rel = 'noopener';

    const icon = document.createElement('span');
    icon.className = 'gh-icon';
    const iconEl = document.createElement('i');
    iconEl.className = 'fab fa-github';
    icon.appendChild(iconEl);

    const text = document.createElement('div');
    text.className = 'gh-text';

    const repoEl = document.createElement('div');
    repoEl.className = 'gh-repo';
    repoEl.textContent = 'github.com/' + CONFIG.user;

    const meta = document.createElement('div');
    meta.className = 'gh-meta';
    meta.textContent = message;

    text.append(repoEl, meta);
    item.append(icon, text);
    strip.appendChild(item);
  };

  /* ------------------------------------------------------------------ load */

  const load = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

    try {
      const response = await fetch(EVENTS_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        renderFallback('Live activity unavailable right now — open the profile');
        return;
      }

      const events = await response.json();
      if (!Array.isArray(events)) {
        renderFallback('Live activity unavailable right now — open the profile');
        return;
      }

      // Newest event per repository, so one busy repo cannot fill the strip.
      const seen = new Set();
      const items = [];

      events.forEach((event) => {
        if (items.length >= CONFIG.maxItems) return;
        const repo = event.repo && event.repo.name;
        if (!repo || seen.has(repo)) return;

        const description = describe(event);
        if (!description) return;

        seen.add(repo);
        items.push(buildItem(repo, description, event.created_at));
      });

      if (!items.length) {
        renderFallback('No public activity to show yet — open the profile');
        return;
      }

      renderItems(items);
    } catch (error) {
      renderFallback('Live activity unavailable right now — open the profile');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  load();
})();
