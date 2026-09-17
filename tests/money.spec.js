import { test, expect } from '@playwright/test';
import { openApp, goToTab } from './helpers.js';

// The maths doesn't depend on screen size, so these run once (desktop).
test.skip(({ isMobile }) => isMobile, 'screen-size independent');

const account = (id, name, openingBalance) =>
    ({ id, name, type: 'bank', openingBalance, currency: 'NGN', notes: '', archived: false });
const transaction = (id, type, amount, categoryId, accountId) =>
    ({ id, title: id, type, amount, categoryId, date: '2026-09-10', notes: '', accountId });
const holding = (id, currency, units, price) =>
    ({ id, currency, name: id, ticker: '', account: '', units, avgCost: price, currentPrice: price, notes: '' });

test('net worth = cash + investments + savings + money owed to you − debts', async ({ page }) => {
    await openApp(page, {
        accounts: [account('main', 'Main', 10000)],
        transactions: [transaction('pay', 'income', 5000, 'cat-salary', 'main')],
        investments: { holdings: [holding('stock', 'NGN', 10, 500)], activity: [] },
        goals: [{ id: 'g', name: 'Fund', targetAmount: 50000, targetDate: '', savedAmount: 7000, icon: '', color: '#10b981', status: 'active', contributions: [] }],
        debts: [
            { id: 'lent', name: 'Lent', counterparty: 'A', kind: 'owedToMe', originalAmount: 3000, createdDate: '2026-09-02', dueDate: '', notes: '', status: 'active', payments: [] },
            { id: 'owe', name: 'Owe', counterparty: 'B', kind: 'iOwe', originalAmount: 6000, createdDate: '2026-09-02', dueDate: '', notes: '', status: 'active',
              payments: [{ id: 'p', amount: 2000, date: '2026-09-05', note: '', txId: null }] },
        ],
    });

    const breakdown = await page.evaluate(() => netWorthBreakdown());
    expect(breakdown).toMatchObject({ cash: 15000, invest: 5000, savings: 7000, owedToMe: 3000, iOwe: 4000, total: 26000 });
    await expect(page.locator('#stat-total-balance')).toHaveText('₦26,000.00');
});

test('moving money between accounts changes both balances, but not income, spending or net worth', async ({ page }) => {
    await openApp(page, {
        accounts: [account('gtb', 'GTBank', 50000), account('palm', 'Palmpay', 0)],
        transactions: [
            transaction('pay', 'income', 100000, 'cat-salary', 'gtb'),
            transaction('food', 'expense', 20000, 'cat-food', 'gtb'),
        ],
    });
    const before = await page.evaluate(() => ({ month: monthTotals(), netWorth: netWorth() }));

    await goToTab(page, 'networth');
    await page.locator('#btn-transfer-funds').click();
    await page.locator('#transfer-from').selectOption('gtb');
    await page.locator('#transfer-to').selectOption('palm');
    await page.locator('#transfer-amount').fill('30000');
    await page.locator('#transfer-form button[type="submit"]').click();
    await expect(page.locator('#transfers-history')).toContainText('GTBank');

    const after = await page.evaluate(() => ({
        month: monthTotals(),
        netWorth: netWorth(),
        balances: Object.fromEntries(state.accounts.map((a) => [a.id, accountBalance(a)])),
    }));
    expect(after.balances).toEqual({ gtb: 50000 + 100000 - 20000 - 30000, palm: 30000 });
    expect(after.month).toEqual(before.month);
    expect(after.netWorth).toBe(before.netWorth);
});

test('USD holdings are converted at your ₦/$ rate and counted in net worth', async ({ page }) => {
    await openApp(page, {
        investments: { holdings: [holding('ngx', 'NGN', 100, 50), holding('us', 'USD', 10, 20)], activity: [] },
        settings: { usdRate: 1500 },
    });

    const totals = await page.evaluate(() => portfolioTotals());
    expect(totals.byCcy.NGN.value).toBe(5000);
    expect(totals.byCcy.USD.value).toBe(200);
    expect(totals.valueN).toBe(5000 + 200 * 1500);
    expect(totals.missingRate).toBe(false);
    expect(await page.evaluate(() => netWorthBreakdown().invest)).toBe(305000);
});

test('without a ₦/$ rate, USD holdings are left out and the gap is flagged', async ({ page }) => {
    await openApp(page, {
        investments: { holdings: [holding('ngx', 'NGN', 100, 50), holding('us', 'USD', 10, 20)], activity: [] },
    });

    const totals = await page.evaluate(() => portfolioTotals());
    expect(totals.valueN).toBe(5000);
    expect(totals.missingRate).toBe(true);
    await goToTab(page, 'networth');
    await expect(page.locator('#networth-breakdown')).toContainText('excludes USD holdings');
});

test('buying USD stock with no ₦/$ rate records the trade but never a dollar amount as naira', async ({ page }) => {
    await openApp(page, { investments: { holdings: [holding('us', 'USD', 10, 20)], activity: [] } });

    await goToTab(page, 'investments');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    await page.locator('#activity-units').fill('5');
    await page.locator('#activity-price').fill('20');
    await page.locator('#activity-log-tx').check();
    await page.locator('#activity-form button[type="submit"]').click();

    const result = await page.evaluate(() => ({
        units: state.investments.holdings[0].units,
        transactions: state.transactions.length,
    }));
    expect(result).toEqual({ units: 15, transactions: 0 });
});
