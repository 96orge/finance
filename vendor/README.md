# Third-party files

Steady hosts its third-party files here rather than loading them from CDNs. The app never waits on another server, works fully offline, and doesn't contact anything outside its own site.

| Library | Version | Files | Source | Licence |
|---|---|---|---|---|
| [Chart.js](https://www.chartjs.org) | 4.5.1 | `chart.js/chart.umd.min.js` | npm `chart.js@4.5.1` (`dist/chart.umd.min.js`) | MIT, `chart.js/LICENSE.md` |
| [Font Awesome Free](https://fontawesome.com) | 6.4.0 | `fontawesome/css/all.min.css`, `fontawesome/webfonts/*.woff2` | npm `@fortawesome/fontawesome-free@6.4.0` | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT, `fontawesome/LICENSE.txt` |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) | 1.14.0 | `anthropic-sdk/anthropic-sdk.mjs` | npm `@anthropic-ai/sdk@1.14.0`, bundled to one browser ES module with esbuild (see below) | MIT, `anthropic-sdk/LICENSE` |
| [Poppins](https://fonts.google.com/specimen/Poppins) | Google Fonts v24, static weights 500–800, latin + latin-ext | `poppins/*.woff2`, `poppins/poppins.css` | Google Fonts | SIL OFL 1.1, `poppins/OFL.txt` |
| [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) | Google Fonts v20, variable, weights 200–900, latin + latin-ext | `source-sans-3/*.woff2`, `source-sans-3/source-sans-3.css` | Google Fonts | SIL OFL 1.1, `source-sans-3/OFL.txt` |

All files are unmodified copies, except `poppins/poppins.css` and `source-sans-3/source-sans-3.css`, which mirror the stylesheets Google Fonts serves but points at the local font files. The Anthropic SDK ships as many modules, so it is bundled into one file. It is only loaded when someone uses the assistant. To rebuild it:

```bash
npm i @anthropic-ai/sdk@<version> esbuild   # in a scratch folder
echo "export { default as Anthropic } from '@anthropic-ai/sdk';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --legal-comments=none --outfile=anthropic-sdk.mjs
```

A few files from the original packages are deliberately left out:

- **Font Awesome's `.ttf` fallbacks.** Its CSS lists `.woff2` first, and every browser that can run Steady supports woff2.
- **Chart.js's source map** (~1MB). Browsers only request it while DevTools is open.

## Upgrading a library

1. Replace the files, keeping the same paths. If a path has to change, update `index.html` and `SHELL_ASSETS` in `sw.js`.
2. Update the version in the table above.
3. Bump `CACHE_VERSION` in `sw.js`, so installed copies of the app drop the old files instead of serving them one more time.
4. Run `npm test`.
