/* reveal.js — reveal-on-scroll animations driven by IntersectionObserver.
   The head `.js` class flag scopes the hidden initial state to "JavaScript is on",
   so content stays visible if this script (or JS entirely) fails to load. */
(function () {
  'use strict';

  const REVEAL_THRESHOLD = 0.1;
  const revealElements = document.querySelectorAll('.reveal');

  if (!revealElements.length) return;

  const makeVisible = (el) => el.classList.add('visible');

  if (!('IntersectionObserver' in window)) {
    revealElements.forEach(makeVisible);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) makeVisible(entry.target);
    });
  }, { threshold: REVEAL_THRESHOLD });

  revealElements.forEach((el) => observer.observe(el));
})();