/* contact-form.js — async Formspree submission with user-facing status feedback.
   The endpoint is read from the form's data-endpoint attribute so the API URL
   stays in markup instead of being hardcoded in script. */
(function () {
  'use strict';

  const REQUEST_TIMEOUT_MS = 15000;
  const STATUS_DISMISS_MS = 5000;
  const DEFAULT_BUTTON_LABEL = '<i class="fas fa-paper-plane"></i> Send Message';
  const SUBMITTING_LABEL = '<i class="fas fa-spinner fa-spin"></i> sending...';

  const contactForm = document.getElementById('contactForm');
  const statusBox = document.getElementById('formStatus');
  if (!contactForm || !statusBox) return;

  const endpoint = contactForm.getAttribute('data-endpoint');
  const submitButton = contactForm.querySelector('.form-submit');

  const showStatus = (type, message) => {
    statusBox.className = 'form-status ' + type;
    statusBox.textContent = message;
  };

  const resetButton = () => {
    submitButton.disabled = false;
    submitButton.innerHTML = DEFAULT_BUTTON_LABEL;
  };

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!endpoint || submitButton.disabled) return;

    const payload = Object.fromEntries(new FormData(contactForm).entries());
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    submitButton.disabled = true;
    submitButton.innerHTML = SUBMITTING_LABEL;
    statusBox.className = 'form-status'; // reset any prior success/error state

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Formspree returned ' + response.status);

      showStatus('success', '✓ Message sent successfully! I will get back to you soon.');
      contactForm.reset();
    } catch (error) {
      const timedOut = error.name === 'AbortError';
      showStatus(
        'error',
        timedOut
          ? '✗ Request timed out. Please try again or email me directly.'
          : '✗ Something went wrong. Please try again or email me directly.'
      );
    } finally {
      clearTimeout(timeoutId);
      resetButton();
      setTimeout(() => { statusBox.className = 'form-status'; }, STATUS_DISMISS_MS);
    }
  });
})();