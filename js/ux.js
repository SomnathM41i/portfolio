/* ux.js — progressive-enhancement layer shared by index.html and story.html.
   Covers: scroll progress bar, back-to-top, hero typewriter, stat counters,
   copy-to-clipboard chips, the returning-visitor toast, and the local
   visit/streak counter.

   Every feature guards its own element and returns early when it is absent,
   because the two pages share most but not all of these hooks. Nothing here is
   required for the page to work: with JavaScript off, all content stays visible
   and every link still resolves. */
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --------------------------------------------------------------- scrolling */

  /* One rAF-throttled scroll subscription shared by the progress bar and the
     back-to-top button, instead of two competing listeners. */
  const onScroll = (handler) => {
    let queued = false;

    const run = () => {
      queued = false;
      handler();
    };

    window.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    }, { passive: true });

    window.addEventListener('resize', run, { passive: true });
    handler(); // paint the correct state on load, not just after the first scroll
  };

  const initScrollProgress = () => {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;

    onScroll(() => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      bar.style.width = Math.min(Math.max(ratio, 0), 1) * 100 + '%';
    });
  };

  const initBackToTop = () => {
    const button = document.getElementById('backToTop');
    if (!button) return;

    const SHOW_AFTER_PX = 600;

    onScroll(() => button.classList.toggle('show', window.scrollY > SHOW_AFTER_PX));

    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  };

  /* -------------------------------------------------------------- typewriter */

  /* Phrases are drawn from the hero copy and profile card — no new claims. */
  const TYPE_PHRASES = [
    'PHP · Laravel · CodeIgniter',
    'Python · FastAPI · LLM integration',
    'Full-Stack Developer @ CodeX Technologies',
    'Mumbai / Remote · open to full-time',
  ];

  const initTypewriter = () => {
    const target = document.getElementById('typeText');
    if (!target) return;

    if (prefersReducedMotion) {
      target.textContent = TYPE_PHRASES[0];
      return;
    }

    const TYPE_MS = 55;
    const DELETE_MS = 26;
    const HOLD_MS = 1700;
    const GAP_MS = 320;

    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const tick = () => {
      const phrase = TYPE_PHRASES[phraseIndex];

      if (!deleting) {
        charIndex += 1;
        target.textContent = phrase.slice(0, charIndex);
        if (charIndex === phrase.length) {
          deleting = true;
          setTimeout(tick, HOLD_MS);
          return;
        }
        setTimeout(tick, TYPE_MS);
        return;
      }

      charIndex -= 1;
      target.textContent = phrase.slice(0, charIndex);
      if (charIndex === 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % TYPE_PHRASES.length;
        setTimeout(tick, GAP_MS);
        return;
      }
      setTimeout(tick, DELETE_MS);
    };

    setTimeout(tick, 500);
  };

  /* ----------------------------------------------------------- stat counters */

  const initCounters = () => {
    const counters = document.querySelectorAll('.stat-num[data-count]');
    if (!counters.length) return;

    const finalValue = (el) => Number(el.getAttribute('data-count')) || 0;

    const paint = (el, value) => {
      el.textContent = value + (el.getAttribute('data-suffix') || '');
    };

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      counters.forEach((el) => paint(el, finalValue(el)));
      return;
    }

    const DURATION_MS = 1400;

    const countUp = (el) => {
      const target = finalValue(el);
      const started = performance.now();

      const frame = (now) => {
        const progress = Math.min((now - started) / DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        paint(el, Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(frame);
      };

      requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        observer.unobserve(entry.target); // count once, not on every pass
      });
    }, { threshold: 0.4 });

    counters.forEach((el) => observer.observe(el));
  };

  /* ------------------------------------------------------- copy-to-clipboard */

  const initCopyChips = () => {
    const chips = document.querySelectorAll('[data-copy]');
    if (!chips.length) return;

    const FLASH_MS = 1600;

    const copy = async (value) => {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }
      // Fallback for non-secure contexts, e.g. opening the file over http://.
      const scratch = document.createElement('textarea');
      scratch.value = value;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      document.execCommand('copy');
      document.body.removeChild(scratch);
    };

    chips.forEach((chip) => {
      const original = chip.innerHTML;

      chip.addEventListener('click', async (event) => {
        event.preventDefault(); // the mailto: link stays the no-JS fallback
        try {
          await copy(chip.getAttribute('data-copy'));
        } catch (error) {
          return; // clipboard blocked — let the browser follow the link instead
        }
        chip.classList.add('copied');
        chip.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
          chip.classList.remove('copied');
          chip.innerHTML = original;
        }, FLASH_MS);
      });
    });
  };

  /* ------------------------------------------ visit counter + welcome toast */

  const VISITS_KEY = 'sm.visits';
  const LAST_SEEN_KEY = 'sm.lastSeen';
  const STREAK_KEY = 'sm.streak';
  const TOAST_SEEN_KEY = 'sm.toastSeen';

  const today = () => new Date().toISOString().slice(0, 10);

  const daysBetween = (fromISO, toISO) =>
    Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);

  const readPositiveInt = (key) => {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  /* These counters live in localStorage, so they are per-browser, not global —
     there is no backend behind them. The UI labels them as a personal visit
     count rather than a site-wide visitor number. */
  const trackVisit = () => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const now = today();
    const returning = Boolean(lastSeen);

    let visits = readPositiveInt(VISITS_KEY);
    let streak = readPositiveInt(STREAK_KEY);

    if (lastSeen !== now) {
      const gap = lastSeen ? daysBetween(lastSeen, now) : null;
      streak = gap === 1 ? streak + 1 : 1;
      visits += 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      localStorage.setItem(STREAK_KEY, String(streak));
      localStorage.setItem(LAST_SEEN_KEY, now);
    } else if (visits === 0) {
      visits = 1;
      localStorage.setItem(VISITS_KEY, '1');
    }

    return { visits, streak, returning };
  };

  const renderVisitBadge = (state) => {
    const count = document.getElementById('visitorCount');
    if (count) count.textContent = '#' + state.visits;

    const chip = document.getElementById('streakChip');
    const days = document.getElementById('streakDays');
    if (chip && days && state.streak > 1) {
      days.textContent = String(state.streak);
      chip.hidden = false;
    }
  };

  const initWelcomeToast = (state) => {
    const toast = document.getElementById('welcomeToast');
    if (!toast || !state.returning) return;
    if (sessionStorage.getItem(TOAST_SEEN_KEY)) return;

    const sub = document.getElementById('welcomeSub');
    const list = document.getElementById('welcomeList');
    const close = document.getElementById('welcomeClose');

    if (sub) {
      sub.textContent = state.streak > 1
        ? 'Visit #' + state.visits + ' · ' + state.streak + ' days in a row.'
        : 'Visit #' + state.visits + '. Good to see you again.';
    }

    if (list) {
      list.innerHTML = [
        '<li>Open to full-time &amp; freelance roles</li>',
        '<li>Currently building AI platforms at CodeX Technologies</li>',
        '<li>Resume is one click away in the hero</li>',
      ].join('');
    }

    const dismiss = () => {
      toast.classList.remove('show');
      sessionStorage.setItem(TOAST_SEEN_KEY, '1');
    };

    setTimeout(() => toast.classList.add('show'), 1400);
    setTimeout(dismiss, 14000);
    if (close) close.addEventListener('click', dismiss);
  };

  const initVisitTracking = () => {
    let state;
    try {
      state = trackVisit();
    } catch (error) {
      return; // localStorage unavailable (private mode / blocked storage)
    }
    renderVisitBadge(state);
    initWelcomeToast(state);
  };

  /* -------------------------------------------------------------------- boot */

  initScrollProgress();
  initBackToTop();
  initTypewriter();
  initCounters();
  initCopyChips();
  initVisitTracking();
})();
