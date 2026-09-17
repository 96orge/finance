# Third-party files

Steady hosts its third-party files here rather than loading them from CDNs. The app never waits on another server, works fully offline, and doesn't contact anything outside its own site.

| Library | Version | Files | Source | Licence |
|---|---|---|---|---|
| [Chart.js](https://www.chartjs.org) | 4.5.1 | `chart.js/chart.umd.min.js` | npm `chart.js@4.5.1` (`dist/chart.umd.min.js`) | MIT, `chart.js/LICENSE.md` |
| [Font Awesome Free](https://fontawesome.com) | 6.4.0 | `fontawesome/css/all.min.css`, `fontawesome/webfonts/*.woff2` | npm `@fortawesome/fontawesome-free@6.4.0` | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT, `fontawesome/LICENSE.txt` |
| [Outfit](https://fonts.google.com/specimen/Outfit) | Google Fonts v15, variable, weights 300–800 | `outfit/*.woff2`, `outfit/outfit.css` | Google Fonts | SIL OFL 1.1, `outfit/OFL.txt` |

All files are unmodified copies, except `outfit/outfit.css`, which mirrors the stylesheet Google Fonts serves but points at the local font files. A few files from the original packages are deliberately left out:

- **Font Awesome's `.ttf` fallbacks.** Its CSS lists `.woff2` first, and every browser that can run Steady supports woff2.
- **Chart.js's source map** (~1MB). Browsers only request it while DevTools is open.

## Upgrading a library

1. Replace the files, keeping the same paths. If a path has to change, update `index.html` and `SHELL_ASSETS` in `sw.js`.
2. Update the version in the table above.
3. Bump `CACHE_VERSION` in `sw.js`, so installed copies of the app drop the old files instead of serving them one more time.
4. Run `npm test`.
