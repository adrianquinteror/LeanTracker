# LeanTracker

A single-file, client-only daily habit/nutrition/training tracker (`index.html`). All data lives in the browser's `localStorage` — no backend, no accounts.

## Running it

Open `index.html` directly in a browser, or serve the folder with any static file server.

## Share with coach

Settings → **Share with coach** generates a link (`?share=<id>`). Anyone who opens it sees your data update live — read-only, except they can toggle the language. **Stop sharing** revokes the link immediately.

This is the one feature that isn't purely local: it syncs through a small Firebase (Firestore + Anonymous Auth) project so the link stays live. See `firestore.rules` for the security rules that restrict it (only the owner's own browser identity can write; the link's id is what grants read access, like an unlisted document link). Everything else in the app still has no backend and no accounts.

**Manual QA** (not covered by the automated tests below, which only check the local guard/view logic — a real Firebase project is needed for these):
- Tap Share with coach on one device/tab, open the link on another — data should appear and then update live as you log things on the first.
- Tap Stop sharing while the second tab is open — it should flip to "unavailable" without a reload.
- Toggling language on the shared link only changes that tab, never the owner's own `lt_lang`.
- Firestore security rules actually reject a write from a different (or unauthenticated) identity — try from the browser console with a mismatched uid.

## Tests

```
npm install
npm test
```

Tests load the real `index.html` in a headless browser and exercise the app's core logic (day/habit persistence, scoring, plan validation, reminders, coach share-mode guards) through its actual functions — see `test/app.test.js`. Chromium is expected to already be installed (e.g. via `npx playwright install chromium`, or pre-provisioned in the environment — see `PLAYWRIGHT_CHROMIUM_PATH`/`PLAYWRIGHT_BROWSERS_PATH` if `npm test` can't find a browser).
