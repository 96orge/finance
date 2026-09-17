import { test, expect } from './fixtures.js';
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

test('keeps working offline once it has been opened online', async ({ page, context }) => {
    await openApp(page, RICH_STATE);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // This visit is served through the worker, which also caches the CDN libraries.
    await page.reload();
    await expect(page.locator('#stat-total-balance')).not.toHaveText('₦0.00');

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#page-title')).toHaveText('Dashboard');
    await expect(page.locator('#stat-total-balance')).not.toHaveText('₦0.00');
});
