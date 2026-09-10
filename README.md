# Somnath Mali — Portfolio

Personal developer portfolio for **Somnath Mali**, Full-Stack Developer (PHP · Laravel · CodeIgniter · FastAPI · Python · React).

**Live:** https://somnathm41i-portfolio.vercel.app

## Tech stack

- Vanilla HTML / CSS / JavaScript — no build step, no framework
- CSS custom properties for design tokens (`css/style.css`), breakpoints in `css/responsive.css`
- Contact form posts to [Formspree](https://formspree.io) (endpoint read from `data-endpoint` on the `<form>` element)
- Deployed on Vercel (auto-deploys from `main`)

## Structure

```
index.html            main page
css/
  style.css           design tokens, layout, components
  responsive.css      media-query breakpoints
js/
  navigation.js       mobile slide-in drawer + scrollspy + smooth anchors
  reveal.js           reveal-on-scroll animations (fails safe without JS)
  contact-form.js     Formspree submission, 15s timeout, status feedback
```

## Local development

No build or dependencies. Either:

- Open `index.html` directly in a browser, or
- Serve the folder: `npx serve .` (or VS Code "Live Server")

The scripts are classic, ordered `<script>` tags; `navigation.js` must load before the others only because it is convention — there is no runtime coupling.

## Deployment

Push to `main` → Vercel auto-builds and deploys. No environment variables are required.

## Notes

- The `.js` class in `<head>` scopes the reveal animation's hidden state to "JavaScript enabled"; if JS fails, all content renders statically.
- `og:image` points to `/og-image.png` (1200×630) — add that file to the repo root when ready so link shares render a preview image.