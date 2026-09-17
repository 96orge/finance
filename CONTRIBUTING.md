# Contributing to Steady

Thanks for helping out. Steady is a personal finance tracker that runs entirely in the browser: plain HTML, CSS and JavaScript, with no framework and no build step. Everything a user enters stays in their own browser's `localStorage`.

## Ground rules

- **Nothing leaves the user's device.** This is the app's core promise. Don't add analytics, trackers, error reporting, or calls to any API or server. That includes CDN links: third-party files live in [`vendor/`](vendor/README.md), so the app works offline and never contacts another server. The tests fail if a page requests anything from another server, and pull requests that send data off the device won't be merged.
- **Keep it build-free.** The site has to keep working as plain files served by GitHub Pages. npm is only used for the local server and the tests; the app itself must never depend on it.
- **Don't rename the storage key.** Saved data lives under `96orge_budget_state` (a legacy name). Renaming it would wipe every existing user's data. When you add something new to `state`, give it a default in `migrateState()` in `app.js` so older saved data upgrades cleanly.
- **Check phone widths.** Most people use Steady on a phone. Try your change at about 360–412px wide; your browser's device mode is fine for this.

## Running it locally

You'll need [Node.js](https://nodejs.org) (the LTS version).

```bash
npm install
npm start        # http://127.0.0.1:4173
```

Any static server works too (for example `python -m http.server`). Opening `index.html` straight from disk mostly works, but the service worker won't run.

## Tests

The tests use [Playwright](https://playwright.dev) and run the app in a real Chromium browser, at both phone and desktop sizes.

```bash
npx playwright install chromium   # first time only
npm test                          # run everything
npm run test:ui                   # interactive mode, handy for debugging
```

| File | What it checks |
|---|---|
| `tests/navigation.spec.js` | Every section opens without script errors or requests to other servers: with data, on first visit, and after "Clear All Data" |
| `tests/layout.spec.js` | Nothing spills past the right edge on 360px and 412px screens |
| `tests/money.spec.js` | Net worth, transfers between accounts, and USD→₦ conversion |
| `tests/pwa.spec.js` | The manifest, the icons, and working offline, fonts and charts included |

Tests load their data straight into `localStorage` (see `tests/helpers.js`) and freeze the clock at 15 September 2026, so monthly totals don't change from day to day. If you fix a bug, a test that would have caught it is very welcome.
## Where things live

| File | Contents |
|---|---|
| `index.html` | All the markup, including every page ("view") and modal |
| `app.js` | All the logic. `switchToTab()` shows a page; most pages have a `render…View()` function |
| `style.css` | All the styles. Design tokens (CSS custom properties) at the top; the light and dark themes override them |
| `sw.js` | The service worker. The app's own code is network-first; vendor files and icons are served from the cache and refreshed in the background. If you add a file the app needs offline, add it to `SHELL_ASSETS` |
| `manifest.webmanifest`, `icons/` | What phones use when the app is installed to the home screen |
| `vendor/` | Third-party files (Chart.js, Font Awesome, the Outfit font) with their licences. See [`vendor/README.md`](vendor/README.md) for sources and how to upgrade |

To add a new page, you'll touch the desktop sidebar, the mobile side drawer and the "More" list in `index.html`, add a `<div id="view-…" class="app-view">`, and add it to `TAB_TITLES` and `switchToTab()` in `app.js`.

## Sending a change

1. Fork the repository and create a branch.
2. Make your change and run `npm test`.
3. Open a pull request saying what changed and why. Screenshots help for anything visual.

The tests run automatically on every pull request and have to pass before it can be merged. Merging to `main` publishes the site to GitHub Pages straight away.

By contributing, you agree that your work is released under the [MIT License](LICENSE).
