/* cases.js — turns each project card's "Case Study" button into a modal.

   The markup ships only the trigger buttons; the presentation already exists in
   style.css (.modal-overlay, .modal-head, .case-row, .case-tags, .modal-actions).
   This file supplies the missing shell and behaviour.

   Modal content is read from the card the button lives in, so nothing is
   duplicated in markup and nothing is invented — the modal shows the same
   overview, impact, status, stack and links the card already carries. */
(function () {
  'use strict';

  const triggers = document.querySelectorAll('.case-btn');
  if (!triggers.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = [
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="caseModalTitle">',
    '  <div class="modal-head">',
    '    <div class="modal-title" id="caseModalTitle"></div>',
    '    <button class="modal-close" type="button" aria-label="Close case study">&times;</button>',
    '  </div>',
    '  <div class="modal-body"></div>',
    '</div>',
  ].join('');
  document.body.appendChild(overlay);

  const titleEl = overlay.querySelector('.modal-title');
  const bodyEl = overlay.querySelector('.modal-body');
  const closeButton = overlay.querySelector('.modal-close');

  let lastFocused = null;

  const readText = (root, selector) => {
    const el = root.querySelector(selector);
    return el ? el.textContent.trim() : '';
  };

  const caseRow = (label, content) => {
    if (!content) return '';
    return '<div class="case-row">' +
      '<div class="case-label">' + label + '</div>' +
      '<div class="case-text">' + content + '</div>' +
      '</div>';
  };

  const buildBody = (card) => {
    const storyEl = card.querySelector('.project-story');
    const story = storyEl ? storyEl.innerHTML.trim() : '';
    const impact = readText(card, '.project-impact');
    const status = readText(card, '.project-status-badge');
    const tags = Array.from(card.querySelectorAll('.project-tag'))
      .map((tag) => tag.textContent.trim());

    // Only anchors — the card's own "Case Study" button must not be cloned in.
    const actions = Array.from(card.querySelectorAll('.project-links a'))
      .map((anchor) => anchor.outerHTML);

    const parts = [
      '<div class="case-block">',
      caseRow('Overview', story),
      caseRow('Impact', impact),
      caseRow('Status', status),
      '</div>',
    ];

    if (tags.length) {
      parts.push('<div class="case-tags">' +
        tags.map((tag) => '<span class="project-tag">' + tag + '</span>').join('') +
        '</div>');
    }

    if (actions.length) {
      parts.push('<div class="modal-actions">' + actions.join('') + '</div>');
    }

    return parts.join('');
  };

  const isOpen = () => overlay.classList.contains('open');

  const open = (trigger) => {
    const card = trigger.closest('.project-card');
    if (!card) return;

    lastFocused = trigger;
    titleEl.textContent = readText(card, '.project-name') || 'Case Study';
    bodyEl.innerHTML = buildBody(card);

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    closeButton.focus();
  };

  const close = () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (lastFocused) lastFocused.focus();
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => open(trigger));
  });

  closeButton.addEventListener('click', close);

  // Click on the backdrop (but not inside the modal) closes it.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) close();
  });

  // Keep Tab inside the dialog while it is open.
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;

    const focusable = overlay.querySelectorAll('a[href], button:not([disabled])');
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
