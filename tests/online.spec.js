import { test, expect } from '@playwright/test';
import { openApp, goToTab, trackPageErrors, RICH_STATE, EMPTY_STATE } from './helpers.js';

// Every online service is mocked: tests never reach the real internet or spend API credit.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

function json(route, body, status = 200) {
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

// Answer CORS preflights, hand everything else to `handler`.
async function mock(page, pattern, handler) {
    await page.route(pattern, (route) => route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: CORS })
        : handler(route));
}

function claudeMessage(text) {
    return {
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
        content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 }
    };
}

function claudeStream(text) {
    const events = [
        ['message_start', { type: 'message_start', message: { ...claudeMessage(''), content: [], stop_reason: null } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }],
        ['message_stop', { type: 'message_stop' }],
    ];
    return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

const storedState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('96orge_budget_state')));

test('the ₦/$ rate updates itself when you hold US stocks', async ({ page }) => {
    await mock(page, 'https://open.er-api.com/**', (route) => json(route, { result: 'success', rates: { NGN: 1612.345 } }));
    const noRate = { ...RICH_STATE, settings: { ...RICH_STATE.settings, usdRate: null } };
    await openApp(page, noRate, { connections: { fxAuto: true } });
    await expect.poll(async () => (await storedState(page)).settings.usdRate).toBe(1612.35);
    await goToTab(page, 'investments');
    await expect(page.locator('#usd-rate-input')).toHaveValue('1612.35');
    await expect(page.locator('#online-prices-bar')).toContainText('live');
});

test('smart add drafts transactions with Claude and saves only after you confirm', async ({ page }) => {
    const errors = trackPageErrors(page);
    let request;
    await mock(page, 'https://api.anthropic.com/**', (route) => {
        request = route.request().postDataJSON();
        return json(route, claudeMessage(JSON.stringify({ transactions: [
            { title: 'Suya', type: 'expense', amount: 3500, date: '2026-09-14', categoryId: 'cat-food', accountId: null, notes: '' },
            { title: 'Data bundle', type: 'expense', amount: 15000, date: '2026-09-15', categoryId: 'cat-utilities', accountId: null, notes: 'GTB' },
        ] })));
    });
    await openApp(page, RICH_STATE, { connections: { fxAuto: false, aiKey: 'sk-ant-test-key' } });
    const before = (await storedState(page)).transactions.length;

    await goToTab(page, 'assistant');
    await page.locator('#smart-add-text').fill('3,500 suya yesterday, 15k data from GTB');
    await page.locator('#smart-add-submit').click();
    await expect(page.locator('.draft-row')).toHaveCount(2);

    // The request asks for schema-checked JSON and only offers the user's own categories.
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.output_config.format.type).toBe('json_schema');
    expect(request.output_config.format.schema.properties.transactions.items.properties.categoryId.enum).toContain('cat-food');

    expect((await storedState(page)).transactions.length).toBe(before); // nothing saved yet
    await page.locator('.draft-row').nth(1).locator('[data-f="include"]').uncheck();
    await page.locator('#smart-add-save').click();
    const after = await storedState(page);
    expect(after.transactions.length).toBe(before + 1);
    expect(after.transactions.some(t => t.title === 'Suya' && t.amount === 3500)).toBe(true);
    expect(errors).toEqual([]);
});

test('ask about your money streams an answer that uses your numbers', async ({ page }) => {
    let request;
    await mock(page, 'https://api.anthropic.com/**', (route) => {
        request = route.request().postDataJSON();
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: claudeStream('You spent **most** on food.\n\n- Cook at home\n- Set a budget') });
    });
    await openApp(page, RICH_STATE, { connections: { fxAuto: false, aiKey: 'sk-ant-test-key' } });
    await goToTab(page, 'assistant');
    await page.locator('#ask-suggestions .chip-btn').first().click();
    await expect(page.locator('.ask-assistant')).toContainText('You spent most on food.');
    await expect(page.locator('.ask-assistant li')).toHaveCount(2);
    const summary = request.system.map(b => b.text).join('\n');
    expect(summary).toContain('NET WORTH');
    expect(summary).not.toContain('sk-ant-test-key');
});

test('without a key the assistant explains how to turn it on, and makes no requests', async ({ page }) => {
    const calls = [];
    page.on('request', (r) => { if (r.url().includes('anthropic.com')) calls.push(r.url()); });
    await openApp(page, EMPTY_STATE);
    await goToTab(page, 'assistant');
    await expect(page.locator('#assistant-setup-card')).toBeVisible();
    await expect(page.locator('#smart-add-card')).toBeHidden();
    expect(calls).toEqual([]);
});

test('cloud backup is encrypted, and restores on another device with the passphrase', async ({ page, context }) => {
    const errors = trackPageErrors(page);
    let gist = null;
    const handleGitHub = async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (req.method() === 'GET' && url.pathname === '/gists') return json(route, gist ? [{ id: gist.id, files: { 'steady-backup.json': {} } }] : []);
        if (req.method() === 'GET' && url.pathname === '/gists/g1') return gist ? json(route, gist) : json(route, {}, 404);
        if (req.method() === 'POST' || req.method() === 'PATCH') {
            const body = req.postDataJSON();
            gist = { id: 'g1', files: { 'steady-backup.json': { content: body.files['steady-backup.json'].content, truncated: false } } };
            return json(route, gist);
        }
        return json(route, {}, 404);
    };
    const sync = { token: 'github_pat_test', passphrase: 'correct horse battery', auto: true };

    // Device 1: back up.
    await mock(page, 'https://api.github.com/**', handleGitHub);
    await openApp(page, RICH_STATE, { connections: { fxAuto: false, sync } });
    await goToTab(page, 'settings');
    await page.locator('#sync-settings-form button[type="submit"]').click();
    await expect.poll(() => gist !== null).toBe(true);

    const uploaded = gist.files['steady-backup.json'].content;
    expect(uploaded).not.toContain('Apple Inc.');          // GitHub only sees ciphertext
    expect(uploaded).not.toContain('github_pat_test');     // and never the secrets
    expect(JSON.parse(uploaded).cipher.name).toBe('AES-256-GCM');

    // Device 2: empty, same token and passphrase -> offered the backup -> restore.
    const page2 = await context.newPage();
    await mock(page2, 'https://api.github.com/**', handleGitHub);
    await openApp(page2, EMPTY_STATE, { connections: { fxAuto: false, sync } });
    await expect(page2.locator('#sync-banner')).toBeVisible();
    const reloaded = page2.waitForEvent('load'); // restoring reloads the app with the backup
    await page2.locator('#sync-banner [data-act="restore"]').click();
    await reloaded;
    await expect(page2.locator('#page-title')).toHaveText('Dashboard');
    await expect(page2.locator('#sync-banner')).toHaveCount(0); // up to date now: no second offer
    await expect.poll(async () => (await storedState(page2)).transactions.length).toBe(RICH_STATE.transactions.length);
    expect(errors).toEqual([]);
});

test('a wrong passphrase cannot open the backup', async ({ page }) => {
    await openApp(page, RICH_STATE);
    const result = await page.evaluate(async () => {
        const payload = await window.steadyOnline.encryptState('the right passphrase');
        try { await window.steadyOnline.decryptPayload(payload, 'a wrong passphrase'); return 'opened'; }
        catch (e) { return e.message; }
    });
    expect(result).toBe('WRONG_PASSPHRASE');
});

test('keys stay out of the saved data and exports', async ({ page }) => {
    await openApp(page, RICH_STATE, { connections: { fxAuto: false, aiKey: 'sk-ant-secret', finnhubKey: 'fh-secret' } });
    await page.evaluate(() => saveData());
    const raw = await page.evaluate(() => localStorage.getItem('96orge_budget_state'));
    expect(raw).not.toContain('sk-ant-secret');
    expect(raw).not.toContain('fh-secret');
});
