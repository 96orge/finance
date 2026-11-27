import { defineConfig, devices } from '@playwright/test';

// PORT=4180 npx playwright test runs the suite on another port (e.g. two checkouts at once).
const PORT = Number(process.env.PORT) || 4173;

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // Keep the service worker out of the way so every test loads fresh files;
        // tests/pwa.spec.js turns it back on to test it directly.
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    ],
    webServer: {
        command: 'node scripts/serve.mjs',
        env: { PORT: String(PORT) },
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
    },
});
