// Loads the real index.html in a headless browser and exercises the app's
// core logic through its actual global functions — this app has no build
// step or module system, so the browser itself is the most faithful place
// to test it (no DOM/localStorage shims to keep in sync with reality).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Serves the repo's index.html for every request — this harness only ever
// needs the one file, so no routing/MIME-type logic beyond that.
function startStaticServer() {
  const indexPath = path.join(__dirname, '..', 'index.html');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      fs.readFile(indexPath, (err, data) => {
        if (err) { res.writeHead(500); res.end(String(err)); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({
        url: `http://127.0.0.1:${port}/index.html`,
        close: () => new Promise((res) => srv.close(res)),
      });
    });
  });
}

let server;
let browser;
let page;

before(async () => {
  server = await startStaticServer();
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  page = await browser.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => typeof DB !== 'undefined');
});

after(async () => {
  await browser.close();
  await server.close();
});

beforeEach(async () => {
  await page.evaluate(() => { localStorage.clear(); DB = {}; });
});

test('getDay() creates a day with the expected default shape', async () => {
  const day = await page.evaluate(() => getDay('2026-01-01'));
  assert.deepEqual(day, {
    habits: {}, cal: null, training: '', weight: null, waist: null,
    belt: null, meals: {}, lifts: {}, selfChoice: 0,
  });
});

test('getDay() backfills missing fields on pre-existing entries', async () => {
  const day = await page.evaluate(() => {
    DB['2026-01-02'] = { habits: { agua: 1 } }; // simulates an older/imported entry
    return getDay('2026-01-02');
  });
  assert.deepEqual(day.meals, {});
  assert.deepEqual(day.lifts, {});
  assert.equal(day.selfChoice, 0);
  assert.equal(day.habits.agua, 1);
});

test('persist() round-trips the in-memory DB through localStorage', async () => {
  const stored = await page.evaluate(() => {
    const day = getDay('2026-01-03');
    day.cal = 1850;
    day.selfChoice = 2;
    persist();
    return JSON.parse(localStorage.getItem('lt_db'))['2026-01-03'];
  });
  assert.equal(stored.cal, 1850);
  assert.equal(stored.selfChoice, 2);
});

test('refreshScore() counts pass/total across habits, excluding "cal" and unset keys', async () => {
  const badge = await page.evaluate(() => {
    const dk = '2026-01-04';
    const day = getDay(dk);
    day.habits = { alcohol: 1, dulce: 0.5, agua: 0, cal: null, macros: null, training: 1, sleep: null, phone: null };
    refreshScore(dk);
    return document.getElementById('score-badge').textContent;
  });
  // alcohol/dulce/agua/training are set (4 total), alcohol+training pass (2)
  assert.equal(badge, '2/4');
});

test('refreshScore() shows an em-dash when no habits are logged yet', async () => {
  const badge = await page.evaluate(() => {
    const dk = '2026-01-05';
    getDay(dk);
    refreshScore(dk);
    return document.getElementById('score-badge').textContent;
  });
  assert.equal(badge, '—');
});

test('isActiveDay() is true when any tracked field is set, false for an empty day', async () => {
  const result = await page.evaluate(() => {
    const dk = '2026-01-06';
    const before = isActiveDay(dk); // no entry at all yet
    const day = getDay(dk);
    const stillFalse = isActiveDay(dk); // entry exists but every field is default/empty
    day.selfChoice = 1;
    const trueAfterSelfChoice = isActiveDay(dk);
    return { before, stillFalse, trueAfterSelfChoice };
  });
  assert.equal(result.before, false);
  assert.equal(result.stillFalse, false);
  assert.equal(result.trueAfterSelfChoice, true);
});

test('validatePlan() rejects an empty plan and accepts a minimal valid one', async () => {
  const result = await page.evaluate(() => {
    const emptyErrors = validatePlan({});
    const minimalPlan = {
      startDate: '2026-01-01',
      weeks: 1,
      weekBudget: 14000,
      expected: [80],
      runs: [{}],
      days: Array.from({ length: 7 }, () => ({
        cal: 2000,
        focus: { en: 'Focus' },
        meals: [{ n: 'Meal', k: 500 }],
      })),
    };
    const minimalErrors = validatePlan(minimalPlan);
    return { emptyErrors, minimalErrors };
  });
  assert.ok(result.emptyErrors.length > 0);
  assert.deepEqual(result.minimalErrors, []);
});

test('checkReminder() fires a notification once past the reminder time on an unlogged day, and not twice', async () => {
  const result = await page.evaluate(() => {
    const calls = [];
    window.Notification = function (title, opts) { calls.push({ title, opts }); };
    window.Notification.permission = 'granted';
    window.Notification.requestPermission = async () => 'granted';

    reminder = { on: true, time: '00:00', lastNotified: null }; // any time in the past today
    const tk = todayKey();
    delete DB[tk]; // ensure today is unlogged

    checkReminder();
    const firedOnce = calls.length === 1;
    checkReminder(); // same day again — should be deduped
    const stillOnce = calls.length === 1;
    return { firedOnce, stillOnce, lastNotified: reminder.lastNotified, tk };
  });
  assert.equal(result.firedOnce, true);
  assert.equal(result.stillOnce, true);
  assert.equal(result.lastNotified, result.tk);
});

test('checkReminder() does not notify once today is already logged', async () => {
  const fired = await page.evaluate(() => {
    const calls = [];
    window.Notification = function (title, opts) { calls.push({ title, opts }); };
    window.Notification.permission = 'granted';

    reminder = { on: true, time: '00:00', lastNotified: null };
    const tk = todayKey();
    getDay(tk).selfChoice = 1; // today counts as logged

    checkReminder();
    return calls.length;
  });
  assert.equal(fired, 0);
});

test('normalizePlan() fills in day-level defaults (tag/illus) without overwriting existing values', async () => {
  const days = await page.evaluate(() => {
    const plan = {
      startDate: '2026-01-01',
      weeks: 1,
      runs: [[]],
      days: Array.from({ length: 7 }, (_, i) => ({
        cal: 2000,
        focus: { en: 'Focus ' + i },
        meals: [],
        workout: i === 0 ? [['Bench', 5]] : null,
      })),
    };
    normalizePlan(plan);
    return plan.days.map(d => ({ tag: d.tag, illus: d.illus, hasWorkout: !!d.workout }));
  });
  assert.equal(days[0].hasWorkout, true);
  assert.equal(days[0].illus, 'lift');
  assert.equal(days[1].hasWorkout, false);
  assert.equal(days[1].illus, 'rest');
  assert.deepEqual(days[0].tag, { en: '', es: '' });
});
