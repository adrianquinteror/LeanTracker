# LeanTracker

A single-file, client-only daily habit/nutrition/training tracker (`index.html`). All data lives in the browser's `localStorage` — no backend, no accounts.

## Running it

Open `index.html` directly in a browser, or serve the folder with any static file server.

## Tests

```
npm install
npx playwright install chromium   # one-time, downloads the test browser
npm test
```

Tests load the real `index.html` in a headless browser and exercise the app's core logic (day/habit persistence, scoring, plan validation, reminders) through its actual functions — see `test/app.test.js`.
