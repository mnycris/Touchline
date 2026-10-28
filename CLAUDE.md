# Touchline

Mobile-first football manager career (React 19, zustand, Vite PWA; Capacitor iOS wrapper built on Codemagic).

- **Interface work:** read [docs/DESIGN.md](docs/DESIGN.md) first and review every change against it: screenshot the
  screens before and after with `node scripts/qa/design-review.mjs <save> <out-dir> [screens]` (needs `npx vite` on
  :5173) and compare the whole screen, not only the part changed.
- **Refine, never strip:** the look in DESIGN.md's "What Touchline is" (cards, colour, glow, motion, the shortcut
  tiles) stays. Remove what reads as a generated default; when unsure whether something is identity, keep it and ask.
- **Checks:** `npx tsc --noEmit -p tsconfig.app.json`, `npx oxlint`, `npm run build`.
- **QA scripts:** `scripts/qa/` (Playwright with the preinstalled Chromium at `/opt/pw-browsers/chromium`; the dev
  server exposes the store as `window.__game`). `load-save.mjs` opens a `.touchline` save.
