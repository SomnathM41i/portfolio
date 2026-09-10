/* navigation.js — mobile slide-in drawer, scrollspy, and smooth in-page scrolling.
   Classic script (IIFE) loaded before reveal.js and contact-form.js.
   Kept as one module because all three behaviors share the nav anchors and the
   viewport/resize lifecycle; splitting them further would spread state. */
(function () {
  'use strict';

  const MOBILE_BREAKPOINT = 960;
  const hamburger = document.getElementById('hamburger');
  const drawer = document.getElementById('mobileDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const navAnchors = document.querySelectorAll('.nav-links a, .drawer-links a');

  const setDrawerOpen = (open) => {
    drawer.classList.toggle('open', open);
    drawerBackdrop.classList.toggle('open', open);
    hamburger.classList.toggle('open', open);
    document.body.classList.toggle('no-scroll', open);
    drawer.setAttribute('aria-hidden', String(!open));
    drawerBackdrop.setAttribute('aria-hidden', String(!open));
    hamburger.setAttribute('aria-expanded', String(open));
  };

  const initDrawer = () => {
    if (!hamburger || !drawer || !drawerBackdrop) return;

    const closeDrawer = () => setDrawerOpen(false);

    hamburger.addEventListener('click', () => {
      setDrawerOpen(!drawer.classList.contains('open'));
    });
    drawerBackdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });
    navAnchors.forEach((anchor) => anchor.addEventListener('click', closeDrawer));
    window.addEventListener('resize', () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) closeDrawer();
    });
  };

  const initSmoothScroll = () => {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        const target = document.querySelector(anchor.getAttribute('href'));
        if (!target) return; // not an in-page anchor; let the browser handle it
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  const initScrollSpy = () => {
    const sectionIds = ['about', 'skills', 'experience', 'projects', 'certifications', 'contact'];
    const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = '#' + entry.target.id;
        navAnchors.forEach((anchor) => {
          anchor.classList.toggle('active', anchor.getAttribute('href') === id);
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });

    sections.forEach((section) => observer.observe(section));
  };

  initDrawer();
  initSmoothScroll();
  initScrollSpy();
})();