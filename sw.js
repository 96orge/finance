// Bump when SHELL_ASSETS or the caching strategy changes; old caches are deleted on activate.
const CACHE_VERSION = 'steady-v5';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// Saved on install, so the app works offline straight after the first visit.
const SHELL_ASSETS = [
  './', 'index.html', 'app.js', 'online.js', 'style.css',
  'online-statements.js', 'online-review.js', 'online-reminders.js',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'vendor/source-sans-3/source-sans-3.css', 'vendor/source-sans-3/source-sans-3-latin.woff2', 'vendor/source-sans-3/source-sans-3-latin-ext.woff2',
  'vendor/poppins/poppins.css',
  'vendor/poppins/poppins-500-latin.woff2', 'vendor/poppins/poppins-600-latin.woff2', 'vendor/poppins/poppins-700-latin.woff2', 'vendor/poppins/poppins-800-latin.woff2',
  'vendor/poppins/poppins-500-latin-ext.woff2', 'vendor/poppins/poppins-600-latin-ext.woff2', 'vendor/poppins/poppins-700-latin-ext.woff2', 'vendor/poppins/poppins-800-latin-ext.woff2',
  'vendor/fontawesome/css/all.min.css', 'vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'vendor/chart.js/chart.umd.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Path relative to the app's root, e.g. "vendor/chart.js/chart.umd.min.js" — the site
  // lives under /finance/ on GitHub Pages but at / locally.
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);

  if (path.startsWith('vendor/') || path.startsWith('icons/')) {
    // Third-party files and icons only change when deliberately upgraded: answer from the
    // cache immediately (fast on slow connections) and refresh the saved copy in the background.
    const network = fetch(e.request).then(async (res) => {
      if (res.ok) await (await caches.open(SHELL_CACHE)).put(e.request, res.clone());
      return res;
    });
    e.respondWith(caches.match(e.request).then((cached) => cached || network));
    e.waitUntil(network.catch(() => {}));
    return;
  }

  // The app's own code: network first, so online users always get the latest version;
  // the cache is only a fallback when offline.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((cached) =>
      cached || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

// ============================================================================
//  Reminder notifications for bills due and loans overdue (online-reminders.js).
//
//  Steady has no server, so nothing is pushed and nothing leaves the device. The
//  page works out a schedule of reminders and saves it in IndexedDB (a service
//  worker can't read localStorage). This worker shows the ones that are due:
//   - on 'periodicsync' (Chrome/Edge, installed app): the background path, which
//     works while Steady is closed; the browser decides how often it runs;
//   - when an open Steady page asks with { type: 'steady-check-reminders' }
//     (on start-up, when you leave the app, and every 15 minutes).
//  A shown reminder is remembered in the same transaction that picks it, so two
//  checks running at once never show it twice.
// ============================================================================
const REMINDERS_DB = 'steady-reminders';
const REMINDERS_STORE = 'kv';                           // keys: 'schedule', 'prefs', 'notified'
const REMINDERS_SYNC_TAG = 'steady-reminders';
const REMINDER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;    // older ones are stale: don't dump them on a long-closed app
const REMINDER_FORGET_MS = 120 * 24 * 60 * 60 * 1000;   // how long to remember that one was shown
const MAX_SINGLE_REMINDERS = 3;                         // then one summary for the rest

function openRemindersDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REMINDERS_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(REMINDERS_STORE)) req.result.createObjectStore(REMINDERS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Reminders that are due at `now` and not shown yet. With `mark`, they are also
// recorded as shown (and long-ago entries forgotten) before the transaction commits.
function takeDueReminders(db, now, mark) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDERS_STORE, 'readwrite');
    const store = tx.objectStore(REMINDERS_STORE);
    const schedule = store.get('schedule');
    const prefs = store.get('prefs');
    const notified = store.get('notified');
    let due = [];
    notified.onsuccess = () => { // requests complete in order, so all three results are in
      if (!prefs.result || !prefs.result.enabled) return;
      const items = schedule.result && Array.isArray(schedule.result.items) ? schedule.result.items : [];
      const shown = notified.result || {};
      due = items.filter((it) => it && typeof it.id === 'string' && typeof it.fireAt === 'number' &&
        it.fireAt <= now && now - it.fireAt <= REMINDER_MAX_AGE_MS &&
        !(typeof it.until === 'number' && now >= it.until) && !shown[it.id]);
      if (!mark || due.length === 0) return;
      due.forEach((it) => { shown[it.id] = now; });
      Object.keys(shown).forEach((id) => { if (!(now - shown[id] < REMINDER_FORGET_MS)) delete shown[id]; });
      store.put(shown, 'notified');
    };
    tx.oncomplete = () => resolve(due);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Reminder check aborted'));
  });
}

async function checkReminders(now) {
  if (self.Notification && self.Notification.permission !== 'granted') {
    return { shown: [], summarised: [], waiting: [], reason: 'no-permission' };
  }
  // Someone looking at Steady right now sees the reminders banner instead. Leave
  // these unmarked, so they show once the app is in the background or closed.
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const appInFront = windows.some((c) => c.visibilityState === 'visible' && c.focused);

  const db = await openRemindersDb();
  let due;
  try {
    due = await takeDueReminders(db, now, !appInFront);
  } finally {
    db.close();
  }
  if (appInFront) return { shown: [], summarised: [], waiting: due.map((it) => it.id), reason: due.length ? 'app-in-front' : 'nothing-due' };

  due.sort((a, b) => b.fireAt - a.fireAt); // the most recent first
  const single = due.slice(0, MAX_SINGLE_REMINDERS);
  const rest = due.slice(MAX_SINGLE_REMINDERS);
  const show = (title, options) => self.registration
    .showNotification(title, { icon: 'icons/icon-192.png', lang: 'en', ...options })
    .catch((err) => console.warn('Could not show a reminder:', err));
  await Promise.all(single.map((it) => show(String(it.title), {
    body: String(it.body || ''), tag: it.id, timestamp: it.fireAt, data: { tab: it.tab || 'dashboard' }
  })));
  if (rest.length) {
    const tabs = new Set(rest.map((it) => it.tab || 'dashboard'));
    await show(`${rest.length} more ${rest.length === 1 ? 'bill or loan needs' : 'bills and loans need'} attention`, {
      body: 'Open Steady to see them all.', tag: 'steady-reminders-more',
      data: { tab: tabs.size === 1 ? [...tabs][0] : 'dashboard' }
    });
  }
  return { shown: single.map((it) => it.id), summarised: rest.map((it) => it.id), waiting: [], reason: due.length ? 'shown' : 'nothing-due' };
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === REMINDERS_SYNC_TAG) e.waitUntil(checkReminders(Date.now()).catch((err) => console.warn('Reminder check failed:', err)));
});

self.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || msg.type !== 'steady-check-reminders') return;
  // `now` is for tests only: the page's clock can be frozen while this worker's isn't.
  const now = Number.isFinite(msg.now) ? msg.now : Date.now();
  const port = e.ports && e.ports[0];
  e.waitUntil(checkReminders(now).then(
    (result) => { if (port) port.postMessage(result); },
    (err) => {
      console.warn('Reminder check failed:', err);
      if (port) port.postMessage({ shown: [], summarised: [], waiting: [], reason: 'error' });
    }));
});

// Tapping a reminder opens Steady on the page it is about.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const tab = typeof data.tab === 'string' && /^[a-z]+$/.test(data.tab) ? data.tab : 'dashboard';
  e.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = windows.find((c) => c.url.startsWith(self.registration.scope));
    if (win) {
      try { await win.focus(); } catch (err) { /* focusing can be refused; still switch the page */ }
      win.postMessage({ type: 'steady-open-tab', tab });
      return;
    }
    await self.clients.openWindow(`./?tab=${encodeURIComponent(tab)}`);
  })());
});
