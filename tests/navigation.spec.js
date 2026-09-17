import { test, expect } from '@playwright/test';
import { openApp, goToTab, trackPageErrors, trackExternalRequests, RICH_STATE, EMPTY_STATE } from './helpers.js';

const SECTIONS = {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    income: 'Income & Recurring',
    debts: 'Debts & Lending',
    goals: 'Goals',
    investments: 'Investments',
    networth: 'Net Worth',
    categories: 'Categories & Budgets',
    learn: 'Learn',
    settings: 'Data Management',
};

const STARTING_POINTS = [
    ['with a busy account', RICH_STATE],
    ['on first visit (sample data)', null],
    ['after "Clear All Data"', EMPTY_STATE],
];

for (const [label, state] of STARTING_POINTS) {
    test(`every section opens without script errors or outside requests ${label}`, async ({ page, baseURL }) => {
        test.slow(); // tours all ten sections through the real menus
        const errors = trackPageErrors(page);
        const external = trackExternalRequests(page, baseURL);
        await openApp(page, state);
        for (const [tab, title] of Object.entries(SECTIONS)) {
            await goToTab(page, tab);
            await expect(page.locator('#page-title')).toHaveText(title);
        }
        expect(errors).toEqual([]);
        expect(external, 'requests to other servers').toEqual([]);
    });
}

test('each section offers its "add" button even when empty', async ({ page }) => {
    await openApp(page, EMPTY_STATE);
    const addButtons = {
        income: ['#btn-add-income-source', '#btn-add-recurring-expense', '#btn-add-quick-add'],
        debts: ['#btn-add-debt'],
        goals: ['#btn-add-goal'],
        investments: ['#btn-add-holding'],
        networth: ['#btn-add-account', '#btn-transfer-funds'],
    };
    for (const [tab, buttons] of Object.entries(addButtons)) {
        await goToTab(page, tab);
        for (const selector of buttons) await expect(page.locator(selector)).toBeVisible();
    }
});

test('the month filter only appears on the dashboard', async ({ page }) => {
    await openApp(page, RICH_STATE);
    const filter = page.locator('#dashboard-month-filter-container');
    await expect(filter).toBeVisible();
    await goToTab(page, 'transactions');
    await expect(filter).toBeHidden();
    await goToTab(page, 'dashboard');
    await expect(filter).toBeVisible();
});

test('settled debts and reached goals start collapsed', async ({ page }) => {
    await openApp(page, RICH_STATE);

    // Only the direct <details> children are the collapsible groups — each card also has its own
    // <details> for payment/contribution history.
    await goToTab(page, 'debts');
    const settled = page.locator('#debts-list > details');
    await expect(settled.locator(':scope > summary')).toContainText('Settled');
    await expect(settled.locator('.debt-card')).toBeHidden();
    await settled.locator(':scope > summary').click();
    await expect(settled.locator('.debt-card')).toBeVisible();

    await goToTab(page, 'goals');
    const reached = page.locator('#goals-list > details');
    await expect(reached.locator(':scope > summary')).toContainText('Reached');
    await expect(reached.locator('.goal-card')).toBeHidden();
});
