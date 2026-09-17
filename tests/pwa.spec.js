import { test, expect } from '@playwright/test';
import { openApp, RICH_STATE } from './helpers.js';

test.skip(({ isMobile }) => isMobile, 'runs once');
test.use({ serviceWorkers: 'allow' });

test('the manifest is linked, valid, and all its icons load', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(href)).json();

    expect(manifest).toMatchObject({ name: 'Steady', short_name: 'Steady', display: 'standalone', start_url: './', scope: './' });
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true);
    for (const icon of manifest.icons) {
        expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    }
});

test('works offline — fonts, icons and charts included — after a single online visit', async ({ page, context }) => {
    await openApp(page, RICH_STATE);
    // The worker saves everything the app needs while installing, so one visit is enough.
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#page-title')).toHaveText('Dashboard');
    await expect(page.locator('#stat-total-balance')).not.toHaveText('₦0.00');

    const assets = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = (family, weight) => [...document.fonts].some((face) =>
            face.family.replace(/["']/g, '') === family && face.status === 'loaded' && (!weight || face.weight === weight));
        return { text: loaded('Outfit'), icons: loaded('Font Awesome 6 Free', '900'), charts: typeof Chart === 'function' };
    });
    expect(assets).toEqual({ text: true, icons: true, charts: true });
});
