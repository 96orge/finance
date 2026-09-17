import { test, expect } from '@playwright/test';
import { openApp, RICH_STATE } from './helpers.js';

const VIEWS = ['dashboard', 'transactions', 'income', 'debts', 'goals', 'investments', 'networth', 'categories', 'learn', 'settings', 'more'];

// Runs in the page. Returns the outermost elements whose right edge passes the screen edge,
// ignoring anything inside a container that deliberately clips or scrolls sideways.
function findOverflow(view) {
    const limit = document.documentElement.clientWidth + 1;
    const root = document.getElementById(`view-${view}`);
    const describe = (el) =>
        el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + [...el.classList].map((c) => `.${c}`).join('');

    const main = document.querySelector('.main-content');
    if (main.getBoundingClientRect().right > limit) {
        return [`.main-content is ${Math.round(main.getBoundingClientRect().width)}px wide`];
    }

    const offenders = new Set();
    for (const el of root.querySelectorAll('*')) {
        const box = el.getBoundingClientRect();
        if (!box.width || box.right <= limit) continue;
        let skip = false;
        for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
            // Already reported via an ancestor, or inside a container that clips/scrolls sideways.
            if (offenders.has(a) || getComputedStyle(a).overflowX !== 'visible') { skip = true; break; }
        }
        if (!skip) offenders.add(el);
    }
    return [...offenders].map((el) => `${describe(el)} ends at ${Math.round(el.getBoundingClientRect().right)}px`);
}

test.describe('phone layout', () => {
    test.skip(({ isMobile }) => !isMobile, 'phone-width checks');

    for (const width of [360, 412]) {
        test(`nothing spills past the right edge of a ${width}px screen`, async ({ page }) => {
            test.slow(); // measures every element on every page
            await page.setViewportSize({ width, height: 900 });
            await openApp(page, RICH_STATE);
            for (const view of VIEWS) {
                await page.evaluate((v) => switchToTab(v), view);
                // Open collapsed sections so their contents get measured too.
                await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
                expect(await page.evaluate(findOverflow, view), `"${view}" at ${width}px`).toEqual([]);
            }
        });
    }
});
