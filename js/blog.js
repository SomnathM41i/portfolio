/* blog.js — renders the "Latest From The Blog" strip into #blogGrid.

   WHY THE FEED IS OFF BY DEFAULT
   ------------------------------
   emperorofbattle.blogspot.com is currently driven by an IFTTT automation that
   reposts Krebs on Security (krebsonsecurity.com) verbatim. Every entry carries
   the categories "IFTTT" and "Krebs on Security" and ends with
   "from Krebs on Security … via IFTTT". Rendering those posts under a heading
   that reads "Writing about what I'm building and breaking" would present
   someone else's journalism as original work, so FEED_URL stays empty and the
   strip renders an honest placeholder instead.

   TO ENABLE: set FEED_URL to a Blogger JSON feed, e.g.
       'https://yourblog.blogspot.com/feeds/posts/default'
   Nothing else needs to change — the module fetches and renders it as-is.

   Blogger's feed sends no Access-Control-Allow-Origin header, so a normal
   fetch() is blocked by the browser; this loads it as JSONP instead. */
(function () {
  'use strict';

  const CONFIG = {
    feedUrl: '', // intentionally empty — see the note above
    maxPosts: 3,
    snippetLength: 150,
    newBadgeDays: 45,
    timeoutMs: 8000,
    blogHome: 'https://emperorofbattle.blogspot.com',
    fallbackUrl: 'https://github.com/SomnathM41i',
  };

  const grid = document.getElementById('blogGrid');
  if (!grid) return;

  /* --------------------------------------------------------------- helpers */

  const stripHtml = (html) => {
    const scratch = document.createElement('div');
    scratch.innerHTML = html;
    return (scratch.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const truncate = (text, limit) => {
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
  };

  const formatDate = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isRecent = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;
    return (Date.now() - date.getTime()) / 86400000 <= CONFIG.newBadgeDays;
  };

  const alternateUrl = (entry) => {
    const links = entry.link || [];
    const alternate = links.find((link) => link.rel === 'alternate');
    return alternate ? alternate.href : CONFIG.blogHome;
  };

  /* ---------------------------------------------------------------- render */

  /* Built with DOM APIs and textContent rather than innerHTML so feed content
     can never inject markup into the page. */
  const buildCard = (entry) => {
    const title = (entry.title && entry.title.$t) || 'Untitled';
    const published = (entry.published && entry.published.$t) || '';
    const content = (entry.content && entry.content.$t) || '';

    const card = document.createElement('a');
    card.className = 'blog-card';
    card.href = alternateUrl(entry);
    card.target = '_blank';
    card.rel = 'noopener';

    const dateRow = document.createElement('div');
    dateRow.className = 'blog-date';

    const icon = document.createElement('i');
    icon.className = 'fas fa-calendar-alt';
    dateRow.appendChild(icon);

    const dateText = document.createElement('span');
    dateText.textContent = formatDate(published);
    dateRow.appendChild(dateText);

    if (isRecent(published)) {
      const badge = document.createElement('span');
      badge.className = 'new-badge';
      badge.textContent = 'NEW';
      dateRow.appendChild(badge);
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'blog-title';
    titleEl.textContent = title;

    const snippetEl = document.createElement('div');
    snippetEl.className = 'blog-snippet';
    snippetEl.textContent = truncate(stripHtml(content), CONFIG.snippetLength);

    const linkEl = document.createElement('div');
    linkEl.className = 'blog-link';
    const linkIcon = document.createElement('i');
    linkIcon.className = 'fas fa-arrow-right';
    linkEl.appendChild(linkIcon);
    linkEl.appendChild(document.createTextNode(' Read post'));

    card.append(dateRow, titleEl, snippetEl, linkEl);
    return card;
  };

  const renderPosts = (entries) => {
    grid.innerHTML = '';
    entries.slice(0, CONFIG.maxPosts).forEach((entry) => {
      grid.appendChild(buildCard(entry));
    });
  };

  const renderPlaceholder = () => {
    grid.innerHTML = '';

    const card = document.createElement('a');
    card.className = 'blog-card';
    card.href = CONFIG.fallbackUrl;
    card.target = '_blank';
    card.rel = 'noopener';
    card.style.gridColumn = '1/-1';

    const dateRow = document.createElement('div');
    dateRow.className = 'blog-date';
    const icon = document.createElement('i');
    icon.className = 'fas fa-pen-nib';
    dateRow.appendChild(icon);
    const label = document.createElement('span');
    label.textContent = 'Write-ups in progress';
    dateRow.appendChild(label);

    const titleEl = document.createElement('div');
    titleEl.className = 'blog-title';
    titleEl.textContent = 'Notes on how these systems were built';

    const snippetEl = document.createElement('div');
    snippetEl.className = 'blog-snippet';
    snippetEl.textContent =
      'Long-form notes on the payment integrations, the gold loan system and the AI matching pipeline are on the way. Until then, the code is on GitHub.';

    const linkEl = document.createElement('div');
    linkEl.className = 'blog-link';
    const linkIcon = document.createElement('i');
    linkIcon.className = 'fas fa-arrow-right';
    linkEl.appendChild(linkIcon);
    linkEl.appendChild(document.createTextNode(' Browse the repos'));

    card.append(dateRow, titleEl, snippetEl, linkEl);
    grid.appendChild(card);
  };

  const renderError = () => {
    grid.innerHTML = '';

    const card = document.createElement('a');
    card.className = 'blog-card';
    card.href = CONFIG.blogHome;
    card.target = '_blank';
    card.rel = 'noopener';
    card.style.gridColumn = '1/-1';

    const titleEl = document.createElement('div');
    titleEl.className = 'blog-title';
    titleEl.textContent = 'Posts could not be loaded right now';

    const snippetEl = document.createElement('div');
    snippetEl.className = 'blog-snippet';
    snippetEl.textContent = 'The feed did not respond. Open the blog directly instead.';

    card.append(titleEl, snippetEl);
    grid.appendChild(card);
  };

  /* ------------------------------------------------------------ feed loader */

  let jsonpSequence = 0;

  const loadJsonp = (url, onLoad, onError) => {
    const callbackName = 'smBlogFeed' + (++jsonpSequence);
    const script = document.createElement('script');
    const separator = url.indexOf('?') === -1 ? '?' : '&';
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      onError();
    };

    window[callbackName] = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      onLoad(data);
    };

    script.src = url + separator + 'alt=json-in-script&callback=' + callbackName;
    script.async = true;
    script.onerror = fail;
    document.body.appendChild(script);

    setTimeout(fail, CONFIG.timeoutMs);
  };

  const init = () => {
    if (!CONFIG.feedUrl) {
      renderPlaceholder();
      return;
    }

    loadJsonp(
      CONFIG.feedUrl + '?max-results=' + CONFIG.maxPosts,
      (data) => {
        const entries = data && data.feed && data.feed.entry;
        if (!entries || !entries.length) {
          renderError();
          return;
        }
        renderPosts(entries);
      },
      renderError
    );
  };

  init();
})();
