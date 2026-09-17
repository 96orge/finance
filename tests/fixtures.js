import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// index.html loads Chart.js, Font Awesome and Google Fonts from CDNs, and all three hold up
// the page load. So a slow or unreachable CDN can't fail the tests, they're served locally:
//  - Chart.js is the real file, from the dev dependency pinned to the same version as index.html.
//    If the two versions ever differ, the request isn't matched and goes to the real CDN instead.
//  - The icon font and web font are purely visual, so they're stubbed: icons keep a realistic
//    size for the layout checks, and text uses the system sans-serif font.
const chartPkg = new URL('../node_modules/chart.js/', import.meta.url);
const CHART_VERSION = JSON.parse(readFileSync(new URL('package.json', chartPkg))).version;
const CHART_JS = readFileSync(new URL('dist/chart.umd.min.js', chartPkg));
const ICON_STUB = '.fa,.fa-solid,.fa-regular,.fa-brands{display:inline-block;width:1.25em;height:1em}';

export const test = base.extend({
    context: async ({ context }, use) => {
        await context.route(`https://cdn.jsdelivr.net/npm/chart.js@${CHART_VERSION}`, (route) =>
            route.fulfill({ contentType: 'application/javascript', body: CHART_JS }));
        await context.route('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/**', (route) =>
            route.fulfill({ contentType: 'text/css', body: ICON_STUB }));
        await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
            route.fulfill({ contentType: 'text/css', body: '' }));
        await use(context);
    },
});

export { expect };
