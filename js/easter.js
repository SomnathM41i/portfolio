/* easter.js — the matrix rain overlay (#matrixOverlay).

   Two ways in: the terminal's "matrix" command dispatches a
   `portfolio:matrix` event on document (so terminal.js never has to reach into
   this file), and the Konami code works anywhere on the page. Escape, the close
   button, or a click on the backdrop gets you out.

   Honours prefers-reduced-motion: instead of an animation loop it paints a
   single static frame. */
(function () {
  'use strict';

  const overlay = document.getElementById('matrixOverlay');
  const canvas = document.getElementById('matrixCanvas');
  const closeButton = document.getElementById('matrixClose');
  if (!overlay || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const FONT_SIZE = 16;
  const FRAME_INTERVAL = 33; // ~30fps — plenty for rain, easier on the battery
  const FADE = 'rgba(0, 0, 0, 0.06)';

  const KONAMI = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a',
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let drops = [];
  let frameId = null;
  let lastFrame = 0;
  let konamiIndex = 0;

  const isOpen = () => overlay.classList.contains('on');

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const columns = Math.ceil(width / FONT_SIZE);
    drops = new Array(columns).fill(0).map(() => Math.random() * -40);
  };

  const paint = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.fillStyle = FADE;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0f0';
    ctx.font = FONT_SIZE + 'px monospace';

    for (let i = 0; i < drops.length; i += 1) {
      const char = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
      ctx.fillText(char, i * FONT_SIZE, drops[i] * FONT_SIZE);

      if (drops[i] * FONT_SIZE > height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += 1;
    }
  };

  const loop = (timestamp) => {
    if (timestamp - lastFrame > FRAME_INTERVAL) {
      paint();
      lastFrame = timestamp;
    }
    frameId = window.requestAnimationFrame(loop);
  };

  const open = () => {
    if (isOpen()) return;

    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');

    // The canvas has no size until the overlay is displayed, so measure now.
    resize();

    if (reduceMotion) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      paint();
    } else {
      frameId = window.requestAnimationFrame(loop);
    }

    if (closeButton) closeButton.focus();
  };

  const close = () => {
    if (!isOpen()) return;

    overlay.classList.remove('on');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');

    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    lastFrame = 0;
  };

  // The terminal asks for the overlay through this event.
  document.addEventListener('portfolio:matrix', open);

  if (closeButton) closeButton.addEventListener('click', close);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target === canvas) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      close();
      return;
    }

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === KONAMI[konamiIndex]) {
      konamiIndex += 1;
      if (konamiIndex === KONAMI.length) {
        konamiIndex = 0;
        open();
      }
    } else {
      konamiIndex = key === KONAMI[0] ? 1 : 0;
    }
  });

  window.addEventListener('resize', () => {
    if (isOpen()) resize();
  });
})();
