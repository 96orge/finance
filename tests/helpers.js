import { expect } from './fixtures.js';

// Month-based totals depend on "today", so every test runs on the same fixed date.
export const FIXED_NOW = new Date('2026-09-15T10:00:00+01:00');

const STORAGE_KEY = '96orge_budget_state';

/**
 * Open the app with `state` pre-loaded into localStorage.
 * Pass `null` to leave storage empty — a first-time visitor, who gets the built-in sample data.
 */
export async function openApp(page, state) {
    await page.clock.setFixedTime(FIXED_NOW);
    if (state) {
        await page.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, state]);
    }
    await page.goto('/');
    await expect(page.locator('#page-title')).toHaveText('Dashboard');
}

/** Navigate the way a user would: the sidebar on desktop, the side drawer (or bottom bar) on phones. */
export async function goToTab(page, tab) {
    const onPhone = page.viewportSize().width <= 768;
    if (!onPhone) {
        await page.locator(`aside.sidebar [data-tab="${tab}"]`).click();
    } else if (tab === 'more') {
        await page.locator(`.mobile-bottom-nav [data-tab="more"]`).click();
    } else {
        await page.locator('#mobile-menu-btn').click();
        await page.locator(`#mobile-side-drawer [data-tab="${tab}"]`).click();
    }
    await expect(page.locator(`#view-${tab}`)).toHaveClass(/\bactive\b/);
}

/** Collect uncaught script errors so a test can assert there were none. */
export function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    return errors;
}

// What storage looks like right after Data & Backup → "Clear All Data".
export const EMPTY_STATE = { transactions: [], settings: {} };

// A realistic, busy account with long names — the kind of data that exposes layout bugs.
export const RICH_STATE = {
    transactions: [
        { id: 'tx-salary', title: 'CMD Salary', type: 'income', amount: 450000, categoryId: 'cat-salary', date: '2026-09-02', notes: '', accountId: 'acc-gtb' },
        { id: 'tx-uber', title: 'Uber ride to the airport terminal on a rainy evening', type: 'expense', amount: 15500, categoryId: 'cat-transport', date: '2026-09-12', notes: 'Late night surge pricing on the way to the airport for the Lagos trip', accountId: 'acc-gtb' },
        { id: 'tx-shoprite', title: 'Groceries at Shoprite', type: 'expense', amount: 23400, categoryId: 'cat-food', date: '2026-09-10', notes: '', accountId: 'acc-palm' },
        { id: 'tx-netflix', title: 'Netflix', type: 'expense', amount: 4400, categoryId: 'cat-entertainment', date: '2026-09-05', notes: '', accountId: 'acc-gtb' },
        { id: 'tx-netflix-aug', title: 'Netflix', type: 'expense', amount: 4400, categoryId: 'cat-entertainment', date: '2026-08-05', notes: '', accountId: 'acc-gtb' },
    ],
    accounts: [
        { id: 'acc-gtb', name: 'GTBank Savings Account (Primary)', type: 'bank', openingBalance: 120000, currency: 'NGN', notes: '', archived: false },
        { id: 'acc-palm', name: 'Palmpay Wallet', type: 'mobile', openingBalance: 30000, currency: 'NGN', notes: '', archived: false },
    ],
    transfers: [
        { id: 'xfer-1', fromAccountId: 'acc-gtb', toAccountId: 'acc-palm', amount: 20000, date: '2026-09-11', notes: 'Topping up the wallet for weekend spending' },
    ],
    quickAdds: [
        { id: 'qa-1', label: 'Transport', type: 'expense', amount: 1500, categoryId: 'cat-transport', icon: '', accountId: null },
        { id: 'qa-2', label: 'Airtime / Data', type: 'expense', amount: 2000, categoryId: 'cat-utilities', icon: '', accountId: null },
        { id: 'qa-3', label: 'Lunch at the office canteen', type: 'expense', amount: 2500, categoryId: 'cat-food', icon: '', accountId: null },
    ],
    incomeSources: [
        { id: 'src-1', name: 'CMD Salary', categoryId: 'cat-salary', amount: 450000, cadence: 'monthly', startDate: '2026-01-28', endDate: '', lastLoggedDate: null, active: true, accountId: 'acc-gtb', notes: '' },
    ],
    recurringExpenses: [
        { id: 'rx-1', name: 'LinkedIn Premium Career Subscription', categoryId: 'cat-career', amount: 16500, cadence: 'monthly', startDate: '2026-01-09', endDate: '', lastLoggedDate: null, active: true, accountId: 'acc-gtb', notes: '' },
    ],
    debts: [
        { id: 'debt-1', name: 'Loan from a friend for the new laptop', counterparty: 'Chinedu Okafor', kind: 'iOwe', originalAmount: 250000, createdDate: '2026-06-01', dueDate: '2026-12-01', notes: '', status: 'active', payments: [{ id: 'p-1', amount: 50000, date: '2026-08-02', note: '', txId: null }] },
        { id: 'debt-2', name: 'Money lent out', counterparty: 'Tunde', kind: 'owedToMe', originalAmount: 15000, createdDate: '2026-08-02', dueDate: '2026-09-10', notes: '', status: 'active', payments: [] },
        { id: 'debt-3', name: 'Old phone repayment', counterparty: 'Ada', kind: 'iOwe', originalAmount: 40000, createdDate: '2026-02-02', dueDate: '', notes: '', status: 'settled', payments: [{ id: 'p-2', amount: 40000, date: '2026-05-02', note: '', txId: null }] },
    ],
    goals: [
        { id: 'goal-1', name: 'AWS Solutions Architect Certification', targetAmount: 150000, targetDate: '2026-12-31', savedAmount: 60000, icon: 'fa-solid fa-graduation-cap', color: '#7c8bff', status: 'active', contributions: [] },
        { id: 'goal-2', name: 'Emergency fund', targetAmount: 100000, targetDate: '', savedAmount: 100000, icon: 'fa-solid fa-umbrella', color: '#10b981', status: 'reached', contributions: [] },
    ],
    investments: {
        holdings: [
            { id: 'h-mtn', currency: 'NGN', name: 'MTN Nigeria Communications Plc', ticker: 'MTNN', account: 'Stanbic IBTC Stockbrokers', units: 1000, avgCost: 210, currentPrice: 245, notes: '' },
            { id: 'h-aapl', currency: 'USD', name: 'Apple Inc.', ticker: 'AAPL', account: 'Bamboo', units: 3, avgCost: 190, currentPrice: 228.5, notes: '' },
        ],
        activity: [],
    },
    budgets: { 'cat-food': 60000, 'cat-entertainment': 10000 },
    settings: { theme: 'dark', usdRate: 1550, activityDays: ['2026-09-13', '2026-09-14', '2026-09-15'] },
};
