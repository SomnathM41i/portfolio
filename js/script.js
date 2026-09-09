const hamburger = document.getElementById('hamburger');
const drawer = document.getElementById('mobileDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');

const openDrawer = () => {
  drawer.classList.add('open');
  drawerBackdrop.classList.add('open');
  hamburger.classList.add('open');
  document.body.classList.add('no-scroll');
  drawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.setAttribute('aria-hidden', 'false');
  hamburger.setAttribute('aria-expanded', 'true');
};

const closeDrawer = () => {
  drawer.classList.remove('open');
  drawerBackdrop.classList.remove('open');
  hamburger.classList.remove('open');
  document.body.classList.remove('no-scroll');
  drawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.setAttribute('aria-hidden', 'true');
  hamburger.setAttribute('aria-expanded', 'false');
};

hamburger.addEventListener('click', () => {
  drawer.classList.contains('open') ? closeDrawer() : openDrawer();
});
drawerBackdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

document.querySelectorAll('.nav-links a, .drawer-links a').forEach(a => {
  a.addEventListener('click', closeDrawer);
});

const spySectionIds = ['about', 'skills', 'experience', 'projects', 'certifications', 'contact'];
const navAnchors = document.querySelectorAll('.nav-links a, .drawer-links a');
const spyObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const id = '#' + e.target.id;
      navAnchors.forEach(a => a.classList.toggle('active', a.getAttribute('href') === id));
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });

spySectionIds.forEach(id => {
  const el = document.getElementById(id);
  if (el) spyObserver.observe(el);
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const t = document.querySelector(a.getAttribute('href'));
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const FORM_ENDPOINT = 'https://formspree.io/f/mzebyvoj';

const contactForm = document.getElementById('contactForm');
const formStatus = document.getElementById('formStatus');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('.form-submit');
    const data = Object.fromEntries(new FormData(contactForm).entries());
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> sending...';
    formStatus.className = 'form-status';
    formStatus.style.display = 'block';

    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        formStatus.className = 'form-status success';
        formStatus.textContent = '✓ Message sent successfully! I\'ll get back to you soon.';
        contactForm.reset();
      } else {
        throw new Error('Formspree request failed');
      }
    } catch {
      formStatus.className = 'form-status error';
      formStatus.textContent = '✗ Something went wrong. Please try again or email me directly.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
      setTimeout(() => { formStatus.style.display = 'none'; }, 5000);
    }
  });
}
