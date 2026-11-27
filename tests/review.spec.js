import { test, expect } from '@playwright/test';
import { openApp, trackPageErrors } from './helpers.js';
import { CORS, mock, claudeStream, storedState } from './mocks.js';

// AI monthly review (online-review.js). Claude is always mocked: these tests never reach
// the real API or spend credit. The clock is frozen at 2026-09-15, so the review opens on
// August 2026 ("last month"), and July 2026 is the month before that.

const KEY = 'sk-ant-test-key';
const WITH_KEY = { connections: { fxAuto: false, aiKey: KEY } };

const tx = (id, date, title, type, amount, categoryId) => ({ id, title, type, amount, categoryId, date, notes: '', accountId: null });

const REVIEW_STATE = {
    transactions: [
        // July 2026
        tx('j-salary', '2026-07-25', 'CMD Salary', 'income', 450000, 'cat-salary'),
        tx('j-rent', '2026-07-01', 'July rent', 'expense', 200000, 'cat-housing'),
        tx('j-food', '2026-07-14', 'Eating out with friends', 'expense', 120000, 'cat-food'),
        tx('j-bolt', '2026-07-20', 'Bolt rides', 'expense', 30000, 'cat-transport'),
        // August 2026: income 510,000, spending 449,500, 10 transactions
        tx('a-salary', '2026-08-25', 'CMD Salary', 'income', 450000, 'cat-salary'),
        tx('a-logo', '2026-08-12', 'Logo design for Kemi', 'income', 60000, 'cat-freelance'),
        tx('a-rent', '2026-08-01', 'August rent', 'expense', 200000, 'cat-housing'),
        tx('a-shoprite', '2026-08-03', 'Groceries at Shoprite', 'expense', 62500, 'cat-food'),
        tx('a-chilli', '2026-08-16', 'Dinner at Yellow Chilli', 'expense', 50000, 'cat-food'),
        tx('a-chicken', '2026-08-22', 'Chicken Republic', 'expense', 30000, 'cat-food'),
        tx('a-bolt', '2026-08-09', 'Bolt rides', 'expense', 18000, 'cat-transport'),
        tx('a-concert', '2026-08-30', 'Burna Boy concert', 'expense', 24000, 'cat-entertainment'),
        tx('a-save', '2026-08-10', 'Savings — Emergency fund', 'expense', 50000, 'cat-savings'),
        tx('a-data', '2026-08-05', 'Data bundle', 'expense', 15000, 'cat-utilities'),
        // September 2026 (this month, in progress)
        tx('s-food', '2026-09-03', 'Groceries at Spar', 'expense', 20000, 'cat-food'),
    ],
    budgets: { 'cat-food': 100000, 'cat-entertainment': 30000 },
    goals: [{
        id: 'goal-ef', name: 'Emergency fund', targetAmount: 500000, targetDate: '2026-12-31', savedAmount: 150000,
        icon: 'fa-solid fa-umbrella', color: '#10b981', status: 'active',
        contributions: [{ id: 'gc-1', amount: 50000, date: '2026-08-10', note: '', txId: 'a-save' }],
    }],
    debts: [
        { id: 'debt-laptop', name: 'Laptop loan', counterparty: 'Chinedu', kind: 'iOwe', originalAmount: 250000, createdDate: '2026-06-01', dueDate: '2026-12-01', notes: '', status: 'active', payments: [{ id: 'p-1', amount: 50000, date: '2026-08-02', note: '', txId: null }] },
        { id: 'debt-tunde', name: 'Money lent out', counterparty: 'Tunde', kind: 'owedToMe', originalAmount: 15000, createdDate: '2026-08-02', dueDate: '2026-09-10', notes: '', status: 'active', payments: [] },
    ],
    reviews: [{
        id: 'rev-jul', month: '2026-07', createdDate: '2026-08-02',
        note: 'Too much eating out. Plan: keep Food & Dining under ₦100,000 in August.',
        aiSummary: { text: 'July: rent and eating out took most of your pay.', model: 'claude-opus-5-5', generatedAt: '2026-08-02T08:00:00.000Z', basis: { income: 450000, spending: 350000, count: 4 } },
    }],
    netWorthHistory: [{ month: '2026-07', value: 900000 }, { month: '2026-08', value: 980000 }],
    settings: { theme: 'dark', wantsMonthlyCap: 40000, activityDays: ['2026-09-13', '2026-09-14', '2026-09-15'] },
};

const WRITE_UP = [
    'A good month: you kept ₦60,500 of the ₦510,000 that came in.',
    '',
    '**What went well**',
    '- Freelance work added ₦60,000 on top of your salary.',
    '- You put ₦50,000 into your Emergency fund.',
    '',
    '**Where the money went**',
    // No blank line after this heading, the way Claude sometimes writes it.
    '- Food & Dining reached ₦142,500, ₦42,500 over your ₦100,000 budget.',
    '- Rent took ₦200,000, 39% of your income.',
    '',
    '**For next month**',
    '- Cap Food & Dining at ₦100,000 (you spent ₦142,500).',
    '- Move ₦50,000 to your Emergency fund on payday.',
    '- Keep one-off treats under ₦25,000.',
].join('\n');

// A streamed reply split into chunks, with any stop reason, optionally after a server-side
// fallback block (the API switched models before answering).
function sse(chunks, { stopReason = 'end_turn', model = 'claude-opus-5-5', fallbackTo = null } = {}) {
    const events = [['message_start', { type: 'message_start', message: {
        id: 'msg_review', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 1 } } }]];
    let index = 0;
    if (fallbackTo) {
        events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'fallback', from: { model }, to: { model: fallbackTo } } }]);
        events.push(['content_block_stop', { type: 'content_block_stop', index }]);
        index++;
    }
    if (chunks.length) {
        events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
        chunks.forEach((text) => events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }]));
        events.push(['content_block_stop', { type: 'content_block_stop', index }]);
    }
    events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 120 } }]);
    events.push(['message_stop', { type: 'message_stop' }]);
    return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

// Split text into ~40-character chunks, so the reply arrives the way a real stream does.
const chunked = (text) => text.match(/[\s\S]{1,40}/g);

const streamBody = (route, body) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body });

/** Mock Claude. `respond(route, n)` answers the n-th request (1-based). Returns the requests made. */
async function mockClaude(page, respond) {
    const requests = [];
    await mock(page, 'https://api.anthropic.com/**', (route) => {
        requests.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
        return respond(route, requests.length);
    });
    return requests;
}

/** A request that only gets answered when the test says so (to look at the screen mid-stream). */
function holdNextRequest() {
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let route = null;
    return {
        handler: async (r) => { route = r; await held; },
        get route() { return route; },
        // The page may have given up on the request (Stop, or closing the review): that's fine.
        async answer(body) { release(); if (route) await streamBody(route, body).catch(() => {}); },
    };
}

const reviewOf = async (page, month) => (await storedState(page)).reviews.find((r) => r.month === month);
const section = (page) => page.locator('#review-ai');
const writeButton = (page) => page.getByRole('button', { name: 'Write my review with Claude' });

async function openReview(page) {
    await page.locator('#btn-open-review').click();
    await expect(page.locator('#review-modal')).toHaveClass(/\bactive\b/);
    await expect(page.locator('#review-modal-title')).toHaveText('Review — August 2026');
}

async function closeReview(page) {
    await page.locator('#review-modal .btn-close-modal').click();
    await expect(page.locator('#review-modal')).not.toHaveClass(/\bactive\b/);
}

test('Claude writes the month up from your numbers and it is saved on that month\'s review', async ({ page }) => {
    const errors = trackPageErrors(page);
    const requests = await mockClaude(page, (route) => streamBody(route, sse(chunked(WRITE_UP))));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await expect(page.locator('#reminders-banner')).toContainText('Review August 2026');

    await openReview(page);
    await expect(page.locator('#review-note')).toBeFocused(); // the reflection box still gets focus first
    await expect(section(page)).toContainText("Claude's take");
    await expect(section(page)).toContainText('Sends your August 2026 numbers to Anthropic');
    await expect(section(page)).toContainText("plus your July 2026 reflection and Claude's July 2026 review");
    expect(requests).toHaveLength(0); // nothing is sent until you ask

    await writeButton(page).click();
    const text = section(page).locator('.review-ai-text');
    await expect(text).toContainText('A good month: you kept ₦60,500');
    await expect(text).toHaveAttribute('aria-live', 'polite');
    await expect(text.locator('li')).toHaveCount(7);
    await expect(text.locator('.review-ai-heading')).toHaveText(['What went well', 'Where the money went', 'For next month']);
    await expect(section(page)).toContainText(/Written by Claude on 15 Sept? 2026/);
    await expect(section(page)).toContainText('Not financial advice');
    await expect(section(page).getByRole('button', { name: 'Rewrite' })).toBeVisible();
    await expect(writeButton(page)).toHaveCount(0);

    // Saved on August's review, with the model that answered and a fingerprint of the numbers.
    const saved = await reviewOf(page, '2026-08');
    expect(saved).toMatchObject({ month: '2026-08', note: '', createdDate: '2026-09-15' });
    expect(saved.id).toMatch(/^rev-/);
    expect(saved.aiSummary).toEqual({
        text: WRITE_UP, model: 'claude-opus-5-5', generatedAt: '2026-09-15T09:00:00.000Z',
        basis: { income: 510000, spending: 449500, count: 10 },
    });

    // One streaming request, on the model and settings from steadyOnline.baseParams().
    expect(requests).toHaveLength(1);
    const { body, headers } = requests[0];
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(16000);
    expect(body.output_config).toEqual({ effort: 'medium' });
    expect(body.fallbacks).toBe('default');
    expect(headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('temperature');
    expect(body.system).toContain('young professional in Nigeria');
    expect(body.system).toContain('**For next month**');

    // The prompt carries the month's numbers and last month's notes, and never the key.
    const prompt = body.messages[0].content;
    expect(prompt).toContain('Month: August 2026. Complete.');
    expect(prompt).toContain('- Income: ₦510,000 (July: ₦450,000)');
    expect(prompt).toContain('- Food & Dining (need): ₦142,500 from 3 transactions; July ₦120,000 (up ₦22,500, +19%)');
    expect(prompt).toContain('- Transportation (need): ₦18,000 from 1 transaction; July ₦30,000 (down ₦12,000, -40%)');
    expect(prompt).toContain('- Entertainment (want): ₦24,000 from 1 transaction; July ₦0 (new)');
    expect(prompt).toContain('- Food & Dining: spent ₦142,500 of ₦100,000, over by ₦42,500');
    expect(prompt).toContain('- Entertainment: spent ₦24,000 of ₦30,000, under by ₦6,000');
    expect(prompt).toContain('- Monthly cap on wants: ₦40,000; under by ₦16,000');
    expect(prompt).toContain('- 2026-08-01: August rent, ₦200,000, Housing & Rent');
    expect(prompt).toContain('- 2026-08-03: Groceries at Shoprite, ₦62,500, Food & Dining');
    expect(prompt).toContain('- Logo design for Kemi (Freelance & Projects): ₦60,000 on 2026-08-12');
    expect(prompt).toContain('- Put toward goals in August: ₦50,000 (Emergency fund ₦50,000)');
    expect(prompt).toContain('- You paid Chinedu ₦50,000 in August ("Laptop loan")');
    expect(prompt).toContain('- Tunde owes you ("Money lent out"): ₦15,000 left of ₦15,000, was due 2026-09-10: overdue by 5 days');
    expect(prompt).toContain('- August 2026: ₦980,000 (July 2026: ₦900,000, so up ₦80,000)');
    expect(prompt).toContain('Too much eating out. Plan: keep Food & Dining under ₦100,000 in August.');
    expect(prompt).toContain('July: rent and eating out took most of your pay.');
    expect(prompt).not.toContain('Groceries at Spar'); // September's spending isn't August's
    expect(JSON.stringify(body)).not.toContain(KEY);

    // A month with Claude's write-up counts as reviewed: the reminder goes away.
    await closeReview(page);
    await expect(page.locator('#reminders-banner')).not.toContainText('Review August 2026');
    expect(errors).toEqual([]);
});

test('a saved write-up shows straight away, and Rewrite asks Claude again and replaces it', async ({ page }) => {
    const replies = [WRITE_UP, 'Second take: a steady month.\n\n**For next month**\n- Spend under ₦100,000 on food.'];
    const requests = await mockClaude(page, (route, n) => streamBody(route, sse(chunked(replies[n - 1]))));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    await closeReview(page);

    await openReview(page);
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    await expect(section(page)).not.toContainText('Your numbers for this month have changed');
    expect(requests).toHaveLength(1); // shown from storage, not asked for again

    await section(page).getByRole('button', { name: 'Rewrite' }).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('Second take: a steady month.');
    await expect(section(page).locator('.review-ai-text')).not.toContainText('A good month');
    expect(requests).toHaveLength(2);
    expect((await reviewOf(page, '2026-08')).aiSummary.text).toBe(replies[1]);
    expect((await storedState(page)).reviews.filter((r) => r.month === '2026-08')).toHaveLength(1);
});

test('your reflection and Claude\'s write-up live side by side on the same review', async ({ page }) => {
    await mockClaude(page, (route) => streamBody(route, claudeStream(WRITE_UP)));
    await openApp(page, REVIEW_STATE, WITH_KEY);

    // Typing a reflection, then asking Claude, then saving: both are kept.
    await openReview(page);
    await page.locator('#review-note').fill('Food was the leak.');
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    await expect(page.locator('#review-note')).toHaveValue('Food was the leak.'); // the write-up didn't wipe what you typed
    await page.getByRole('button', { name: 'Save Review' }).click();
    let saved = await reviewOf(page, '2026-08');
    expect(saved.note).toBe('Food was the leak.');
    expect(saved.aiSummary.text).toBe(WRITE_UP);

    // Saving a new reflection later doesn't touch the write-up.
    await openReview(page);
    await expect(page.locator('#review-note')).toHaveValue('Food was the leak.');
    await page.locator('#review-note').fill('Cook at home on weekdays.');
    await page.getByRole('button', { name: 'Save Review' }).click();
    saved = await reviewOf(page, '2026-08');
    expect(saved.note).toBe('Cook at home on weekdays.');
    expect(saved.aiSummary.text).toBe(WRITE_UP);
    expect((await storedState(page)).reviews.filter((r) => r.month === '2026-08')).toHaveLength(1);
});

test('writing the review after saving a reflection keeps the reflection', async ({ page }) => {
    await mockClaude(page, (route) => streamBody(route, claudeStream(WRITE_UP)));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await page.locator('#review-note').fill('Spent too much at weekends.');
    await page.getByRole('button', { name: 'Save Review' }).click();
    const before = await reviewOf(page, '2026-08');

    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    const after = await reviewOf(page, '2026-08');
    expect(after).toMatchObject({ id: before.id, note: 'Spent too much at weekends.', createdDate: before.createdDate });
    expect(after.aiSummary.text).toBe(WRITE_UP);
    expect((await storedState(page)).reviews.filter((r) => r.month === '2026-08')).toHaveLength(1);
});

test('the write-up says when the month\'s numbers have changed since it was written', async ({ page }) => {
    await mockClaude(page, (route) => streamBody(route, claudeStream(WRITE_UP)));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    await expect(section(page)).not.toContainText('Your numbers for this month have changed');
    await closeReview(page);

    // Logging something in September doesn't make August's write-up stale...
    await page.evaluate(() => { state.transactions.push({ id: 'tx-sep', title: 'Lunch', type: 'expense', amount: 3000, categoryId: 'cat-food', date: '2026-09-15', notes: '', accountId: null }); saveData(); });
    await openReview(page);
    await expect(section(page)).not.toContainText('Your numbers for this month have changed');
    await closeReview(page);

    // ...but a late August receipt does.
    await page.evaluate(() => { state.transactions.push({ id: 'tx-late', title: 'Late receipt', type: 'expense', amount: 5000, categoryId: 'cat-food', date: '2026-08-31', notes: '', accountId: null }); saveData(); });
    await openReview(page);
    await expect(section(page).locator('.review-ai-stale')).toHaveText('Your numbers for this month have changed since this was written');
    await expect(section(page).getByRole('button', { name: 'Rewrite' })).toBeVisible();
    expect(await page.evaluate(() => window.steadyReview.isStale('2026-08'))).toBe(true);
});

test('without an API key there is a way to set it up, and nothing is sent', async ({ page }) => {
    const errors = trackPageErrors(page);
    const calls = [];
    page.on('request', (r) => { if (r.url().includes('anthropic.com')) calls.push(r.url()); });
    await openApp(page, REVIEW_STATE);
    await openReview(page);
    await expect(section(page)).toContainText('Claude can write up your month');
    await expect(writeButton(page)).toHaveCount(0);
    await expect(section(page).locator('.review-ai-fine')).toHaveCount(0);

    await section(page).getByRole('button', { name: 'Set up the assistant' }).click();
    await expect(page.locator('#review-modal')).not.toHaveClass(/\bactive\b/);
    await expect(page.locator('#view-settings')).toHaveClass(/\bactive\b/);
    await expect(page.locator('#ai-key')).toBeFocused();
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
});

test('if Claude declines, a calm message shows, nothing is saved, and you can try again', async ({ page }) => {
    const requests = await mockClaude(page, (route, n) => streamBody(route, n === 1
        ? sse(['I can'], { stopReason: 'refusal' }) // stopped part-way: the partial text must not be kept
        : sse(chunked(WRITE_UP))));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-notice')).toHaveText("Claude couldn't write this review, so nothing was saved. You can try again.");
    await expect(section(page).locator('.review-ai-text')).toHaveCount(0);
    expect(await reviewOf(page, '2026-08')).toBeUndefined();

    await expect(writeButton(page)).toBeEnabled();
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    await expect(section(page).locator('.review-ai-notice')).toHaveCount(0);
    expect((await reviewOf(page, '2026-08')).aiSummary.text).toBe(WRITE_UP);
    expect(requests).toHaveLength(2);
});

for (const failure of [
    {
        name: 'a server error',
        respond: (route) => route.fulfill({ status: 500, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Internal server error' } }) }),
        message: "Couldn't write your review: Anthropic returned an error (500). Nothing was saved.",
    },
    {
        name: 'no connection',
        respond: (route) => route.abort('internetdisconnected'),
        message: "Couldn't write your review: couldn't reach Anthropic; check your connection. Nothing was saved.",
    },
]) {
    test(`after ${failure.name}, a message shows, nothing is saved, and the button works again`, async ({ page }) => {
        const errors = trackPageErrors(page);
        let broken = true;
        await mockClaude(page, (route) => (broken ? failure.respond(route) : streamBody(route, sse(chunked(WRITE_UP)))));
        await openApp(page, REVIEW_STATE, WITH_KEY);
        await openReview(page);
        await writeButton(page).click();
        await expect(section(page).locator('.review-ai-notice')).toHaveText(failure.message, { timeout: 15000 }); // after the SDK's retries
        await expect(section(page).getByRole('button', { name: 'Stop' })).toHaveCount(0); // not stuck loading
        expect(await reviewOf(page, '2026-08')).toBeUndefined();

        broken = false;
        await writeButton(page).click();
        await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
        expect((await reviewOf(page, '2026-08')).aiSummary.text).toBe(WRITE_UP);
        expect(errors).toEqual([]);
    });
}

test('a write-up cut off at the token limit is not saved', async ({ page }) => {
    await mockClaude(page, (route) => streamBody(route, sse(['A good month: you kept'], { stopReason: 'max_tokens' })));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-notice')).toContainText('cut off before the end');
    await expect(section(page).locator('.review-ai-text')).toHaveCount(0);
    await expect(writeButton(page)).toBeEnabled();
    expect(await reviewOf(page, '2026-08')).toBeUndefined();
});

test('the model that actually answered is saved when the API falls back to another model', async ({ page }) => {
    await mockClaude(page, (route) => streamBody(route, sse(chunked(WRITE_UP), { fallbackTo: 'claude-opus-4-8' })));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    const { aiSummary } = await reviewOf(page, '2026-08');
    expect(aiSummary.model).toBe('claude-opus-4-8');
    expect(aiSummary.text).toBe(WRITE_UP);
});

test('the review uses the model chosen in settings', async ({ page }) => {
    const requests = await mockClaude(page, (route) => streamBody(route, sse(chunked(WRITE_UP), { model: 'claude-sonnet-5-5' })));
    await openApp(page, REVIEW_STATE, { connections: { fxAuto: false, aiKey: KEY, aiModel: 'claude-sonnet-5-5' } });
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    expect(requests[0].body.model).toBe('claude-sonnet-5-5');
    expect((await reviewOf(page, '2026-08')).aiSummary.model).toBe('claude-sonnet-5-5');
});

test('Stop ends the write-up mid-stream, saves nothing, and you can start again', async ({ page }) => {
    const errors = trackPageErrors(page);
    const hold = holdNextRequest();
    const requests = await mockClaude(page, (route, n) => (n === 1 ? hold.handler(route) : streamBody(route, sse(chunked(WRITE_UP)))));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();

    // While Claude works: a placeholder in a polite live region, a disabled button and Stop.
    const text = section(page).locator('.review-ai-text');
    await expect(text).toHaveText('Claude is reading your August 2026 numbers…');
    await expect(text).toHaveAttribute('aria-busy', 'true');
    await expect(text).toHaveAttribute('aria-live', 'polite');
    await expect(writeButton(page)).toBeDisabled();
    await expect.poll(() => requests.length).toBe(1);

    const aborted = page.waitForEvent('requestfailed', (r) => r.url().includes('api.anthropic.com'));
    await section(page).getByRole('button', { name: 'Stop' }).click();
    await aborted; // the request really was cancelled
    await expect(section(page).locator('.review-ai-notice')).toHaveText('Stopped before Claude finished, so nothing was saved.');
    await expect(section(page).getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await hold.answer(sse(chunked(WRITE_UP))); // too late: ignored
    expect(await reviewOf(page, '2026-08')).toBeUndefined();

    await expect(writeButton(page)).toBeEnabled();
    await writeButton(page).click();
    await expect(text).toContainText('A good month');
    expect((await reviewOf(page, '2026-08')).aiSummary.text).toBe(WRITE_UP);
    expect(errors).toEqual([]);
});

test('stopping a rewrite keeps the earlier write-up', async ({ page }) => {
    const hold = holdNextRequest();
    await mockClaude(page, (route, n) => (n === 2 ? hold.handler(route) : streamBody(route, sse(chunked(WRITE_UP)))));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');

    await section(page).getByRole('button', { name: 'Rewrite' }).click();
    await expect(section(page).locator('.review-ai-text')).toHaveText('Claude is reading your August 2026 numbers…');
    await section(page).getByRole('button', { name: 'Stop' }).click();
    await expect(section(page).locator('.review-ai-notice')).toHaveText('Stopped. Your earlier write-up is still saved.');
    await expect(section(page).locator('.review-ai-text')).toContainText('A good month');
    await hold.answer(sse(['Something else entirely.']));
    expect((await reviewOf(page, '2026-08')).aiSummary.text).toBe(WRITE_UP);
});

test('closing the review mid-stream stops it; reopening starts clean and nothing is saved', async ({ page }) => {
    const errors = trackPageErrors(page);
    const hold = holdNextRequest();
    await mockClaude(page, (route) => hold.handler(route));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect.poll(() => hold.route !== null).toBe(true);

    const aborted = page.waitForEvent('requestfailed', (r) => r.url().includes('api.anthropic.com'));
    await page.keyboard.press('Escape');
    await expect(page.locator('#review-modal')).not.toHaveClass(/\bactive\b/);
    await aborted;

    await openReview(page);
    await expect(writeButton(page)).toBeEnabled();
    await expect(section(page).getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(section(page).locator('.review-ai-text, .review-ai-notice')).toHaveCount(0);
    await hold.answer(sse(chunked(WRITE_UP))); // the old stream's reply never lands
    await page.waitForTimeout(200);
    await expect(section(page).locator('.review-ai-text')).toHaveCount(0);
    expect(await reviewOf(page, '2026-08')).toBeUndefined();
    expect(errors).toEqual([]);
});

test('switching to another month mid-stream drops the old write-up and the new month works', async ({ page }) => {
    const hold = holdNextRequest();
    const julyText = 'July: a tight month.\n\n**For next month**\n- Keep food under ₦100,000.';
    const requests = await mockClaude(page, (route, n) => (n === 1 ? hold.handler(route) : streamBody(route, sse(chunked(julyText)))));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect.poll(() => hold.route !== null).toBe(true);

    // Something opens July's review while August's write-up is still coming in.
    await page.evaluate(() => openReviewModal('2026-07'));
    await expect(page.locator('#review-modal-title')).toHaveText('Review — July 2026');
    await expect(section(page).locator('.review-ai-text')).toContainText('July: rent and eating out'); // July's saved one
    await expect(section(page).getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await hold.answer(sse(chunked(WRITE_UP)));
    await page.waitForTimeout(200);
    await expect(section(page).locator('.review-ai-text')).not.toContainText('A good month');
    expect(await reviewOf(page, '2026-08')).toBeUndefined();

    // July's own rewrite goes to July, and keeps July's reflection.
    await section(page).getByRole('button', { name: 'Rewrite' }).click();
    await expect(section(page).locator('.review-ai-text')).toContainText('July: a tight month.');
    const july = await reviewOf(page, '2026-07');
    expect(july.note).toBe(REVIEW_STATE.reviews[0].note);
    expect(july.aiSummary.text).toBe(julyText);
    expect(requests[1].body.messages[0].content).toContain('Write my review of July 2026.');
    expect(await reviewOf(page, '2026-08')).toBeUndefined();
});

test('the prompt handles the month in progress and months with little data', async ({ page }) => {
    await openApp(page, REVIEW_STATE, WITH_KEY);
    const prompts = await page.evaluate(() => ({
        september: window.steadyReview.buildReviewPrompt('2026-09'),
        may: window.steadyReview.buildReviewPrompt('2026-05'),
        basis: window.steadyReview.reviewBasis('2026-08'),
    }));
    expect(prompts.basis).toEqual({ income: 510000, spending: 449500, count: 10 });
    expect(prompts.september).toContain('Month: September 2026. Still in progress: day 15 of 30.');
    expect(prompts.september).toContain('- Spending: ₦20,000 (August: ₦449,500)');
    expect(prompts.september).not.toContain('<last_month>'); // no August review saved yet
    expect(prompts.may).toContain('- Transactions logged: 0 (0 expenses, 0 income) on 0 days. Nothing was logged in April 2026.');
    expect(prompts.may).toContain('- No spending logged.');
    expect(prompts.may).toContain('- None logged.');
});

test.describe('phone layout', () => {
    test.skip(({ isMobile }) => !isMobile, 'phone-width checks');

    const LONG = [
        'A long month with plenty going on: you earned ₦510,000 and spent ₦449,500, keeping ₦60,500.',
        '',
        '**What went well**',
        ...Array.from({ length: 4 }, (_, i) => `- Point ${i + 1}: the freelance logo for Kemi added ₦60,000, and your emergency-fund-contribution-of-the-month (₦50,000) went in on time again.`),
        '',
        '**Where the money went**',
        '- Food_and_Dining_at_Yellow_Chilli_and_Chicken_Republic_on_weekends_added_up_to_₦80,000_alone.',
        ...Array.from({ length: 4 }, (_, i) => `- Leak ${i + 1}: small Bolt rides and weekend treats added up to ₦18,000, more than you planned for the month.`),
        '',
        '**For next month**',
        ...Array.from({ length: 3 }, (_, i) => `- Action ${i + 1}: cap Food & Dining at ₦100,000 (you spent ₦142,500) and check it every Sunday evening.`),
    ].join('\n');

    for (const width of [360, 412]) {
        test(`a long write-up fits a ${width}px screen and the review still scrolls`, async ({ page }) => {
            await page.setViewportSize({ width, height: 740 });
            await mockClaude(page, (route) => streamBody(route, sse(chunked(LONG))));
            await openApp(page, REVIEW_STATE, WITH_KEY);
            await openReview(page);
            await writeButton(page).click();
            await expect(section(page).locator('.review-ai-text li')).toHaveCount(12);

            const layout = await page.evaluate(() => {
                const limit = document.documentElement.clientWidth + 1;
                const content = document.querySelector('#review-modal .modal-content');
                const spill = [...content.querySelectorAll('*')]
                    .filter((el) => el.getBoundingClientRect().right > limit)
                    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
                const box = content.getBoundingClientRect();
                return {
                    spill,
                    pageFits: document.documentElement.scrollWidth <= window.innerWidth,
                    noSideScroll: content.scrollWidth <= content.clientWidth,
                    top: box.top, bottom: box.bottom, height: window.innerHeight,
                    scrolls: content.scrollHeight > content.clientHeight,
                };
            });
            expect(layout.spill).toEqual([]);
            expect(layout.pageFits).toBe(true);
            expect(layout.noSideScroll).toBe(true);
            // Taller than the screen, so the sheet scrolls instead of pushing its top off-screen.
            expect(layout.scrolls).toBe(true);
            expect(layout.top).toBeGreaterThanOrEqual(0);
            expect(layout.bottom).toBeLessThanOrEqual(layout.height + 1);
            await page.getByRole('button', { name: 'Save Review' }).click(); // reachable at the bottom
            await expect(page.locator('#review-modal')).not.toHaveClass(/\bactive\b/);
        });
    }
});

test('on a wide screen the long review stays inside the window', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop check');
    const long = Array.from({ length: 30 }, (_, i) => `- Point ${i + 1}: Food & Dining reached ₦142,500.`).join('\n');
    await mockClaude(page, (route) => streamBody(route, sse(chunked(`A busy month.\n\n**What went well**\n${long}`))));
    await openApp(page, REVIEW_STATE, WITH_KEY);
    await openReview(page);
    await writeButton(page).click();
    await expect(section(page).locator('.review-ai-text li')).toHaveCount(30);
    const box = await page.locator('#review-modal .modal-content').boundingBox();
    const viewport = page.viewportSize();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.locator('#review-modal-title')).toBeInViewport();
    await page.getByRole('button', { name: 'Save Review' }).click();
    await expect(page.locator('#review-modal')).not.toHaveClass(/\bactive\b/);
});
