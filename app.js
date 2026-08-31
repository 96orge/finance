// --- Application State ---
let state = {
    transactions: [],
    categories: [],
    budgets: {},        // Maps categoryId to monthly limit amount
    incomeSources: [],  // Recurring income (salary, NYSC allowance, ...)
    quickAdds: [],      // One-tap transaction templates (transport, data, ...)
    debts: [],          // Money owed / owed to you, paid down incrementally
    goals: [],          // Savings goals / sinking funds
    investments: { holdings: [], activity: [] }, // Stock/investment portfolio
    settings: {}        // App-wide preferences (wantsMonthlyCap, usdRate, ...)
};

const DEFAULT_SETTINGS = {
    wantsMonthlyCap: null, // ₦ ceiling for 'want' spending each month; null = off
    usdRate: null,         // ₦ per US$1 for valuing USD holdings; null = not set
    activityDays: []       // ISO date strings the user logged something on (streak)
};

// Chart.js global instances
let categoryChartInstance = null;
let trendChartInstance = null;

// --- Default Base Categories ---
// `priority` marks a category as an essential 'need' or a discretionary 'want'
// (ignored for income categories).
const DEFAULT_CATEGORIES = [
    // Expense Categories
    { id: 'cat-housing', name: 'Housing & Rent', type: 'expense', color: '#3b82f6', icon: 'fa-solid fa-house', priority: 'need' },
    { id: 'cat-food', name: 'Food & Dining', type: 'expense', color: '#f59e0b', icon: 'fa-solid fa-utensils', priority: 'need' },
    { id: 'cat-transport', name: 'Transportation', type: 'expense', color: '#8b5cf6', icon: 'fa-solid fa-car', priority: 'need' },
    { id: 'cat-entertainment', name: 'Entertainment', type: 'expense', color: '#f43f5e', icon: 'fa-solid fa-gamepad', priority: 'want' },
    { id: 'cat-utilities', name: 'Utilities', type: 'expense', color: '#06b6d4', icon: 'fa-solid fa-bolt', priority: 'need' },
    { id: 'cat-healthcare', name: 'Healthcare', type: 'expense', color: '#10b981', icon: 'fa-solid fa-heart-pulse', priority: 'need' },
    { id: 'cat-career', name: 'Career & Certifications', type: 'expense', color: '#0ea5e9', icon: 'fa-solid fa-graduation-cap', priority: 'need' },
    { id: 'cat-debt', name: 'Debt Repayment', type: 'expense', color: '#ef4444', icon: 'fa-solid fa-hand-holding-dollar', priority: 'need' },
    { id: 'cat-savings', name: 'Savings', type: 'expense', color: '#8b5cf6', icon: 'fa-solid fa-piggy-bank', priority: 'need' },
    { id: 'cat-invest', name: 'Investing', type: 'expense', color: '#6366f1', icon: 'fa-solid fa-arrow-trend-up', priority: 'need' },
    { id: 'cat-misc', name: 'Miscellaneous', type: 'expense', color: '#64748b', icon: 'fa-solid fa-circle-nodes', priority: 'want' },
    // Income Categories
    { id: 'cat-salary', name: 'Salary', type: 'income', color: '#10b981', icon: 'fa-solid fa-briefcase', priority: 'need' },
    { id: 'cat-allowance', name: 'Allowance / Stipend', type: 'income', color: '#22c55e', icon: 'fa-solid fa-hand-holding-dollar', priority: 'need' },
    { id: 'cat-freelance', name: 'Freelance & Projects', type: 'income', color: '#14b8a6', icon: 'fa-solid fa-laptop-code', priority: 'need' },
    { id: 'cat-investments', name: 'Investments', type: 'income', color: '#6366f1', icon: 'fa-solid fa-piggy-bank', priority: 'need' },
    { id: 'cat-gift', name: 'Gifts & Others', type: 'income', color: '#ec4899', icon: 'fa-solid fa-gift', priority: 'need' }
];

// Categories that a returning user's saved data probably lacks but the app now
// relies on. Keyed by id so migrateState can add any that are missing.
const CATEGORIES_BY_ID = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c]));

// Best-guess need/want split for pre-existing custom categories, by keyword.
const WANT_KEYWORDS = ['entertainment', 'junk', 'snack', 'fun', 'game', 'gaming', 'shopping', 'subscription', 'streaming', 'eating out', 'takeout', 'fast food', 'leisure', 'hobby', 'party', 'alcohol', 'misc'];

// --- Initialization & Local Storage ---
function loadData() {
    try {
        const saved = localStorage.getItem('96orge_budget_state');
        if (saved) {
            state = JSON.parse(saved);
        } else {
            state.categories = [...DEFAULT_CATEGORIES];
            loadSampleData();
        }
    } catch (e) {
        console.error("Error loading data from local storage, resetting defaults:", e);
        state = { transactions: [], categories: [...DEFAULT_CATEGORIES], budgets: {} };
    }
    migrateState();
}

// Bring a loaded (possibly older-shape) state up to the current schema so new
// features have the arrays/fields they expect. Safe to run repeatedly.
function migrateState() {
    if (!Array.isArray(state.transactions)) state.transactions = [];
    if (!Array.isArray(state.categories) || state.categories.length === 0) state.categories = [...DEFAULT_CATEGORIES];
    if (!state.budgets || typeof state.budgets !== 'object') state.budgets = {};
    if (!Array.isArray(state.incomeSources)) state.incomeSources = [];
    if (!Array.isArray(state.quickAdds)) state.quickAdds = [];
    if (!Array.isArray(state.debts)) state.debts = [];
    if (!Array.isArray(state.goals)) state.goals = [];
    if (!state.investments || typeof state.investments !== 'object') state.investments = { holdings: [], activity: [] };
    if (!Array.isArray(state.investments.holdings)) state.investments.holdings = [];
    if (!Array.isArray(state.investments.activity)) state.investments.activity = [];
    state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings || {});
    if (!Array.isArray(state.settings.activityDays)) state.settings.activityDays = [];

    // Backfill category.priority (need vs want) for pre-existing data.
    state.categories.forEach(cat => {
        if (cat.priority === 'need' || cat.priority === 'want') return;
        if (cat.type === 'income') { cat.priority = 'need'; return; }
        const known = CATEGORIES_BY_ID[cat.id];
        if (known) { cat.priority = known.priority; return; }
        const haystack = (cat.name || '').toLowerCase();
        cat.priority = WANT_KEYWORDS.some(k => haystack.includes(k)) ? 'want' : 'need';
    });

    // Ensure categories the app now depends on exist.
    ['cat-debt', 'cat-career', 'cat-allowance', 'cat-savings', 'cat-invest'].forEach(id => {
        if (!state.categories.some(c => c.id === id)) {
            state.categories.push({ ...CATEGORIES_BY_ID[id] });
        }
    });

    // Normalise debt records.
    state.debts.forEach(d => {
        if (!Array.isArray(d.payments)) d.payments = [];
        if (!d.status) d.status = 'active';
        if (!d.kind) d.kind = 'iOwe';
    });

    // Normalise goal records.
    state.goals.forEach(g => {
        if (!Array.isArray(g.contributions)) g.contributions = [];
        if (typeof g.savedAmount !== 'number') {
            g.savedAmount = g.contributions.reduce((s, c) => s + (c.amount || 0), 0);
        }
        if (!g.status) g.status = g.savedAmount >= g.targetAmount ? 'reached' : 'active';
    });

    // Normalise investment holdings.
    state.investments.holdings.forEach(h => {
        if (!h.currency) h.currency = 'NGN';
        if (typeof h.units !== 'number') h.units = 0;
        if (typeof h.avgCost !== 'number') h.avgCost = 0;
        if (typeof h.currentPrice !== 'number') h.currentPrice = h.avgCost;
    });
}

// Record that the user logged something today (drives the dashboard streak).
function touchStreak() {
    const today = todayISO();
    const days = state.settings.activityDays;
    if (!days.includes(today)) days.push(today);
    // keep the list bounded
    if (days.length > 90) state.settings.activityDays = days.slice(-90);
}

function saveData() {
    localStorage.setItem('96orge_budget_state', JSON.stringify(state));
}

// Stable-ish unique id used across every record type.
function makeId(prefix) {
    return `${prefix}-${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

// Populate sample data for visually premium demo (using Naira ₦ values)
function loadSampleData() {
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

    const getDateOffset = (daysAgo) => {
        const d = new Date(curYear, curMonth, today.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    };

    // Budgets
    state.budgets = {
        'cat-food': 120000,
        'cat-entertainment': 60000,
        'cat-transport': 45000,
        'cat-housing': 350000
    };

    // Transactions
    state.transactions = [
        // Current Month Incomes
        { id: 'tx-s1', title: 'Monthly Salary Paycheck', type: 'income', amount: 850000, categoryId: 'cat-salary', date: getDateOffset(1), notes: 'Principal job salary transfer' },
        { id: 'tx-s2', title: 'Freelance Design Consultation', type: 'income', amount: 150000, categoryId: 'cat-freelance', date: getDateOffset(4), notes: 'Landing page branding work' },
        { id: 'tx-s3', title: 'Investment Dividends', type: 'income', amount: 25000, categoryId: 'cat-investments', date: getDateOffset(15), notes: 'Local portfolio dividends' },
        // Current Month Expenses
        { id: 'tx-e1', title: 'Monthly Rent Payment', type: 'expense', amount: 300000, categoryId: 'cat-housing', date: getDateOffset(5), notes: 'Apartment rent transfer' },
        { id: 'tx-e2', title: 'Groceries (Spar)', type: 'expense', amount: 48500, categoryId: 'cat-food', date: getDateOffset(2), notes: 'Bi-weekly food supplies' },
        { id: 'tx-e3', title: 'Fuel Topup', type: 'expense', amount: 18000, categoryId: 'cat-transport', date: getDateOffset(3), notes: 'Car fueling' },
        { id: 'tx-e4', title: 'DSTV Subscription', type: 'expense', amount: 24500, categoryId: 'cat-entertainment', date: getDateOffset(6), notes: 'Premium package renewal' },
        { id: 'tx-e5', title: 'Electric Tariff Token', type: 'expense', amount: 20000, categoryId: 'cat-utilities', date: getDateOffset(10), notes: 'Prepaid meter recharge' },
        { id: 'tx-e6', title: 'Restaurant Outing', type: 'expense', amount: 32000, categoryId: 'cat-food', date: getDateOffset(7), notes: 'Dinner with family' },
        { id: 'tx-e7', title: 'Prescription Drugs', type: 'expense', amount: 12500, categoryId: 'cat-healthcare', date: getDateOffset(14), notes: 'Pharmacy receipt' },
        { id: 'tx-e8', title: 'Ride Hailing Trip', type: 'expense', amount: 6500, categoryId: 'cat-transport', date: getDateOffset(8), notes: 'Trip to office' },
        { id: 'tx-e9', title: 'Cinema Tickets & Snacks', type: 'expense', amount: 14000, categoryId: 'cat-entertainment', date: getDateOffset(12), notes: 'Weekend movie outing' },

        // Previous Month Incomes
        { id: 'tx-p-s1', title: 'Monthly Salary Paycheck', type: 'income', amount: 850000, categoryId: 'cat-salary', date: new Date(curYear, curMonth - 1, 1).toISOString().split('T')[0], notes: 'Salary transfer' },
        { id: 'tx-p-s2', title: 'Web App Feature Project', type: 'income', amount: 220000, categoryId: 'cat-freelance', date: new Date(curYear, curMonth - 1, 10).toISOString().split('T')[0], notes: '' },
        // Previous Month Expenses
        { id: 'tx-p-e1', title: 'Monthly Rent Payment', type: 'expense', amount: 300000, categoryId: 'cat-housing', date: new Date(curYear, curMonth - 1, 5).toISOString().split('T')[0], notes: '' },
        { id: 'tx-p-e2', title: 'Supermarket Outing', type: 'expense', amount: 55000, categoryId: 'cat-food', date: new Date(curYear, curMonth - 1, 7).toISOString().split('T')[0], notes: '' },
        { id: 'tx-p-e3', title: 'Concert Ticket', type: 'expense', amount: 30000, categoryId: 'cat-entertainment', date: new Date(curYear, curMonth - 1, 18).toISOString().split('T')[0], notes: '' },
        { id: 'tx-p-e4', title: 'Utility Token Recharge', type: 'expense', amount: 25000, categoryId: 'cat-utilities', date: new Date(curYear, curMonth - 1, 15).toISOString().split('T')[0], notes: '' }
    ];

    // Recurring income sources
    state.incomeSources = [
        {
            id: 'src-salary', name: 'Monthly Salary', categoryId: 'cat-salary',
            amount: 850000, cadence: 'monthly',
            startDate: new Date(curYear, curMonth - 2, 1).toISOString().split('T')[0],
            endDate: null, lastLoggedDate: getDateOffset(1), active: true, notes: 'Principal job'
        },
        {
            id: 'src-nysc', name: 'NYSC Allowance', categoryId: 'cat-allowance',
            amount: 33000, cadence: 'monthly',
            startDate: new Date(curYear, curMonth, 1).toISOString().split('T')[0],
            endDate: new Date(curYear + 1, curMonth, 0).toISOString().split('T')[0],
            lastLoggedDate: null, active: true, notes: 'Service year stipend'
        }
    ];

    // One-tap transaction templates
    state.quickAdds = [
        { id: 'qa-transport', label: 'Transport', type: 'expense', categoryId: 'cat-transport', amount: 1500, icon: 'fa-solid fa-bus' },
        { id: 'qa-data', label: 'Airtime / Data', type: 'expense', categoryId: 'cat-utilities', amount: 2000, icon: 'fa-solid fa-wifi' },
        { id: 'qa-lunch', label: 'Lunch', type: 'expense', categoryId: 'cat-food', amount: 2500, icon: 'fa-solid fa-bowl-food' }
    ];

    // Debts
    state.debts = [
        {
            id: 'debt-friend', name: 'Loan from a friend', counterparty: 'Chidi', kind: 'iOwe',
            originalAmount: 60000, createdDate: new Date(curYear, curMonth - 1, 2).toISOString().split('T')[0],
            dueDate: new Date(curYear, curMonth + 1, 15).toISOString().split('T')[0], notes: 'Emergency car repair',
            status: 'active',
            payments: [
                { id: 'pmt-1', amount: 20000, date: getDateOffset(9), note: 'First instalment', txId: null }
            ]
        },
        {
            id: 'debt-lent', name: 'Money lent out', counterparty: 'Emeka', kind: 'owedToMe',
            originalAmount: 25000, createdDate: getDateOffset(20),
            dueDate: getDateOffset(2), notes: 'Lent for transport', status: 'active',
            payments: [
                { id: 'pmt-l1', amount: 10000, date: getDateOffset(6), note: 'Part payment', txId: null }
            ]
        }
    ];

    // Savings goals / sinking funds
    state.goals = [
        {
            id: 'goal-aws', name: 'AWS Certification', targetAmount: 150000, savedAmount: 55000,
            targetDate: new Date(curYear, curMonth + 4, 1).toISOString().split('T')[0],
            icon: 'fa-solid fa-graduation-cap', color: '#0ea5e9', status: 'active',
            contributions: [
                { id: 'gc-1', amount: 30000, date: new Date(curYear, curMonth - 1, 3).toISOString().split('T')[0], note: 'Kickoff', txId: null },
                { id: 'gc-2', amount: 25000, date: getDateOffset(5), note: '', txId: null }
            ]
        },
        {
            id: 'goal-emergency', name: 'Emergency Fund', targetAmount: 500000, savedAmount: 120000,
            targetDate: null, icon: 'fa-solid fa-shield-halved', color: '#10b981', status: 'active',
            contributions: [
                { id: 'gc-3', amount: 120000, date: new Date(curYear, curMonth - 2, 15).toISOString().split('T')[0], note: 'Rollover', txId: null }
            ]
        }
    ];

    // Investment portfolio
    state.investments = {
        holdings: [
            { id: 'hold-mtn', name: 'MTN Nigeria', ticker: 'MTNN', currency: 'NGN', account: 'NGX / Bamboo',
              units: 200, avgCost: 190, currentPrice: 235, notes: '' },
            { id: 'hold-voo', name: 'Vanguard S&P 500 ETF', ticker: 'VOO', currency: 'USD', account: 'Trove',
              units: 3, avgCost: 480, currentPrice: 520, notes: 'Long-term hold' }
        ],
        activity: [
            { id: 'ia-1', holdingId: 'hold-mtn', type: 'buy', units: 200, pricePerUnit: 190, amount: 38000, fee: 0, date: new Date(curYear, curMonth - 3, 8).toISOString().split('T')[0], note: 'Initial position', txId: null, realizedPL: 0 },
            { id: 'ia-2', holdingId: 'hold-mtn', type: 'dividend', units: 0, pricePerUnit: 0, amount: 4200, fee: 0, date: getDateOffset(15), note: 'Interim dividend', txId: 'tx-s3', realizedPL: 0 },
            { id: 'ia-3', holdingId: 'hold-voo', type: 'buy', units: 3, pricePerUnit: 480, amount: 1440, fee: 0, date: new Date(curYear, curMonth - 2, 20).toISOString().split('T')[0], note: '', txId: null, realizedPL: 0 }
        ]
    };

    state.settings.usdRate = 1600;
}

// --- App Layout Navigation ---
// Includes both the desktop sidebar buttons (.nav-btn) and the mobile bottom
// nav bar (.mobile-nav-btn) so navigation works on every screen size.
const NAV_BUTTONS = document.querySelectorAll('.nav-btn, .mobile-nav-btn');
const VIEWS = document.querySelectorAll('.app-view');
const PAGE_TITLE = document.getElementById('page-title');

const TAB_TITLES = {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    categories: 'Categories & Budgets',
    income: 'Income & Recurring',
    debts: 'Debts & Lending',
    goals: 'Goals',
    investments: 'Investments',
    more: 'More',
    settings: 'Data Management'
};

function switchToTab(targetTab) {
    if (!targetTab || !TAB_TITLES[targetTab]) return;

    NAV_BUTTONS.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === targetTab);
    });

    VIEWS.forEach(view => {
        view.classList.toggle('active', view.id === `view-${targetTab}`);
    });

    PAGE_TITLE.textContent = TAB_TITLES[targetTab];

    if (targetTab === 'dashboard') {
        updateDashboard();
    } else if (targetTab === 'transactions') {
        renderTransactionsList();
        populateFilterCategories();
        renderQuickAddBar();
    } else if (targetTab === 'categories') {
        renderCategoriesManager();
        renderBudgetsManager();
        populateDropdowns();
        syncWantsCapInput();
    } else if (targetTab === 'income') {
        renderIncomeView();
    } else if (targetTab === 'debts') {
        renderDebtsView();
    } else if (targetTab === 'goals') {
        renderGoalsView();
    } else if (targetTab === 'investments') {
        renderInvestmentsView();
    }
}

NAV_BUTTONS.forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.getAttribute('data-tab')));
});

// Shortcut button redirects
document.getElementById('btn-view-all-transactions').addEventListener('click', () => {
    switchToTab('transactions');
});
document.getElementById('btn-quick-manage-budgets').addEventListener('click', () => {
    switchToTab('categories');
});

// Dashboard month filter
document.getElementById('dashboard-month-select').addEventListener('change', (e) => {
    activeDashboardMonth = e.target.value;
    updateDashboard();
});

// --- Date UI formatting ---
function updateDateDisplay() {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date-display').textContent = today.toLocaleDateString('en-US', options);
}

// Currency formatter for Nigerian Naira (₦)
const nairaFormatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2
});

function formatNaira(amount) {
    return nairaFormatter.format(amount);
}

// --- Dashboard Month Filter ---
// 'YYYY-MM' string for the month shown on the dashboard, or null for the current month.
let activeDashboardMonth = null;

function getActiveMonth() {
    if (activeDashboardMonth) {
        const [year, month] = activeDashboardMonth.split('-').map(Number);
        return { year, month: month - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
}

function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function populateMonthSelector() {
    const select = document.getElementById('dashboard-month-select');
    if (!select) return;

    const currentKey = monthKey(new Date());
    const keys = new Set([currentKey]);
    state.transactions.forEach(tx => {
        const d = new Date(tx.date);
        if (!isNaN(d)) keys.add(monthKey(d));
    });

    const sorted = [...keys].sort().reverse();
    const desired = activeDashboardMonth || currentKey;

    select.innerHTML = '';
    sorted.forEach(key => {
        const [year, month] = key.split('-').map(Number);
        const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key === currentKey ? `${label} (Current)` : label;
        select.appendChild(opt);
    });

    activeDashboardMonth = sorted.includes(desired) ? desired : currentKey;
    select.value = activeDashboardMonth;
}

// --- Dynamic Visual Updates (Stats & Visualizations) ---
function updateDashboard() {
    populateMonthSelector();
    updateDashboardStats();
    renderTodayStrip();
    renderRecurringIncomeWidget();
    renderQuickAddWidget();
    renderNeedsWantsWidget();
    renderDebtWidget();
    renderGoalsWidget();
    renderInvestmentsWidget();
    renderRecentTransactions();
    renderDashboardBudgets();
    renderCharts();
}

// Month income / expense totals for the active dashboard month.
function monthTotals() {
    const { year, month } = getActiveMonth();
    let income = 0, expense = 0;
    state.transactions.forEach(tx => {
        const d = new Date(tx.date);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        if (tx.type === 'income') income += tx.amount;
        else expense += tx.amount;
    });
    return { income, expense };
}

function monthCategorySpend(catId, year, month) {
    return state.transactions
        .filter(tx => tx.type === 'expense' && tx.categoryId === catId)
        .filter(tx => {
            const d = new Date(tx.date);
            return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((s, tx) => s + tx.amount, 0);
}

function updateDashboardStats() {
    const transactions = state.transactions;
    const { year: curYear, month: curMonth } = getActiveMonth();

    // Filter current month transactions
    const curMonthTx = transactions.filter(tx => {
        const d = new Date(tx.date);
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
    });

    let totalIncome = 0;
    let totalExpense = 0;

    curMonthTx.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        else totalExpense += tx.amount;
    });

    const totalBalance = totalIncome - totalExpense;
    let savingsRate = 0;
    if (totalIncome > 0) {
        savingsRate = Math.round(((totalIncome - totalExpense) / totalIncome) * 100);
    }
    const visualSavingsRate = Math.max(0, savingsRate);

    document.getElementById('stat-total-balance').textContent = formatNaira(totalBalance);
    document.getElementById('stat-total-income').textContent = formatNaira(totalIncome);
    document.getElementById('stat-total-expenses').textContent = formatNaira(totalExpense);
    document.getElementById('stat-savings-rate').textContent = `${savingsRate}%`;

    // Savings bar width
    const savingsBar = document.getElementById('savings-progress-bar');
    savingsBar.style.width = `${Math.min(100, visualSavingsRate)}%`;

    // Visual balance trend indicators
    const balanceTrend = document.getElementById('balance-trend');
    if (totalBalance > 0) {
        balanceTrend.className = "trend trend-up";
        balanceTrend.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> Positive Balance`;
    } else if (totalBalance < 0) {
        balanceTrend.className = "trend trend-down";
        balanceTrend.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> Budget Deficit`;
    } else {
        balanceTrend.className = "trend trend-neutral";
        balanceTrend.innerHTML = `<i class="fa-solid fa-circle-info"></i> Flat Month`;
    }
}

function renderRecentTransactions() {
    const listContainer = document.getElementById('dashboard-recent-transactions');
    listContainer.innerHTML = '';

    const sorted = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = sorted.slice(0, 5);

    if (recent.length === 0) {
        listContainer.innerHTML = `
            <div class="no-data-placeholder">
                <i class="fa-solid fa-receipt"></i>
                <p>No recent transactions. Add your first spending or income to get started!</p>
            </div>
        `;
        return;
    }

    recent.forEach(tx => {
        const cat = state.categories.find(c => c.id === tx.categoryId) || { name: 'Unknown', color: '#64748b', icon: 'fa-solid fa-circle-nodes' };
        const formattedDate = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const isExpense = tx.type === 'expense';
        const sign = isExpense ? '-' : '+';
        const amtClass = isExpense ? 'text-danger' : 'text-success';

        const item = document.createElement('div');
        item.className = 'recent-item';
        item.innerHTML = `
            <div class="recent-item-left">
                <div class="recent-item-icon" style="background: ${cat.color}15; color: ${cat.color}">
                    <i class="${cat.icon}"></i>
                </div>
                <div class="recent-item-details">
                    <span class="recent-item-title">${escapeHtml(tx.title)}</span>
                    <span class="recent-item-date">${formattedDate} • ${escapeHtml(cat.name)}</span>
                </div>
            </div>
            <div class="recent-item-amount ${amtClass}">
                ${sign}${formatNaira(tx.amount)}
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function renderDashboardBudgets() {
    const budgetContainer = document.getElementById('dashboard-budget-list');
    budgetContainer.innerHTML = '';

    const activeBudgets = Object.keys(state.budgets);

    if (activeBudgets.length === 0) {
        budgetContainer.innerHTML = `
            <div class="no-data-placeholder">
                <i class="fa-solid fa-bullseye"></i>
                <p>No budgets set. Go to Categories & Budgets to set monthly spending limits.</p>
            </div>
        `;
        return;
    }

    const { year: curYear, month: curMonth } = getActiveMonth();

    activeBudgets.forEach(catId => {
        const cat = state.categories.find(c => c.id === catId);
        if (!cat) return;

        const limit = state.budgets[catId];

        // Sum current month transactions under this category
        const spent = state.transactions
            .filter(tx => tx.categoryId === catId && tx.type === 'expense')
            .filter(tx => {
                const d = new Date(tx.date);
                return d.getFullYear() === curYear && d.getMonth() === curMonth;
            })
            .reduce((sum, tx) => sum + tx.amount, 0);

        const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
        let barClass = 'progress-safe';
        if (percentage >= 90) {
            barClass = 'progress-danger';
        } else if (percentage >= 65) {
            barClass = 'progress-warning';
        }

        const item = document.createElement('div');
        item.className = 'budget-limit-item';
        item.innerHTML = `
            <div class="budget-limit-info">
                <span class="budget-limit-name">
                    <span class="category-dot" style="background-color: ${cat.color}"></span>
                    ${escapeHtml(cat.name)}
                </span>
                <span class="budget-limit-values">
                    <strong>${formatNaira(spent)}</strong> / ${formatNaira(limit)} (${percentage}%)
                </span>
            </div>
            <div class="budget-progress-track">
                <div class="budget-progress-bar ${barClass}" style="width: ${Math.min(100, percentage)}%"></div>
            </div>
        `;
        budgetContainer.appendChild(item);
    });
}

// --- Chart Rendering System ---
function renderCharts() {
    const transactions = state.transactions;
    const { year: curYear, month: curMonth } = getActiveMonth();

    // 1. Donut Chart Data: Category Breakdown (Expenses Only, Current Month)
    const curMonthExpenses = transactions.filter(tx => {
        const d = new Date(tx.date);
        return tx.type === 'expense' && d.getFullYear() === curYear && d.getMonth() === curMonth;
    });

    const categorySums = {};
    curMonthExpenses.forEach(tx => {
        categorySums[tx.categoryId] = (categorySums[tx.categoryId] || 0) + tx.amount;
    });

    const donutDataLabels = [];
    const donutDataValues = [];
    const donutColors = [];

    Object.keys(categorySums).forEach(catId => {
        const cat = state.categories.find(c => c.id === catId) || { name: 'Unknown', color: '#64748b' };
        donutDataLabels.push(cat.name);
        donutDataValues.push(categorySums[catId]);
        donutColors.push(cat.color);
    });

    const donutOverlay = document.getElementById('category-donut-no-data');
    if (donutDataValues.length === 0) {
        donutOverlay.classList.remove('hidden');
    } else {
        donutOverlay.classList.add('hidden');
    }

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    if (donutDataValues.length > 0) {
        const donutCtx = document.getElementById('categoryDonutChart').getContext('2d');
        categoryChartInstance = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: donutDataLabels,
                datasets: [{
                    data: donutDataValues,
                    backgroundColor: donutColors,
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#e2e8f0',
                            font: { family: 'Outfit', size: 12 },
                            usePointStyle: true,
                            padding: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                label += formatNaira(context.raw);
                                return label;
                            }
                        }
                    }
                },
                cutout: '75%'
            }
        });
    }

    // 2. Bar Chart: Last 6 Months (Income vs Expense Comparison)
    const monthlySummary = {};
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(curYear, curMonth - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const labelName = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthlySummary[key] = { label: labelName, income: 0, expense: 0 };
    }

    transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (monthlySummary[key]) {
            if (tx.type === 'income') monthlySummary[key].income += tx.amount;
            else monthlySummary[key].expense += tx.amount;
        }
    });

    const barLabels = [];
    const barIncome = [];
    const barExpense = [];

    Object.keys(monthlySummary).forEach(key => {
        barLabels.push(monthlySummary[key].label);
        barIncome.push(monthlySummary[key].income);
        barExpense.push(monthlySummary[key].expense);
    });

    const trendOverlay = document.getElementById('monthly-trend-no-data');
    const hasData = barIncome.some(v => v > 0) || barExpense.some(v => v > 0);
    if (!hasData) {
        trendOverlay.classList.remove('hidden');
    } else {
        trendOverlay.classList.add('hidden');
    }

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    if (hasData) {
        const trendCtx = document.getElementById('monthlyTrendChart').getContext('2d');
        
        const greenGradient = trendCtx.createLinearGradient(0, 0, 0, 300);
        greenGradient.addColorStop(0, '#10b981');
        greenGradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)');

        const redGradient = trendCtx.createLinearGradient(0, 0, 0, 300);
        redGradient.addColorStop(0, '#f43f5e');
        redGradient.addColorStop(1, 'rgba(244, 63, 94, 0.05)');

        trendChartInstance = new Chart(trendCtx, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [
                    {
                        label: 'Income',
                        data: barIncome,
                        backgroundColor: greenGradient,
                        borderRadius: 6,
                        borderWidth: 0,
                        maxBarThickness: 24
                    },
                    {
                        label: 'Expenses',
                        data: barExpense,
                        backgroundColor: redGradient,
                        borderRadius: 6,
                        borderWidth: 0,
                        maxBarThickness: 24
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#e2e8f0',
                            font: { family: 'Outfit', size: 12 },
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }
}

// --- Transactions List Filters and Tables Render ---
function renderTransactionsList() {
    const tbody = document.getElementById('transactions-table-body');
    const mobileList = document.getElementById('transactions-mobile-list');
    const emptyState = document.getElementById('empty-transactions-state');
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';

    const searchValue = document.getElementById('tx-search').value.toLowerCase();
    const typeValue = document.getElementById('filter-type').value;
    const catValue = document.getElementById('filter-category').value;
    const sortValue = document.getElementById('filter-sort').value;
    const priorityFilter = document.getElementById('filter-priority');
    const priorityValue = priorityFilter ? priorityFilter.value : 'all';

    let filtered = state.transactions.filter(tx => {
        const cat = state.categories.find(c => c.id === tx.categoryId) || { name: '' };

        const matchSearch = tx.title.toLowerCase().includes(searchValue) ||
                            cat.name.toLowerCase().includes(searchValue) ||
                            (tx.notes && tx.notes.toLowerCase().includes(searchValue));

        const matchType = typeValue === 'all' || tx.type === typeValue;
        const matchCat = catValue === 'all' || tx.categoryId === catValue;
        const matchPriority = priorityValue === 'all' ||
                              (tx.type === 'expense' && cat.priority === priorityValue);

        return matchSearch && matchType && matchCat && matchPriority;
    });

    filtered.sort((a, b) => {
        if (sortValue === 'date-desc') {
            return new Date(b.date) - new Date(a.date);
        } else if (sortValue === 'date-asc') {
            return new Date(a.date) - new Date(b.date);
        } else if (sortValue === 'amount-desc') {
            return b.amount - a.amount;
        } else if (sortValue === 'amount-asc') {
            return a.amount - b.amount;
        }
        return 0;
    });

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }

    filtered.forEach(tx => {
        const cat = state.categories.find(c => c.id === tx.categoryId) || { name: 'Unknown', color: '#64748b', icon: 'fa-solid fa-circle-nodes' };
        const formattedDate = new Date(tx.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const badgeTypeClass = tx.type === 'expense' ? 'badge-expense' : 'badge-income';
        const typeLabel = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
        const amountSign = tx.type === 'expense' ? '-' : '+';
        const amountClass = tx.type === 'expense' ? 'text-danger' : 'text-success';
        const priorityTag = tx.type === 'expense' && cat.priority === 'want'
            ? `<span class="priority-pill priority-want">Want</span>`
            : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formattedDate}</td>
            <td>
                <div class="recent-item-details">
                    <span class="recent-item-title">${escapeHtml(tx.title)}</span>
                    <span class="recent-item-date" style="font-size: 0.75rem">${escapeHtml(tx.notes || '')}</span>
                </div>
            </td>
            <td>
                <span class="badge" style="background: ${cat.color}15; color: ${cat.color}; border-color: ${cat.color}25">
                    <i class="${cat.icon}"></i> ${escapeHtml(cat.name)}
                </span>
                ${priorityTag}
            </td>
            <td>
                <span class="badge ${badgeTypeClass}">${typeLabel}</span>
            </td>
            <td class="text-right ${amountClass}" style="font-weight: 600">
                ${amountSign}${formatNaira(tx.amount)}
            </td>
            <td class="text-center">
                <button class="btn-action btn-action-edit" onclick="editTransaction('${tx.id}')" title="Edit Transaction">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-action btn-action-delete" onclick="deleteTransaction('${tx.id}')" title="Delete Transaction">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        if (mobileList) {
            const card = document.createElement('div');
            card.className = 'mobile-tx-card';
            card.innerHTML = `
                <div class="mobile-tx-card-row1">
                    <span class="mobile-tx-card-title">${escapeHtml(tx.title)}</span>
                    <span class="mobile-tx-card-amount ${amountClass}">${amountSign}${formatNaira(tx.amount)}</span>
                </div>
                <div class="mobile-tx-card-row2">
                    <span class="badge mobile-tx-card-badge" style="background: ${cat.color}15; color: ${cat.color}; border-color: ${cat.color}25">
                        <i class="${cat.icon}"></i> ${escapeHtml(cat.name)}
                    </span>
                    ${priorityTag}
                </div>
                ${tx.notes ? `<div class="mobile-tx-card-notes">${escapeHtml(tx.notes)}</div>` : ''}
                <div class="mobile-tx-card-footer">
                    <span class="mobile-tx-card-date">${formattedDate}</span>
                    <span class="mobile-tx-card-actions">
                        <button class="btn-action btn-action-edit" onclick="editTransaction('${tx.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-action btn-action-delete" onclick="deleteTransaction('${tx.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                    </span>
                </div>
            `;
            mobileList.appendChild(card);
        }
    });
}

function populateFilterCategories() {
    const filterCatSelect = document.getElementById('filter-category');
    const prevVal = filterCatSelect.value;
    filterCatSelect.innerHTML = '<option value="all">All Categories</option>';
    
    state.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        filterCatSelect.appendChild(opt);
    });

    if (Array.from(filterCatSelect.options).some(o => o.value === prevVal)) {
        filterCatSelect.value = prevVal;
    }
}

document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('tx-search').value = '';
    document.getElementById('filter-type').value = 'all';
    document.getElementById('filter-category').value = 'all';
    document.getElementById('filter-sort').value = 'date-desc';
    const pf = document.getElementById('filter-priority');
    if (pf) pf.value = 'all';
    renderTransactionsList();
});

document.getElementById('tx-search').addEventListener('input', renderTransactionsList);
document.getElementById('filter-type').addEventListener('change', renderTransactionsList);
document.getElementById('filter-category').addEventListener('change', renderTransactionsList);
document.getElementById('filter-sort').addEventListener('change', renderTransactionsList);
document.getElementById('filter-priority').addEventListener('change', renderTransactionsList);

window.editTransaction = function(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (tx) openTxModal(tx);
};

window.deleteTransaction = function(id) {
    if (confirm("Are you sure you want to delete this transaction?")) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveData();
        renderTransactionsList();
        updateDashboard();
        showToast("Transaction deleted successfully", "success");
    }
};

// --- Category Customizer Page & Modals ---
let selectedCategoryTab = 'expense';

document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCategoryTab = btn.getAttribute('data-cat-type');
        renderCategoriesManager();
    });
});

function renderCategoriesManager() {
    const grid = document.getElementById('categories-manager-grid');
    grid.innerHTML = '';

    const filteredCats = state.categories.filter(c => c.type === selectedCategoryTab);

    filteredCats.forEach(cat => {
        const usages = state.transactions.filter(t => t.categoryId === cat.id).length;
        const priorityControl = cat.type === 'expense'
            ? `<button class="priority-toggle priority-${cat.priority === 'want' ? 'want' : 'need'}"
                       onclick="toggleCategoryPriority('${cat.id}')"
                       title="Tap to switch between Need and Want">
                   ${cat.priority === 'want' ? 'Want' : 'Need'}
               </button>`
            : '';

        const card = document.createElement('div');
        card.className = 'category-manager-card';
        card.innerHTML = `
            <div class="category-manager-icon" style="background: ${cat.color}15; color: ${cat.color}">
                <i class="${cat.icon}"></i>
            </div>
            <div class="category-manager-name">${escapeHtml(cat.name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: -4px;">${usages} items</div>
            ${priorityControl}
            <div class="category-manager-actions">
                <button class="btn-card-action btn-card-action-delete" onclick="deleteCategory('${cat.id}')" title="Delete Category">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.toggleCategoryPriority = function(id) {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;
    cat.priority = cat.priority === 'want' ? 'need' : 'want';
    saveData();
    renderCategoriesManager();
    updateDashboard();
    showToast(`${cat.name} marked as a ${cat.priority}`, 'success');
};

window.deleteCategory = function(id) {
    const inUse = state.transactions.some(t => t.categoryId === id);

    if (inUse) {
        alert("This category is currently linked to existing transactions. You must delete or re-categorize those transactions before removing this category.");
        return;
    }

    if (!confirm("Are you sure you want to delete this category?")) return;

    if (state.budgets[id]) {
        delete state.budgets[id];
    }

    state.categories = state.categories.filter(c => c.id !== id);
    saveData();
    renderCategoriesManager();
    renderBudgetsManager();
    populateDropdowns();
    showToast("Category removed successfully", "success");
};

function populateDropdowns() {
    const txSelect = document.getElementById('tx-category');
    const budgetSelect = document.getElementById('budget-category-select');

    const prevTxVal = txSelect.value;
    const prevBudgetVal = budgetSelect.value;

    txSelect.innerHTML = '';
    budgetSelect.innerHTML = '<option value="" disabled selected>Select Category</option>';

    state.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        txSelect.appendChild(opt);

        if (cat.type === 'expense') {
            const optBudget = document.createElement('option');
            optBudget.value = cat.id;
            optBudget.textContent = cat.name;
            budgetSelect.appendChild(optBudget);
        }
    });

    if (Array.from(txSelect.options).some(o => o.value === prevTxVal)) txSelect.value = prevTxVal;
    if (Array.from(budgetSelect.options).some(o => o.value === prevBudgetVal)) budgetSelect.value = prevBudgetVal;
}

function toggleTxModalCategories() {
    const checkedType = document.querySelector('input[name="tx-type"]:checked').value;
    const txSelect = document.getElementById('tx-category');
    txSelect.innerHTML = '';

    state.categories
        .filter(c => c.type === checkedType)
        .forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            txSelect.appendChild(opt);
        });
}

document.querySelectorAll('input[name="tx-type"]').forEach(input => {
    input.addEventListener('change', toggleTxModalCategories);
});

// --- Budget Limits logic ---
function renderBudgetsManager() {
    const list = document.getElementById('summary-budgets-list');
    list.innerHTML = '';

    const budgetKeys = Object.keys(state.budgets);

    if (budgetKeys.length === 0) {
        list.innerHTML = `
            <div class="no-data-placeholder">
                <i class="fa-solid fa-circle-info"></i>
                <p>No custom budget limits set yet.</p>
            </div>
        `;
        return;
    }

    budgetKeys.forEach(catId => {
        const cat = state.categories.find(c => c.id === catId);
        if (!cat) return;
        
        const limit = state.budgets[catId];

        const item = document.createElement('div');
        item.className = 'budget-summary-item';
        item.innerHTML = `
            <div class="budget-summary-info">
                <span class="category-dot" style="background-color: ${cat.color}"></span>
                <span>${escapeHtml(cat.name)}</span>
                <span class="budget-summary-amount">${formatNaira(limit)} / mo</span>
            </div>
            <button type="button" class="btn-action btn-action-delete" onclick="deleteBudgetLimit('${catId}')" title="Delete Limit">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        list.appendChild(item);
    });
}

window.deleteBudgetLimit = function(catId) {
    if (confirm("Are you sure you want to delete this category budget limit?")) {
        delete state.budgets[catId];
        saveData();
        renderBudgetsManager();
        updateDashboard();
        showToast("Budget limit removed", "success");
    }
};

document.getElementById('budget-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const catId = document.getElementById('budget-category-select').value;
    const limitVal = parseFloat(document.getElementById('budget-limit-input').value);

    if (!catId || isNaN(limitVal) || limitVal <= 0) {
        showToast("Please enter a valid amount", "danger");
        return;
    }

    state.budgets[catId] = limitVal;
    saveData();
    renderBudgetsManager();
    updateDashboard();
    document.getElementById('budget-limit-input').value = '';
    showToast("Monthly budget limit saved", "success");
});

// --- Transaction Actions: Create Modal & Form Handling ---
const txModal = document.getElementById('transaction-modal');
const openTxModalBtn = document.getElementById('open-add-transaction-modal');
const closeTxModalBtn = document.getElementById('btn-close-tx-modal');
const cancelTxModalBtn = document.getElementById('btn-cancel-tx');

// Id of the transaction currently being edited, or null when adding a new one.
let editingTxId = null;

function openTxModal(tx = null) {
    editingTxId = tx ? tx.id : null;
    document.getElementById('modal-transaction-title').textContent = tx ? 'Edit Transaction' : 'Add Transaction';

    if (tx) {
        document.querySelector(`input[name="tx-type"][value="${tx.type}"]`).checked = true;
        toggleTxModalCategories();
        document.getElementById('tx-date').value = tx.date;
        document.getElementById('tx-title').value = tx.title;
        document.getElementById('tx-amount').value = tx.amount;
        document.getElementById('tx-category').value = tx.categoryId;
        document.getElementById('tx-notes').value = tx.notes || '';
    } else {
        document.getElementById('type-expense').checked = true;
        toggleTxModalCategories();
        document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('tx-title').value = '';
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-notes').value = '';
    }

    txModal.classList.add('active');
}

function closeTxModal() {
    txModal.classList.remove('active');
    editingTxId = null;
}

openTxModalBtn.addEventListener('click', () => openTxModal());
closeTxModalBtn.addEventListener('click', closeTxModal);
cancelTxModalBtn.addEventListener('click', closeTxModal);
document.getElementById('mobile-add-tx-btn').addEventListener('click', () => openTxModal());

document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const date = document.getElementById('tx-date').value;
    const title = document.getElementById('tx-title').value.trim();
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const categoryId = document.getElementById('tx-category').value;
    const notes = document.getElementById('tx-notes').value.trim();

    if (!title || isNaN(amount) || amount <= 0 || !categoryId || !date) {
        showToast("Please fill in all required fields accurately", "danger");
        return;
    }

    const wasEditing = Boolean(editingTxId);

    if (editingTxId) {
        const existing = state.transactions.find(t => t.id === editingTxId);
        if (existing) {
            Object.assign(existing, { title, type, amount, categoryId, date, notes });
        }
    } else {
        const txId = 'tx-' + Date.now() + Math.random().toString(36).slice(2, 6);
        state.transactions.push({ id: txId, title, type, amount, categoryId, date, notes });
        touchStreak();
    }

    saveData();
    closeTxModal();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) {
        renderTransactionsList();
    }
    showToast(wasEditing ? "Transaction updated successfully" : "Transaction saved successfully", "success");
});

// --- Category Actions: Create Modal & Form Handling ---
const catModal = document.getElementById('category-modal');
const openCatModalBtn = document.getElementById('btn-create-category');
const closeCatModalBtn = document.getElementById('btn-close-cat-modal');
const cancelCatModalBtn = document.getElementById('btn-cancel-cat');
const catColorInput = document.getElementById('cat-color');
const catColorHexText = document.getElementById('cat-color-hex');

catColorInput.addEventListener('input', (e) => {
    catColorHexText.textContent = e.target.value.toUpperCase();
});

function openCatModal() {
    document.getElementById('cat-name').value = '';
    catColorInput.value = '#8b5cf6';
    catColorHexText.textContent = '#8B5CF6';
    document.getElementById('cat-type-expense').checked = true;
    const needRadio = document.getElementById('cat-priority-need');
    if (needRadio) needRadio.checked = true;
    document.getElementById('cat-icon').selectedIndex = 0;
    catModal.classList.add('active');
}

function closeCatModal() {
    catModal.classList.remove('active');
}

openCatModalBtn.addEventListener('click', openCatModal);
closeCatModalBtn.addEventListener('click', closeCatModal);
cancelCatModalBtn.addEventListener('click', closeCatModal);

// Dismiss any open modal by clicking its backdrop or pressing Escape.
[txModal, catModal].forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay === txModal ? closeTxModal() : closeCatModal();
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (txModal.classList.contains('active')) closeTxModal();
        if (catModal.classList.contains('active')) closeCatModal();
    }
});

document.getElementById('category-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const type = document.querySelector('input[name="cat-type"]:checked').value;
    const priorityRadio = document.querySelector('input[name="cat-priority"]:checked');
    const priority = type === 'expense' && priorityRadio ? priorityRadio.value : 'need';
    const name = document.getElementById('cat-name').value.trim();
    const color = catColorInput.value;
    const icon = document.getElementById('cat-icon').value;

    if (!name) {
        showToast("Please enter a category name", "danger");
        return;
    }

    const newCat = {
        id: makeId('cat'),
        name,
        type,
        color,
        icon,
        priority
    };

    state.categories.push(newCat);
    saveData();
    closeCatModal();
    renderCategoriesManager();
    populateDropdowns();
    showToast("Custom category created", "success");
});

// --- Backup Management & Restore (JSON File Support) ---
document.getElementById('btn-export-data').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `96orgebudget_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Data exported successfully", "success");
});

document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            if (imported.transactions && imported.categories) {
                state = imported;
                migrateState();
                saveData();
                showToast("Database restored successfully!", "success");

                // Refresh App states
                switchToTab('dashboard');
                populateDropdowns();
            } else {
                alert("Invalid backup file format.");
            }
        } catch (err) {
            alert("Error parsing file. Ensure it is a valid budget database backup.");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm("CAUTION: This permanently deletes ALL your data — transactions, categories, budgets, income sources, quick-adds, debts, goals and investments. Do you wish to proceed?")) {
        localStorage.removeItem('96orge_budget_state');
        state = {
            transactions: [],
            categories: [...DEFAULT_CATEGORIES],
            budgets: {},
            incomeSources: [],
            quickAdds: [],
            debts: [],
            goals: [],
            investments: { holdings: [], activity: [] },
            settings: { ...DEFAULT_SETTINGS, activityDays: [] }
        };
        saveData();
        showToast("Workspace database reset", "warning");

        // Reload views
        switchToTab('dashboard');
        populateDropdowns();
    }
});

// --- Toast notification utility ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-circle-check';
    if (type === 'danger') icon = 'fa-triangle-exclamation';
    if (type === 'warning') icon = 'fa-circle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================================
//  Habit tools — recurring income, quick-add, needs vs wants, debt tracking
// ============================================================================

// --- Shared helpers ---
function placeholder(icon, text) {
    return `<div class="no-data-placeholder"><i class="fa-solid ${icon}"></i><p>${text}</p></div>`;
}

function catById(id) {
    return state.categories.find(c => c.id === id) ||
        { name: 'Uncategorised', color: '#64748b', icon: 'fa-solid fa-circle-nodes', priority: 'need' };
}

function fillCategorySelect(select, type, selectedId) {
    if (!select) return;
    select.innerHTML = '';
    state.categories.filter(c => c.type === type).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
    if (selectedId) select.value = selectedId;
}

function daysUntil(dateStr) {
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function shortDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Recurring income: schedule maths ---
const CADENCE_DAYS = { weekly: 7, biweekly: 14 };
const CADENCE_LABEL = { monthly: 'Monthly', biweekly: 'Every 2 weeks', weekly: 'Weekly' };

function nextExpectedDate(source) {
    const from = source.lastLoggedDate || source.startDate || todayISO();
    const d = new Date(from);
    if (source.lastLoggedDate) {
        if (source.cadence === 'monthly') d.setMonth(d.getMonth() + 1);
        else d.setDate(d.getDate() + (CADENCE_DAYS[source.cadence] || 30));
    }
    return d;
}

function sourceComplete(source) {
    if (!source.endDate) return false;
    const end = new Date(source.endDate);
    return new Date() > end && nextExpectedDate(source) > end;
}

function isIncomeDue(source) {
    if (source.active === false) return false;
    const next = nextExpectedDate(source);
    if (source.endDate && next > new Date(source.endDate)) return false;
    return todayISO() >= next.toISOString().split('T')[0];
}

function incomeSourceMeta(source) {
    const cat = catById(source.categoryId);
    const next = nextExpectedDate(source);
    const complete = sourceComplete(source);
    const due = !complete && isIncomeDue(source);
    let endingSoon = false;
    if (source.endDate && !complete) {
        const d = daysUntil(source.endDate);
        endingSoon = d > 0 && d <= 60;
    }
    return { cat, next, nextStr: shortDate(next), complete, due, endingSoon };
}

// --- Dashboard widget: recurring income ---
function renderRecurringIncomeWidget() {
    const box = document.getElementById('dashboard-income-list');
    if (!box) return;

    if (state.incomeSources.length === 0) {
        box.innerHTML = placeholder('fa-money-bill-trend-up',
            'No income sources yet. Add your salary or allowance in Income & Recurring for one-tap logging.');
        return;
    }

    const rows = state.incomeSources
        .map(s => ({ s, m: incomeSourceMeta(s) }))
        .filter(x => x.m.due || x.m.endingSoon)
        .sort((a, b) => a.m.next - b.m.next);

    if (rows.length === 0) {
        box.innerHTML = placeholder('fa-circle-check', "You're all caught up on recurring income.");
        return;
    }

    box.innerHTML = '';
    rows.forEach(({ s, m }) => {
        const item = document.createElement('div');
        item.className = 'income-due-item';
        item.innerHTML = `
            <div class="income-due-info">
                <span class="income-due-name">
                    <span class="category-dot" style="background-color:${m.cat.color}"></span>
                    ${escapeHtml(s.name)}
                </span>
                <span class="income-due-sub">
                    ${m.due ? `Due since ${m.nextStr}` : `Next: ${m.nextStr}`}
                    ${m.endingSoon ? ` &bull; ends ${new Date(s.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
                </span>
            </div>
            <div class="income-due-action">
                <span class="income-due-amount">${formatNaira(s.amount)}</span>
                ${m.due ? `<button class="btn btn-primary btn-sm" onclick="openLogPaymentModal('${s.id}')"><i class="fa-solid fa-check"></i> Log</button>` : ''}
            </div>
        `;
        box.appendChild(item);
    });
}

// --- Income & Recurring view ---
function renderIncomeView() {
    renderIncomeSourcesList();
    renderQuickAddsManager();
    renderSubscriptions();
}

function renderIncomeSourcesList() {
    const box = document.getElementById('income-sources-list');
    if (!box) return;
    box.innerHTML = '';

    if (state.incomeSources.length === 0) {
        box.innerHTML = placeholder('fa-money-bill-trend-up', 'No income sources yet. Add one to start logging payments.');
        return;
    }

    state.incomeSources.forEach(s => {
        const m = incomeSourceMeta(s);
        const card = document.createElement('div');
        card.className = 'income-source-card glass-card' + (m.complete ? ' is-complete' : '');
        card.innerHTML = `
            <div class="income-source-head">
                <div class="income-source-icon" style="background:${m.cat.color}15;color:${m.cat.color}">
                    <i class="${m.cat.icon}"></i>
                </div>
                <div class="income-source-title">
                    <span class="income-source-name">${escapeHtml(s.name)}</span>
                    <span class="income-source-meta">${CADENCE_LABEL[s.cadence] || s.cadence} &bull; ${escapeHtml(m.cat.name)}</span>
                </div>
                <span class="income-source-amount">${formatNaira(s.amount)}</span>
            </div>
            <div class="income-source-sub">
                ${m.complete
                    ? `<span class="pill pill-muted">Completed</span>`
                    : m.due
                        ? `<span class="pill pill-due">Payment due</span> since ${m.nextStr}`
                        : `Next expected ${m.nextStr}`}
                ${s.endDate && !m.complete ? ` &bull; runs to ${new Date(s.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
            </div>
            <div class="income-source-actions">
                ${m.complete ? '' : `<button class="btn btn-primary btn-sm" onclick="openLogPaymentModal('${s.id}')"><i class="fa-solid fa-check"></i> Log Payment</button>`}
                <button class="btn btn-outline btn-sm" onclick="openIncomeSourceModal('${s.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
                <button class="btn-action btn-action-delete" onclick="deleteIncomeSource('${s.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        box.appendChild(card);
    });
}

const incomeSourceModal = document.getElementById('income-source-modal');
let editingSourceId = null;

function openIncomeSourceModal(id = null) {
    const src = id ? state.incomeSources.find(s => s.id === id) : null;
    editingSourceId = src ? src.id : null;
    document.getElementById('income-source-modal-title').textContent = src ? 'Edit Income Source' : 'Add Income Source';
    fillCategorySelect(document.getElementById('src-category'), 'income', src ? src.categoryId : 'cat-salary');
    document.getElementById('src-name').value = src ? src.name : '';
    document.getElementById('src-amount').value = src ? src.amount : '';
    document.getElementById('src-cadence').value = src ? src.cadence : 'monthly';
    document.getElementById('src-start').value = src ? src.startDate : todayISO();
    document.getElementById('src-end').value = src && src.endDate ? src.endDate : '';
    document.getElementById('src-notes').value = src ? (src.notes || '') : '';
    incomeSourceModal.classList.add('active');
}
window.openIncomeSourceModal = openIncomeSourceModal;

function closeIncomeSourceModal() {
    incomeSourceModal.classList.remove('active');
    editingSourceId = null;
}

document.getElementById('income-source-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('src-name').value.trim();
    const categoryId = document.getElementById('src-category').value;
    const amount = parseFloat(document.getElementById('src-amount').value);
    const cadence = document.getElementById('src-cadence').value;
    const startDate = document.getElementById('src-start').value;
    const endDate = document.getElementById('src-end').value || null;
    const notes = document.getElementById('src-notes').value.trim();

    if (!name || isNaN(amount) || amount <= 0 || !categoryId || !startDate) {
        showToast('Fill in name, amount, category and start date', 'danger');
        return;
    }
    if (endDate && endDate < startDate) {
        showToast('End date must be after the start date', 'danger');
        return;
    }

    if (editingSourceId) {
        const s = state.incomeSources.find(x => x.id === editingSourceId);
        if (s) Object.assign(s, { name, categoryId, amount, cadence, startDate, endDate, notes });
    } else {
        state.incomeSources.push({
            id: makeId('src'), name, categoryId, amount, cadence,
            startDate, endDate, lastLoggedDate: null, active: true, notes
        });
    }
    saveData();
    closeIncomeSourceModal();
    renderIncomeView();
    updateDashboard();
    showToast('Income source saved', 'success');
});

window.deleteIncomeSource = function(id) {
    if (!confirm('Delete this income source? Payments already logged as transactions stay.')) return;
    state.incomeSources = state.incomeSources.filter(s => s.id !== id);
    saveData();
    renderIncomeView();
    updateDashboard();
    showToast('Income source removed', 'success');
};

// --- Log payment modal ---
const logPaymentModal = document.getElementById('log-payment-modal');
let payingSourceId = null;

function openLogPaymentModal(id) {
    const src = state.incomeSources.find(s => s.id === id);
    if (!src) return;
    payingSourceId = id;
    document.getElementById('log-payment-title').textContent = `Log payment — ${src.name}`;
    document.getElementById('pay-amount').value = src.amount;
    document.getElementById('pay-date').value = todayISO();
    document.getElementById('pay-note').value = '';
    logPaymentModal.classList.add('active');
}
window.openLogPaymentModal = openLogPaymentModal;

function closeLogPaymentModal() {
    logPaymentModal.classList.remove('active');
    payingSourceId = null;
}

document.getElementById('log-payment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const src = state.incomeSources.find(s => s.id === payingSourceId);
    if (!src) return;
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const date = document.getElementById('pay-date').value;
    const note = document.getElementById('pay-note').value.trim();

    if (isNaN(amount) || amount <= 0 || !date) {
        showToast('Enter a valid amount and date', 'danger');
        return;
    }

    state.transactions.push({
        id: makeId('tx'), title: src.name, type: 'income', amount,
        categoryId: src.categoryId, date, notes: note, sourceId: src.id
    });
    src.lastLoggedDate = date;
    touchStreak();
    saveData();
    closeLogPaymentModal();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
    showToast(`${formatNaira(amount)} added to income`, 'success');

    // Pay yourself first — offer to move some into active goals.
    maybePromptFundGoals();
});

// --- Quick-add tiles ---
function quickAddTileHtml(qa) {
    const cat = catById(qa.categoryId);
    return `
        <button class="quick-add-tile" onclick="fireQuickAdd('${qa.id}')" title="Log ${escapeHtml(qa.label)} (${formatNaira(qa.amount)})">
            <span class="quick-add-icon" style="background:${cat.color}15;color:${cat.color}"><i class="${qa.icon || cat.icon}"></i></span>
            <span class="quick-add-label">${escapeHtml(qa.label)}</span>
            <span class="quick-add-amount">${qa.type === 'income' ? '+' : '-'}${formatNaira(qa.amount)}</span>
        </button>
    `;
}

function renderQuickAddWidget() {
    const box = document.getElementById('dashboard-quick-add');
    if (!box) return;
    box.innerHTML = state.quickAdds.length === 0
        ? placeholder('fa-bolt', 'No quick-add buttons yet. Create some in Income & Recurring.')
        : state.quickAdds.map(quickAddTileHtml).join('');
}

function renderQuickAddBar() {
    const bar = document.getElementById('transactions-quick-add');
    if (!bar) return;
    bar.innerHTML = state.quickAdds.map(quickAddTileHtml).join('');
    bar.hidden = state.quickAdds.length === 0;
}

window.fireQuickAdd = function(id) {
    const qa = state.quickAdds.find(q => q.id === id);
    if (!qa) return;
    state.transactions.push({
        id: makeId('tx'), title: qa.label, type: qa.type, amount: qa.amount,
        categoryId: qa.categoryId, date: todayISO(), notes: 'Quick add'
    });
    touchStreak();
    saveData();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
    showToast(`${escapeHtml(qa.label)}: ${qa.type === 'income' ? '+' : '-'}${formatNaira(qa.amount)} logged`, 'success');
};

function renderQuickAddsManager() {
    const box = document.getElementById('quick-adds-list');
    if (!box) return;
    box.innerHTML = '';
    if (state.quickAdds.length === 0) {
        box.innerHTML = placeholder('fa-bolt', 'No quick-add buttons yet.');
        return;
    }
    state.quickAdds.forEach(qa => {
        const cat = catById(qa.categoryId);
        const row = document.createElement('div');
        row.className = 'quick-add-row';
        row.innerHTML = `
            <span class="quick-add-row-icon" style="background:${cat.color}15;color:${cat.color}"><i class="${qa.icon || cat.icon}"></i></span>
            <span class="quick-add-row-label">${escapeHtml(qa.label)}</span>
            <span class="quick-add-row-meta">${qa.type === 'income' ? 'Income' : 'Expense'} &bull; ${escapeHtml(cat.name)}</span>
            <span class="quick-add-row-amount">${formatNaira(qa.amount)}</span>
            <button class="btn-action btn-action-edit" onclick="openQuickAddModal('${qa.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-action btn-action-delete" onclick="deleteQuickAdd('${qa.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        `;
        box.appendChild(row);
    });
}

const quickAddModal = document.getElementById('quick-add-modal');
let editingQuickAddId = null;

function openQuickAddModal(id = null) {
    const qa = id ? state.quickAdds.find(q => q.id === id) : null;
    editingQuickAddId = qa ? qa.id : null;
    document.getElementById('quick-add-modal-title').textContent = qa ? 'Edit Quick Add' : 'New Quick Add';
    const type = qa ? qa.type : 'expense';
    document.querySelector(`input[name="qa-type"][value="${type}"]`).checked = true;
    fillCategorySelect(document.getElementById('qa-category'), type, qa ? qa.categoryId : null);
    document.getElementById('qa-label').value = qa ? qa.label : '';
    document.getElementById('qa-amount').value = qa ? qa.amount : '';
    document.getElementById('qa-icon').value = qa ? (qa.icon || 'fa-solid fa-bolt') : 'fa-solid fa-bolt';
    quickAddModal.classList.add('active');
}
window.openQuickAddModal = openQuickAddModal;

function closeQuickAddModal() {
    quickAddModal.classList.remove('active');
    editingQuickAddId = null;
}

document.querySelectorAll('input[name="qa-type"]').forEach(r => r.addEventListener('change', () => {
    fillCategorySelect(
        document.getElementById('qa-category'),
        document.querySelector('input[name="qa-type"]:checked').value,
        null
    );
}));

document.getElementById('quick-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const label = document.getElementById('qa-label').value.trim();
    const type = document.querySelector('input[name="qa-type"]:checked').value;
    const categoryId = document.getElementById('qa-category').value;
    const amount = parseFloat(document.getElementById('qa-amount').value);
    const icon = document.getElementById('qa-icon').value;

    if (!label || !categoryId || isNaN(amount) || amount <= 0) {
        showToast('Fill in label, category and amount', 'danger');
        return;
    }

    if (editingQuickAddId) {
        const qa = state.quickAdds.find(q => q.id === editingQuickAddId);
        if (qa) Object.assign(qa, { label, type, categoryId, amount, icon });
    } else {
        state.quickAdds.push({ id: makeId('qa'), label, type, categoryId, amount, icon });
    }
    saveData();
    closeQuickAddModal();
    renderQuickAddsManager();
    updateDashboard();
    renderQuickAddBar();
    showToast('Quick add saved', 'success');
});

window.deleteQuickAdd = function(id) {
    state.quickAdds = state.quickAdds.filter(q => q.id !== id);
    saveData();
    renderQuickAddsManager();
    updateDashboard();
    renderQuickAddBar();
    showToast('Quick add removed', 'success');
};

// --- Needs vs Wants ---
function monthExpensesByPriority() {
    const { year, month } = getActiveMonth();
    let need = 0, want = 0;
    state.transactions.forEach(tx => {
        if (tx.type !== 'expense') return;
        const d = new Date(tx.date);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        if (catById(tx.categoryId).priority === 'want') want += tx.amount;
        else need += tx.amount;
    });
    return { need, want, total: need + want };
}

function renderNeedsWantsWidget() {
    const box = document.getElementById('dashboard-needs-wants');
    if (!box) return;

    const { need, want, total } = monthExpensesByPriority();
    if (total === 0) {
        box.innerHTML = placeholder('fa-scale-balanced', 'No spending logged for this month yet.');
        return;
    }

    const wantPct = Math.round((want / total) * 100);
    const needPct = 100 - wantPct;
    const cap = state.settings.wantsMonthlyCap;

    let capLine;
    if (cap && cap > 0) {
        const capPct = Math.round((want / cap) * 100);
        let tone = 'progress-safe';
        let msg = `On track — ${formatNaira(Math.max(0, cap - want))} of your wants budget left.`;
        if (want > cap) {
            tone = 'progress-danger';
            msg = `Over your wants cap by ${formatNaira(want - cap)}. Ease off the extras.`;
        } else if (capPct >= 80) {
            tone = 'progress-warning';
            msg = `Getting close — ${formatNaira(cap - want)} of your wants budget left.`;
        }
        capLine = `
            <div class="nw-cap">
                <div class="nw-cap-row"><span>Wants cap</span><span>${formatNaira(want)} / ${formatNaira(cap)}</span></div>
                <div class="budget-progress-track"><div class="budget-progress-bar ${tone}" style="width:${Math.min(100, capPct)}%"></div></div>
                <p class="nw-cap-msg">${msg}</p>
            </div>`;
    } else {
        capLine = `<p class="nw-cap-msg subtle">Set a monthly wants cap in Categories &amp; Budgets to get alerts.</p>`;
    }

    box.innerHTML = `
        <div class="nw-split-bar">
            <div class="nw-seg nw-need" style="width:${needPct}%"></div>
            <div class="nw-seg nw-want" style="width:${wantPct}%"></div>
        </div>
        <div class="nw-legend">
            <span><span class="nw-dot nw-need"></span> Needs ${formatNaira(need)} (${needPct}%)</span>
            <span><span class="nw-dot nw-want"></span> Wants ${formatNaira(want)} (${wantPct}%)</span>
        </div>
        ${capLine}
    `;
}

function syncWantsCapInput() {
    const input = document.getElementById('wants-cap-input');
    if (input) input.value = state.settings.wantsMonthlyCap || '';
}

const wantsCapForm = document.getElementById('wants-cap-form');
if (wantsCapForm) {
    wantsCapForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = parseFloat(document.getElementById('wants-cap-input').value);
        state.settings.wantsMonthlyCap = (isNaN(val) || val <= 0) ? null : val;
        saveData();
        updateDashboard();
        showToast(state.settings.wantsMonthlyCap ? 'Wants cap saved' : 'Wants cap cleared', 'success');
    });
}

// --- Debt tracker ---
function debtPaid(debt) {
    return debt.payments.reduce((s, p) => s + p.amount, 0);
}

function debtRemaining(debt) {
    return Math.max(0, debt.originalAmount - debtPaid(debt));
}

function debtOverdueDays(d) {
    return d.dueDate ? -daysUntil(d.dueDate) : 0; // positive once past due
}

function debtSideHtml(items, label, verb) {
    if (items.length === 0) return '';
    const total = items.reduce((s, d) => s + debtRemaining(d), 0);
    const withDue = items.filter(d => d.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const focus = withDue[0] || items.slice().sort((a, b) => debtRemaining(a) - debtRemaining(b))[0];
    const overdue = debtOverdueDays(focus) > 0;
    const pct = Math.round((debtPaid(focus) / focus.originalAmount) * 100);
    const dueLabel = focus.dueDate
        ? (overdue ? `${debtOverdueDays(focus)} day${debtOverdueDays(focus) > 1 ? 's' : ''} overdue`
                   : `due ${new Date(focus.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
        : '';
    return `
        <div class="debt-side">
            <div class="debt-widget-total">${label} <strong>${formatNaira(total)}</strong> across ${items.length}</div>
            <div class="debt-focus">
                <div class="debt-focus-row">
                    <span>${escapeHtml(focus.name)}${dueLabel ? ` &bull; <span class="${overdue ? 'text-danger' : ''}">${dueLabel}</span>` : ''}</span>
                    <span>${formatNaira(debtRemaining(focus))} ${verb}</span>
                </div>
                <div class="budget-progress-track"><div class="budget-progress-bar ${overdue ? 'progress-danger' : 'progress-safe'}" style="width:${Math.min(100, pct)}%"></div></div>
                <button class="btn btn-primary btn-sm" onclick="openDebtPaymentModal('${focus.id}')"><i class="fa-solid fa-coins"></i> Record Payment</button>
            </div>
        </div>`;
}

function renderDebtWidget() {
    const box = document.getElementById('dashboard-debt-list');
    if (!box) return;

    if (state.debts.length === 0) {
        box.innerHTML = placeholder('fa-hand-holding-dollar', 'No debts or loans tracked. Add what you owe — or what people owe you.');
        return;
    }

    const iOwe = state.debts.filter(d => d.kind === 'iOwe' && d.status === 'active');
    const owedToMe = state.debts.filter(d => d.kind === 'owedToMe' && d.status === 'active');

    if (iOwe.length === 0 && owedToMe.length === 0) {
        box.innerHTML = placeholder('fa-circle-check', 'All debts and loans are settled.');
        return;
    }

    box.innerHTML =
        debtSideHtml(iOwe, 'You owe', 'left') +
        debtSideHtml(owedToMe, 'Owed to you', 'to collect');
}

function renderPeopleRollup() {
    const box = document.getElementById('debts-people-rollup');
    if (!box) return;

    const active = state.debts.filter(d => d.status === 'active' && d.counterparty);
    if (active.length === 0) { box.innerHTML = ''; return; }

    const byPerson = {};
    active.forEach(d => {
        const key = d.counterparty.trim();
        if (!byPerson[key]) byPerson[key] = { net: 0, count: 0 };
        byPerson[key].net += (d.kind === 'owedToMe' ? 1 : -1) * debtRemaining(d);
        byPerson[key].count += 1;
    });

    const rows = Object.entries(byPerson)
        .filter(([, v]) => Math.abs(v.net) > 0.005)
        .sort((a, b) => b[1].net - a[1].net)
        .map(([name, v]) => {
            const owesYou = v.net > 0;
            return `<div class="person-rollup-row">
                <span class="person-rollup-name">${escapeHtml(name)}</span>
                <span class="person-rollup-amount ${owesYou ? 'text-success' : 'text-danger'}">
                    ${owesYou ? 'owes you' : 'you owe'} ${formatNaira(Math.abs(v.net))}
                </span>
                <span class="person-rollup-count">${v.count} item${v.count > 1 ? 's' : ''}</span>
            </div>`;
        }).join('');

    box.innerHTML = rows
        ? `<h3 class="debt-group-title">By Person</h3><div class="person-rollup">${rows}</div>`
        : '';
}

function renderDebtsView() {
    renderPeopleRollup();

    const box = document.getElementById('debts-list');
    if (!box) return;
    box.innerHTML = '';

    if (state.debts.length === 0) {
        box.innerHTML = placeholder('fa-hand-holding-dollar', 'No debts yet. Use “Add Debt” to track money you owe or money you lent out.');
        return;
    }

    const groups = [
        { label: 'I Owe', items: state.debts.filter(d => d.kind === 'iOwe' && d.status === 'active') },
        { label: 'Owed To Me', items: state.debts.filter(d => d.kind === 'owedToMe' && d.status === 'active') },
        { label: 'Settled', items: state.debts.filter(d => d.status === 'settled') }
    ];

    groups.forEach(g => {
        if (g.items.length === 0) return;
        const section = document.createElement('div');
        section.className = 'debt-group';
        section.innerHTML = `<h3 class="debt-group-title">${g.label} <span>${g.items.length}</span></h3>`;
        g.items.forEach(d => section.appendChild(debtCard(d)));
        box.appendChild(section);
    });
}

function debtCard(d) {
    const paid = debtPaid(d);
    const pct = d.originalAmount > 0 ? Math.round((paid / d.originalAmount) * 100) : 0;
    const settled = d.status === 'settled';

    const history = d.payments.length
        ? d.payments.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => `
            <li>
                <span>${shortDate(p.date)}</span>
                <span>${formatNaira(p.amount)}</span>
                <span class="debt-hist-note">${escapeHtml(p.note || '')}</span>
            </li>`).join('')
        : '<li class="subtle">No payments recorded yet.</li>';

    const card = document.createElement('div');
    card.className = 'debt-card glass-card' + (settled ? ' is-settled' : '');
    card.innerHTML = `
        <div class="debt-card-head">
            <div>
                <span class="debt-card-name">${escapeHtml(d.name)}</span>
                <span class="debt-card-party">${escapeHtml(d.counterparty || '')}${d.dueDate ? ` &bull; due ${shortDate(d.dueDate)}` : ''}</span>
            </div>
            <span class="debt-card-remaining">${settled ? 'Settled' : formatNaira(debtRemaining(d)) + ' left'}</span>
        </div>
        <div class="budget-progress-track">
            <div class="budget-progress-bar ${settled ? 'progress-safe' : 'progress-warning'}" style="width:${Math.min(100, pct)}%"></div>
        </div>
        <div class="debt-card-sub">${formatNaira(paid)} paid of ${formatNaira(d.originalAmount)} (${pct}%)</div>
        ${d.notes ? `<p class="debt-card-notes">${escapeHtml(d.notes)}</p>` : ''}
        <details class="debt-history">
            <summary>Payment history (${d.payments.length})</summary>
            <ul>${history}</ul>
        </details>
        <div class="debt-card-actions">
            ${settled ? `<button class="btn btn-outline btn-sm" onclick="reopenDebt('${d.id}')">Reopen</button>`
                       : `<button class="btn btn-primary btn-sm" onclick="openDebtPaymentModal('${d.id}')"><i class="fa-solid fa-coins"></i> Record Payment</button>`}
            <button class="btn btn-outline btn-sm" onclick="openDebtModal('${d.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn-action btn-action-delete" onclick="deleteDebt('${d.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    `;
    return card;
}

const debtModal = document.getElementById('debt-modal');
let editingDebtId = null;

function openDebtModal(id = null) {
    const d = id ? state.debts.find(x => x.id === id) : null;
    editingDebtId = d ? d.id : null;
    document.getElementById('debt-modal-title').textContent = d ? 'Edit Debt' : 'Add Debt';
    document.querySelector(`input[name="debt-kind"][value="${d ? d.kind : 'iOwe'}"]`).checked = true;
    document.getElementById('debt-name').value = d ? d.name : '';
    document.getElementById('debt-counterparty').value = d ? (d.counterparty || '') : '';
    const amountInput = document.getElementById('debt-amount');
    amountInput.value = d ? d.originalAmount : '';
    amountInput.disabled = Boolean(d && d.payments.length);
    document.getElementById('debt-created').value = d ? d.createdDate : todayISO();
    document.getElementById('debt-due').value = d && d.dueDate ? d.dueDate : '';
    document.getElementById('debt-notes').value = d ? (d.notes || '') : '';
    debtModal.classList.add('active');
}
window.openDebtModal = openDebtModal;

function closeDebtModal() {
    debtModal.classList.remove('active');
    editingDebtId = null;
    document.getElementById('debt-amount').disabled = false;
}

document.getElementById('debt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kind = document.querySelector('input[name="debt-kind"]:checked').value;
    const name = document.getElementById('debt-name').value.trim();
    const counterparty = document.getElementById('debt-counterparty').value.trim();
    const originalAmount = parseFloat(document.getElementById('debt-amount').value);
    const createdDate = document.getElementById('debt-created').value;
    const dueDate = document.getElementById('debt-due').value || null;
    const notes = document.getElementById('debt-notes').value.trim();

    if (!name || isNaN(originalAmount) || originalAmount <= 0 || !createdDate) {
        showToast('Fill in name, amount and date', 'danger');
        return;
    }

    if (editingDebtId) {
        const d = state.debts.find(x => x.id === editingDebtId);
        if (d) {
            d.kind = kind;
            d.name = name;
            d.counterparty = counterparty;
            d.createdDate = createdDate;
            d.dueDate = dueDate;
            d.notes = notes;
            if (!d.payments.length) d.originalAmount = originalAmount;
        }
    } else {
        state.debts.push({
            id: makeId('debt'), name, counterparty, kind, originalAmount,
            createdDate, dueDate, notes, status: 'active', payments: []
        });
    }
    saveData();
    closeDebtModal();
    renderDebtsView();
    updateDashboard();
    showToast('Debt saved', 'success');
});

window.deleteDebt = function(id) {
    const d = state.debts.find(x => x.id === id);
    if (!d) return;
    const linked = d.payments.filter(p => p.txId).map(p => p.txId);
    let removeTx = false;
    if (linked.length) {
        removeTx = confirm(`This debt has ${linked.length} linked transaction(s).\nOK = also delete them, Cancel = keep them.`);
    } else if (!confirm('Delete this debt?')) {
        return;
    }
    if (removeTx) state.transactions = state.transactions.filter(t => !linked.includes(t.id));
    state.debts = state.debts.filter(x => x.id !== id);
    saveData();
    renderDebtsView();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
    showToast('Debt removed', 'success');
};

window.reopenDebt = function(id) {
    const d = state.debts.find(x => x.id === id);
    if (!d) return;
    d.status = 'active';
    saveData();
    renderDebtsView();
    updateDashboard();
};

const debtPaymentModal = document.getElementById('debt-payment-modal');
let payingDebtId = null;

function openDebtPaymentModal(id) {
    const d = state.debts.find(x => x.id === id);
    if (!d) return;
    payingDebtId = id;
    const rem = debtRemaining(d);
    document.getElementById('debt-payment-title').textContent = `Record payment — ${d.name}`;
    document.getElementById('dp-amount').value = rem > 0 ? rem : '';
    document.getElementById('dp-date').value = todayISO();
    document.getElementById('dp-note').value = '';
    document.getElementById('dp-log-tx').checked = true;
    document.getElementById('dp-log-tx-label').textContent = d.kind === 'iOwe'
        ? 'Also log as an expense (Debt Repayment)'
        : 'Also log as income (repayment received)';
    debtPaymentModal.classList.add('active');
}
window.openDebtPaymentModal = openDebtPaymentModal;

function closeDebtPaymentModal() {
    debtPaymentModal.classList.remove('active');
    payingDebtId = null;
}

document.getElementById('debt-payment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = state.debts.find(x => x.id === payingDebtId);
    if (!d) return;
    const amount = parseFloat(document.getElementById('dp-amount').value);
    const date = document.getElementById('dp-date').value;
    const note = document.getElementById('dp-note').value.trim();
    const logTx = document.getElementById('dp-log-tx').checked;

    if (isNaN(amount) || amount <= 0 || !date) {
        showToast('Enter a valid amount and date', 'danger');
        return;
    }

    let txId = null;
    if (logTx) {
        txId = makeId('tx');
        state.transactions.push({
            id: txId,
            title: d.kind === 'iOwe' ? `Debt repayment — ${d.name}` : `Repayment received — ${d.name}`,
            type: d.kind === 'iOwe' ? 'expense' : 'income',
            amount,
            categoryId: d.kind === 'iOwe' ? 'cat-debt' : 'cat-gift',
            date,
            notes: note || (d.counterparty ? `${d.kind === 'iOwe' ? 'To' : 'From'} ${d.counterparty}` : '')
        });
    }

    d.payments.push({ id: makeId('pmt'), amount, date, note, txId });
    touchStreak();

    const settledNow = debtRemaining(d) <= 0 && d.status !== 'settled';
    if (settledNow) d.status = 'settled';

    saveData();
    closeDebtPaymentModal();
    renderDebtsView();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
    showToast(settledNow ? `${d.name} is fully settled!` : `Payment of ${formatNaira(amount)} recorded`, 'success');
});

// ============================================================================
//  Milestone 2 — habit strip, savings goals, investments, subscriptions
// ============================================================================

// --- Habit "Today" strip ---
function daysLeftInMonth() {
    const { year, month } = getActiveMonth();
    const now = new Date();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const viewingCurrent = year === now.getFullYear() && month === now.getMonth();
    return viewingCurrent ? Math.max(1, lastDay - now.getDate() + 1) : lastDay;
}

function computeSafeToSpend() {
    const { year, month } = getActiveMonth();
    const { income, expense } = monthTotals();
    let unspentBudgets = 0;
    Object.keys(state.budgets).forEach(catId => {
        unspentBudgets += Math.max(0, state.budgets[catId] - monthCategorySpend(catId, year, month));
    });
    const safeMonth = income - expense - unspentBudgets;
    const left = daysLeftInMonth();
    return { safeMonth, perDay: safeMonth / left, daysLeft: left };
}

function computeStreak() {
    const days = [...new Set(state.settings.activityDays)].sort();
    if (days.length === 0) return { current: 0, best: 0 };
    let best = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
        const diff = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
        run = diff === 1 ? run + 1 : 1;
        best = Math.max(best, run);
    }
    const today = todayISO();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let current = 0;
    if (days[days.length - 1] === today || days[days.length - 1] === yesterday) {
        current = 1;
        for (let i = days.length - 1; i > 0; i--) {
            if ((new Date(days[i]) - new Date(days[i - 1])) / 86400000 === 1) current++;
            else break;
        }
    }
    return { current, best };
}

function biggestMover() {
    const { year, month } = getActiveMonth();
    const prev = new Date(year, month - 1, 1);
    const pY = prev.getFullYear(), pM = prev.getMonth();
    const thisM = {}, lastM = {};
    state.transactions.forEach(tx => {
        if (tx.type !== 'expense') return;
        const d = new Date(tx.date);
        if (d.getFullYear() === year && d.getMonth() === month) thisM[tx.categoryId] = (thisM[tx.categoryId] || 0) + tx.amount;
        else if (d.getFullYear() === pY && d.getMonth() === pM) lastM[tx.categoryId] = (lastM[tx.categoryId] || 0) + tx.amount;
    });
    if (Object.keys(lastM).length === 0) return null;
    let top = null;
    new Set([...Object.keys(thisM), ...Object.keys(lastM)]).forEach(catId => {
        const delta = (thisM[catId] || 0) - (lastM[catId] || 0);
        if (!top || Math.abs(delta) > Math.abs(top.delta)) top = { catId, delta, base: lastM[catId] || 0 };
    });
    return top && Math.abs(top.delta) >= 1000 ? top : null;
}

function renderTodayStrip() {
    const box = document.getElementById('dashboard-today-strip');
    if (!box) return;

    const s = computeSafeToSpend();
    const streak = computeStreak();
    const mover = biggestMover();

    let safeTone = 'good';
    if (s.safeMonth < 0) safeTone = 'bad';
    else if (s.perDay < 2000) safeTone = 'warn';

    const tiles = [`
        <div class="today-tile today-${safeTone}">
            <span class="today-label">Safe to spend</span>
            <span class="today-value">${formatNaira(Math.abs(s.safeMonth))}</span>
            <span class="today-sub">${s.safeMonth < 0
                ? 'over your plan this month'
                : `${formatNaira(Math.max(0, s.perDay))}/day &middot; ${s.daysLeft} day${s.daysLeft > 1 ? 's' : ''} left`}</span>
        </div>`, `
        <div class="today-tile">
            <span class="today-label">Logging streak</span>
            <span class="today-value">${streak.current === 0 ? '—' : `${streak.current}🔥`}</span>
            <span class="today-sub">${streak.current === 0 ? 'Log something today to start' : `Best run: ${streak.best} days`}</span>
        </div>`];

    if (mover) {
        const cat = catById(mover.catId);
        const up = mover.delta > 0;
        const pct = mover.base > 0 ? Math.round(Math.abs(mover.delta) / mover.base * 100) : null;
        tiles.push(`
            <div class="today-tile today-${up ? 'warn' : 'good'}">
                <span class="today-label">vs last month</span>
                <span class="today-value">${escapeHtml(cat.name)}</span>
                <span class="today-sub">${up ? '+' : '−'}${formatNaira(Math.abs(mover.delta))}${pct !== null ? ` (${pct}% ${up ? 'more' : 'less'})` : ''}</span>
            </div>`);
    }

    box.innerHTML = tiles.join('');
}

// --- Savings goals ---
function goalProgress(g) {
    return g.targetAmount > 0 ? Math.min(100, Math.round(g.savedAmount / g.targetAmount * 100)) : 0;
}

function goalMonthlyNeeded(g) {
    if (!g.targetDate) return null;
    const remaining = Math.max(0, g.targetAmount - g.savedAmount);
    const months = Math.max(1, Math.ceil((new Date(g.targetDate) - new Date()) / (30 * 86400000)));
    return remaining / months;
}

function renderGoalsWidget() {
    const box = document.getElementById('dashboard-goals-list');
    if (!box) return;
    if (state.goals.length === 0) {
        box.innerHTML = placeholder('fa-bullseye', 'No savings goals yet. Set one for a certificate or your emergency fund.');
        return;
    }
    const active = state.goals.filter(g => g.status === 'active').slice(0, 3);
    const totalSaved = state.goals.reduce((s, g) => s + g.savedAmount, 0);
    const totalTarget = state.goals.reduce((s, g) => s + g.targetAmount, 0);
    box.innerHTML =
        (active.length ? active : state.goals.slice(0, 3)).map(g => `
            <div class="goal-mini">
                <div class="goal-mini-row"><span>${escapeHtml(g.name)}</span><span>${formatNaira(g.savedAmount)} / ${formatNaira(g.targetAmount)}</span></div>
                <div class="budget-progress-track"><div class="budget-progress-bar progress-safe" style="width:${goalProgress(g)}%"></div></div>
            </div>`).join('') +
        `<div class="goal-mini-total">Saved ${formatNaira(totalSaved)} of ${formatNaira(totalTarget)} across ${state.goals.length} goal${state.goals.length > 1 ? 's' : ''}</div>`;
}

function renderGoalsView() {
    const box = document.getElementById('goals-list');
    if (!box) return;
    box.innerHTML = '';
    if (state.goals.length === 0) {
        box.innerHTML = placeholder('fa-bullseye', 'No goals yet. Use “New Goal” to start a sinking fund.');
        return;
    }
    state.goals.forEach(g => box.appendChild(goalCard(g)));
}

function goalCard(g) {
    const pct = goalProgress(g);
    const reached = g.status === 'reached' || g.savedAmount >= g.targetAmount;
    const monthly = goalMonthlyNeeded(g);
    const history = g.contributions.length
        ? g.contributions.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(c =>
            `<li><span>${shortDate(c.date)}</span><span>${formatNaira(c.amount)}</span><span class="debt-hist-note">${escapeHtml(c.note || '')}</span></li>`).join('')
        : '<li class="subtle">No contributions yet.</li>';
    const card = document.createElement('div');
    card.className = 'goal-card glass-card' + (reached ? ' is-settled' : '');
    card.innerHTML = `
        <div class="goal-card-head">
            <div class="goal-card-icon" style="background:${g.color}20;color:${g.color}"><i class="${g.icon || 'fa-solid fa-bullseye'}"></i></div>
            <div class="goal-card-title">
                <span class="goal-card-name">${escapeHtml(g.name)}</span>
                <span class="goal-card-meta">${g.targetDate ? `Target ${shortDate(g.targetDate)}` : 'No deadline'}</span>
            </div>
            <span class="goal-card-pct">${pct}%</span>
        </div>
        <div class="budget-progress-track"><div class="budget-progress-bar ${reached ? 'progress-safe' : 'progress-warning'}" style="width:${pct}%"></div></div>
        <div class="goal-card-sub">${formatNaira(g.savedAmount)} of ${formatNaira(g.targetAmount)}${!reached && monthly ? ` &bull; ${formatNaira(monthly)}/month to hit target` : ''}${reached ? ' &bull; reached!' : ''}</div>
        <details class="debt-history"><summary>Contributions (${g.contributions.length})</summary><ul>${history}</ul></details>
        <div class="debt-card-actions">
            <button class="btn btn-primary btn-sm" onclick="openContributeModal('${g.id}')"><i class="fa-solid fa-plus"></i> Contribute</button>
            <button class="btn btn-outline btn-sm" onclick="openGoalModal('${g.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn-action btn-action-delete" onclick="deleteGoal('${g.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    `;
    return card;
}

const goalModal = document.getElementById('goal-modal');
let editingGoalId = null;

function openGoalModal(id = null) {
    const g = id ? state.goals.find(x => x.id === id) : null;
    editingGoalId = g ? g.id : null;
    document.getElementById('goal-modal-title').textContent = g ? 'Edit Goal' : 'New Goal';
    document.getElementById('goal-name').value = g ? g.name : '';
    document.getElementById('goal-target').value = g ? g.targetAmount : '';
    document.getElementById('goal-date').value = g && g.targetDate ? g.targetDate : '';
    document.getElementById('goal-icon').value = g ? (g.icon || 'fa-solid fa-bullseye') : 'fa-solid fa-bullseye';
    document.getElementById('goal-color').value = g ? g.color : '#8b5cf6';
    goalModal.classList.add('active');
}
window.openGoalModal = openGoalModal;
function closeGoalModal() { goalModal.classList.remove('active'); editingGoalId = null; }

document.getElementById('goal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value.trim();
    const targetAmount = parseFloat(document.getElementById('goal-target').value);
    const targetDate = document.getElementById('goal-date').value || null;
    const icon = document.getElementById('goal-icon').value;
    const color = document.getElementById('goal-color').value;
    if (!name || isNaN(targetAmount) || targetAmount <= 0) {
        showToast('Fill in a name and target amount', 'danger');
        return;
    }
    if (editingGoalId) {
        const g = state.goals.find(x => x.id === editingGoalId);
        if (g) {
            Object.assign(g, { name, targetAmount, targetDate, icon, color });
            g.status = g.savedAmount >= g.targetAmount ? 'reached' : 'active';
        }
    } else {
        state.goals.push({ id: makeId('goal'), name, targetAmount, targetDate, savedAmount: 0, icon, color, status: 'active', contributions: [] });
    }
    saveData();
    closeGoalModal();
    renderGoalsView();
    updateDashboard();
    showToast('Goal saved', 'success');
});

window.deleteGoal = function(id) {
    if (!confirm('Delete this goal? Contributions already logged as transactions stay.')) return;
    state.goals = state.goals.filter(g => g.id !== id);
    saveData();
    renderGoalsView();
    updateDashboard();
    showToast('Goal removed', 'success');
};

function addGoalContribution(g, amount, date, note, logTx) {
    let txId = null;
    if (logTx) {
        txId = makeId('tx');
        state.transactions.push({
            id: txId, title: `Savings — ${g.name}`, type: 'expense', amount,
            categoryId: 'cat-savings', date, notes: note
        });
    }
    g.contributions.push({ id: makeId('gc'), amount, date, note, txId });
    g.savedAmount += amount;
    const reachedNow = g.savedAmount >= g.targetAmount && g.status !== 'reached';
    if (reachedNow) g.status = 'reached';
    showToast(reachedNow ? `${g.name} goal reached!` : `${formatNaira(amount)} added to ${g.name}`, 'success');
}

const contributeModal = document.getElementById('contribute-modal');
let contributingGoalId = null;

function openContributeModal(id) {
    const g = state.goals.find(x => x.id === id);
    if (!g) return;
    contributingGoalId = id;
    document.getElementById('contribute-title').textContent = `Contribute — ${g.name}`;
    document.getElementById('contribute-amount').value = '';
    document.getElementById('contribute-date').value = todayISO();
    document.getElementById('contribute-note').value = '';
    document.getElementById('contribute-log-tx').checked = true;
    contributeModal.classList.add('active');
}
window.openContributeModal = openContributeModal;
function closeContributeModal() { contributeModal.classList.remove('active'); contributingGoalId = null; }

document.getElementById('contribute-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const g = state.goals.find(x => x.id === contributingGoalId);
    if (!g) return;
    const amount = parseFloat(document.getElementById('contribute-amount').value);
    const date = document.getElementById('contribute-date').value;
    const note = document.getElementById('contribute-note').value.trim();
    const logTx = document.getElementById('contribute-log-tx').checked;
    if (isNaN(amount) || amount <= 0 || !date) { showToast('Enter a valid amount and date', 'danger'); return; }
    addGoalContribution(g, amount, date, note, logTx);
    touchStreak();
    saveData();
    closeContributeModal();
    renderGoalsView();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
});

// --- Pay yourself first ---
const fundGoalsModal = document.getElementById('fund-goals-modal');

function maybePromptFundGoals() {
    const active = state.goals.filter(g => g.status === 'active');
    if (active.length === 0 || !fundGoalsModal) return;
    document.getElementById('fund-goals-list').innerHTML = active.map(g => `
        <label class="fund-goal-row">
            <span class="fund-goal-name">${escapeHtml(g.name)}</span>
            <span class="fund-goal-meta">${formatNaira(g.savedAmount)} / ${formatNaira(g.targetAmount)}</span>
            <span class="input-prefix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" class="fund-goal-input" data-goal="${g.id}" min="0" step="0.01" placeholder="0">
            </span>
        </label>`).join('');
    fundGoalsModal.classList.add('active');
}
function closeFundGoalsModal() { fundGoalsModal.classList.remove('active'); }

document.getElementById('fund-goals-form').addEventListener('submit', (e) => {
    e.preventDefault();
    let any = false;
    document.querySelectorAll('.fund-goal-input').forEach(inp => {
        const amount = parseFloat(inp.value);
        if (isNaN(amount) || amount <= 0) return;
        const g = state.goals.find(x => x.id === inp.dataset.goal);
        if (!g) return;
        addGoalContribution(g, amount, todayISO(), 'Pay yourself first', true);
        any = true;
    });
    if (any) { touchStreak(); saveData(); updateDashboard(); }
    closeFundGoalsModal();
});

// --- Investments ---
function invRate() { return state.settings.usdRate; }

function toNaira(amount, ccy) {
    if (ccy === 'USD') return invRate() ? amount * invRate() : null;
    return amount;
}

function holdingCcy(holdingId) {
    const h = state.investments.holdings.find(x => x.id === holdingId);
    return h ? h.currency : 'NGN';
}

function holdingValueNaira(h) { return toNaira(h.units * h.currentPrice, h.currency); }
function holdingCostNaira(h) { return toNaira(h.units * h.avgCost, h.currency); }

function portfolioTotals() {
    let valueN = 0, costN = 0, realized = 0, missingRate = false;
    state.investments.holdings.forEach(h => {
        const v = holdingValueNaira(h), c = holdingCostNaira(h);
        if (v === null || c === null) { missingRate = true; return; }
        valueN += v; costN += c;
    });
    state.investments.activity.forEach(a => {
        if (a.type !== 'sell') return;
        const pl = toNaira(a.realizedPL || 0, holdingCcy(a.holdingId));
        if (pl !== null) realized += pl;
    });
    return { valueN, costN, unrealized: valueN - costN, realized, missingRate };
}

function renderInvestmentsWidget() {
    const box = document.getElementById('dashboard-invest-list');
    if (!box) return;
    if (state.investments.holdings.length === 0) {
        box.innerHTML = placeholder('fa-arrow-trend-up', 'No holdings yet. Add your stocks to track value and returns.');
        return;
    }
    const t = portfolioTotals();
    const plPct = t.costN > 0 ? Math.round(t.unrealized / t.costN * 100) : 0;
    const up = t.unrealized >= 0;
    box.innerHTML = `
        <div class="invest-widget-value">${formatNaira(t.valueN)}<span class="invest-widget-caption"> portfolio value</span></div>
        <div class="invest-widget-pl ${up ? 'text-success' : 'text-danger'}">
            ${up ? '▲' : '▼'} ${formatNaira(Math.abs(t.unrealized))} (${up ? '+' : ''}${plPct}%) unrealised
        </div>
        ${t.missingRate ? `<div class="nw-cap-msg subtle">Set a ₦/$ rate on the Investments page to value USD holdings.</div>` : ''}
    `;
}

function renderInvestmentsView() {
    renderPortfolioSummary();
    renderHoldingsList();
}

function renderPortfolioSummary() {
    const box = document.getElementById('portfolio-summary');
    if (!box) return;
    const hasUsd = state.investments.holdings.some(h => h.currency === 'USD');
    const t = portfolioTotals();
    const up = t.unrealized >= 0;
    const plPct = t.costN > 0 ? Math.round(t.unrealized / t.costN * 100) : 0;
    box.innerHTML = `
        <div class="portfolio-metrics">
            <div><span class="pm-label">Value</span><span class="pm-value">${formatNaira(t.valueN)}</span></div>
            <div><span class="pm-label">Cost basis</span><span class="pm-value">${formatNaira(t.costN)}</span></div>
            <div><span class="pm-label">Unrealised</span><span class="pm-value ${up ? 'text-success' : 'text-danger'}">${up ? '+' : ''}${formatNaira(t.unrealized)} (${plPct}%)</span></div>
            <div><span class="pm-label">Realised</span><span class="pm-value ${t.realized >= 0 ? 'text-success' : 'text-danger'}">${t.realized >= 0 ? '+' : ''}${formatNaira(t.realized)}</span></div>
        </div>
        ${hasUsd ? `
        <div class="portfolio-fx">
            <label for="usd-rate-input">₦ per US$1</label>
            <span class="input-prefix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" id="usd-rate-input" min="0" step="0.01" value="${invRate() || ''}" placeholder="e.g. 1600">
            </span>
            ${t.missingRate ? '<span class="pill pill-due">rate needed</span>' : ''}
        </div>` : ''}
    `;
    const rateInput = document.getElementById('usd-rate-input');
    if (rateInput) rateInput.addEventListener('change', () => {
        const v = parseFloat(rateInput.value);
        state.settings.usdRate = (isNaN(v) || v <= 0) ? null : v;
        saveData();
        renderInvestmentsView();
        updateDashboard();
    });
}

function renderHoldingsList() {
    const box = document.getElementById('holdings-list');
    if (!box) return;
    box.innerHTML = '';
    if (state.investments.holdings.length === 0) {
        box.innerHTML = placeholder('fa-arrow-trend-up', 'No holdings yet. Use “Add Holding”.');
        return;
    }
    state.investments.holdings.forEach(h => box.appendChild(holdingCard(h)));
}

function holdingCard(h) {
    const sym = h.currency === 'USD' ? '$' : '₦';
    const valueLocal = h.units * h.currentPrice;
    const costLocal = h.units * h.avgCost;
    const plLocal = valueLocal - costLocal;
    const plPct = costLocal > 0 ? Math.round(plLocal / costLocal * 100) : 0;
    const up = plLocal >= 0;
    const nairaValue = holdingValueNaira(h);
    const acts = state.investments.activity.filter(a => a.holdingId === h.id)
        .slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const history = acts.length
        ? acts.map(a => `<li>
            <span>${shortDate(a.date)}</span>
            <span>${a.type}${a.type !== 'dividend' ? ` ${a.units} @ ${sym}${a.pricePerUnit}` : ''}</span>
            <span class="debt-hist-note">${sym}${Math.round(a.amount).toLocaleString()}${a.type === 'sell' && a.realizedPL ? ` &bull; P/L ${sym}${Math.round(a.realizedPL).toLocaleString()}` : ''}</span>
          </li>`).join('')
        : '<li class="subtle">No activity recorded.</li>';

    const card = document.createElement('div');
    card.className = 'holding-card glass-card';
    card.innerHTML = `
        <div class="holding-head">
            <div class="holding-title">
                <span class="holding-name">${escapeHtml(h.name)} ${h.ticker ? `<span class="holding-ticker">${escapeHtml(h.ticker)}</span>` : ''}</span>
                <span class="holding-meta">${h.units} units &bull; avg ${sym}${h.avgCost} &bull; ${escapeHtml(h.account || 'account n/a')} &bull; ${h.currency}</span>
            </div>
            <div class="holding-value">
                <span>${sym}${Math.round(valueLocal).toLocaleString()}</span>
                ${nairaValue !== null && h.currency === 'USD' ? `<span class="holding-value-naira">≈ ${formatNaira(nairaValue)}</span>` : ''}
            </div>
        </div>
        <div class="holding-price-row">
            <label>Price ${sym}</label>
            <input type="number" class="holding-price-input" min="0" step="0.01" value="${h.currentPrice}" onchange="setHoldingPrice('${h.id}', this.value)">
            <span class="holding-pl ${up ? 'text-success' : 'text-danger'}">${up ? '+' : ''}${sym}${Math.round(plLocal).toLocaleString()} (${plPct}%)</span>
        </div>
        <details class="debt-history"><summary>Activity (${acts.length})</summary><ul>${history}</ul></details>
        <div class="debt-card-actions">
            <button class="btn btn-primary btn-sm" onclick="openActivityModal('${h.id}','buy')">Buy</button>
            <button class="btn btn-outline btn-sm" onclick="openActivityModal('${h.id}','sell')">Sell</button>
            <button class="btn btn-outline btn-sm" onclick="openActivityModal('${h.id}','dividend')">Dividend</button>
            <button class="btn btn-outline btn-sm" onclick="openHoldingModal('${h.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn-action btn-action-delete" onclick="deleteHolding('${h.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    `;
    return card;
}

window.setHoldingPrice = function(id, val) {
    const h = state.investments.holdings.find(x => x.id === id);
    if (!h) return;
    const v = parseFloat(val);
    if (isNaN(v) || v < 0) return;
    h.currentPrice = v;
    saveData();
    renderInvestmentsView();
    updateDashboard();
};

const holdingModal = document.getElementById('holding-modal');
let editingHoldingId = null;

function openHoldingModal(id = null) {
    const h = id ? state.investments.holdings.find(x => x.id === id) : null;
    editingHoldingId = h ? h.id : null;
    document.getElementById('holding-modal-title').textContent = h ? 'Edit Holding' : 'Add Holding';
    document.querySelector(`input[name="holding-ccy"][value="${h ? h.currency : 'NGN'}"]`).checked = true;
    document.getElementById('holding-name').value = h ? h.name : '';
    document.getElementById('holding-ticker').value = h ? (h.ticker || '') : '';
    document.getElementById('holding-account').value = h ? (h.account || '') : '';
    document.getElementById('holding-units').value = h ? h.units : '';
    document.getElementById('holding-avgcost').value = h ? h.avgCost : '';
    document.getElementById('holding-price').value = h ? h.currentPrice : '';
    document.getElementById('holding-notes').value = h ? (h.notes || '') : '';
    holdingModal.classList.add('active');
}
window.openHoldingModal = openHoldingModal;
function closeHoldingModal() { holdingModal.classList.remove('active'); editingHoldingId = null; }

document.getElementById('holding-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const currency = document.querySelector('input[name="holding-ccy"]:checked').value;
    const name = document.getElementById('holding-name').value.trim();
    const ticker = document.getElementById('holding-ticker').value.trim().toUpperCase();
    const account = document.getElementById('holding-account').value.trim();
    const units = parseFloat(document.getElementById('holding-units').value);
    const avgCost = parseFloat(document.getElementById('holding-avgcost').value);
    const currentPriceRaw = parseFloat(document.getElementById('holding-price').value);
    const notes = document.getElementById('holding-notes').value.trim();
    if (!name || isNaN(units) || units < 0 || isNaN(avgCost) || avgCost < 0) {
        showToast('Fill in name, units and average cost', 'danger');
        return;
    }
    const currentPrice = isNaN(currentPriceRaw) ? avgCost : currentPriceRaw;
    if (editingHoldingId) {
        const h = state.investments.holdings.find(x => x.id === editingHoldingId);
        if (h) Object.assign(h, { currency, name, ticker, account, units, avgCost, currentPrice, notes });
    } else {
        state.investments.holdings.push({ id: makeId('hold'), currency, name, ticker, account, units, avgCost, currentPrice, notes });
    }
    saveData();
    closeHoldingModal();
    renderInvestmentsView();
    updateDashboard();
    showToast('Holding saved', 'success');
});

window.deleteHolding = function(id) {
    if (!confirm('Delete this holding and its recorded activity? Cash transactions already logged stay.')) return;
    state.investments.holdings = state.investments.holdings.filter(h => h.id !== id);
    state.investments.activity = state.investments.activity.filter(a => a.holdingId !== id);
    saveData();
    renderInvestmentsView();
    updateDashboard();
    showToast('Holding removed', 'success');
};

const activityModal = document.getElementById('activity-modal');
let activityHoldingId = null;

function syncActivityFields() {
    const t = document.querySelector('input[name="activity-type"]:checked').value;
    const hide = t === 'dividend';
    document.getElementById('activity-units-group').hidden = hide;
    document.getElementById('activity-price-group').hidden = hide;
    document.getElementById('activity-log-tx-label').textContent = t === 'dividend'
        ? 'Log dividend as income'
        : (t === 'buy' ? 'Also log the purchase as a cash expense' : 'Also log the proceeds as cash income');
}

function recalcActivityAmount() {
    const t = document.querySelector('input[name="activity-type"]:checked').value;
    if (t === 'dividend') return;
    const units = parseFloat(document.getElementById('activity-units').value) || 0;
    const price = parseFloat(document.getElementById('activity-price').value) || 0;
    const fee = parseFloat(document.getElementById('activity-fee').value) || 0;
    const gross = units * price;
    document.getElementById('activity-amount').value = (t === 'buy' ? gross + fee : Math.max(0, gross - fee)).toFixed(2);
}

function openActivityModal(holdingId, type) {
    const h = state.investments.holdings.find(x => x.id === holdingId);
    if (!h) return;
    activityHoldingId = holdingId;
    document.getElementById('activity-modal-title').textContent =
        `${type[0].toUpperCase() + type.slice(1)} — ${h.name}`;
    document.querySelector(`input[name="activity-type"][value="${type}"]`).checked = true;
    document.getElementById('activity-units').value = type === 'sell' ? h.units : (type === 'dividend' ? '' : '');
    document.getElementById('activity-price').value = type === 'dividend' ? '' : h.currentPrice;
    document.getElementById('activity-fee').value = '';
    document.getElementById('activity-amount').value = '';
    document.getElementById('activity-date').value = todayISO();
    document.getElementById('activity-note').value = '';
    document.getElementById('activity-log-tx').checked = (type === 'dividend');
    syncActivityFields();
    recalcActivityAmount();
    activityModal.classList.add('active');
}
window.openActivityModal = openActivityModal;
function closeActivityModal() { activityModal.classList.remove('active'); activityHoldingId = null; }

['activity-units', 'activity-price', 'activity-fee'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalcActivityAmount);
});
document.querySelectorAll('input[name="activity-type"]').forEach(r => r.addEventListener('change', () => {
    syncActivityFields();
    recalcActivityAmount();
}));

document.getElementById('activity-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const h = state.investments.holdings.find(x => x.id === activityHoldingId);
    if (!h) return;
    const type = document.querySelector('input[name="activity-type"]:checked').value;
    const units = parseFloat(document.getElementById('activity-units').value) || 0;
    const price = parseFloat(document.getElementById('activity-price').value) || 0;
    const fee = parseFloat(document.getElementById('activity-fee').value) || 0;
    const amount = parseFloat(document.getElementById('activity-amount').value);
    const date = document.getElementById('activity-date').value;
    const note = document.getElementById('activity-note').value.trim();
    const logTx = document.getElementById('activity-log-tx').checked;

    if (!date || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount and date', 'danger'); return; }
    if (type !== 'dividend' && units <= 0) { showToast('Enter the number of units', 'danger'); return; }
    if (type === 'sell' && units > h.units) { showToast(`You only hold ${h.units} units`, 'danger'); return; }

    let realizedPL = 0;
    if (type === 'buy') {
        const newUnits = h.units + units;
        h.avgCost = newUnits > 0 ? (h.units * h.avgCost + units * price) / newUnits : price;
        h.units = newUnits;
    } else if (type === 'sell') {
        realizedPL = (price - h.avgCost) * units - fee;
        h.units = Math.max(0, h.units - units);
    }

    let txId = null;
    if (logTx) {
        txId = makeId('tx');
        const isIncome = (type === 'sell' || type === 'dividend');
        state.transactions.push({
            id: txId,
            title: `${h.name} — ${type}`,
            type: isIncome ? 'income' : 'expense',
            amount: toNaira(amount, h.currency) || amount,
            categoryId: isIncome ? 'cat-investments' : 'cat-invest',
            date, notes: note
        });
    }

    state.investments.activity.push({
        id: makeId('ia'), holdingId: h.id, type, units, pricePerUnit: price,
        amount, fee, date, note, txId, realizedPL
    });
    touchStreak();
    saveData();
    closeActivityModal();
    renderInvestmentsView();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
    showToast(`${type[0].toUpperCase() + type.slice(1)} recorded`, 'success');
});

// --- Subscription detection (derived, read-only) ---
function detectSubscriptions() {
    const norm = (s) => s.toLowerCase().replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim();
    const groups = {};
    state.transactions.filter(t => t.type === 'expense').forEach(t => {
        const key = norm(t.title || '');
        if (!key) return;
        (groups[key] = groups[key] || []).push(t);
    });
    const subs = [];
    Object.values(groups).forEach(txs => {
        const months = new Set(txs.map(t => (t.date || '').slice(0, 7)));
        if (months.size < 2) return;
        const amounts = txs.map(t => t.amount);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        if (mean <= 0 || (Math.max(...amounts) - Math.min(...amounts)) / mean > 0.35) return;
        const latest = txs.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        subs.push({ title: latest.title, monthly: mean, count: txs.length, last: latest.date, categoryId: latest.categoryId });
    });
    return subs.sort((a, b) => b.monthly - a.monthly);
}

function renderSubscriptions() {
    const box = document.getElementById('subscriptions-list');
    if (!box) return;
    const subs = detectSubscriptions();
    if (subs.length === 0) {
        box.innerHTML = placeholder('fa-rotate', 'No recurring charges spotted yet — they show up once a similar expense repeats across 2+ months.');
        return;
    }
    const total = subs.reduce((s, x) => s + x.monthly, 0);
    box.innerHTML = subs.map(s => {
        const cat = catById(s.categoryId);
        return `<div class="subscription-row">
            <span class="subscription-icon" style="background:${cat.color}15;color:${cat.color}"><i class="${cat.icon}"></i></span>
            <span class="subscription-name">${escapeHtml(s.title)}</span>
            <span class="subscription-meta">${s.count}&times; &bull; last ${shortDate(s.last)}</span>
            <span class="subscription-amount">${formatNaira(s.monthly)}/mo</span>
        </div>`;
    }).join('') + `<div class="subscription-total">≈ ${formatNaira(total)}/month &bull; ${formatNaira(total * 12)}/year on recurring charges</div>`;
}

// --- "Add" buttons on the new views ---
document.getElementById('btn-add-income-source').addEventListener('click', () => openIncomeSourceModal());
document.getElementById('btn-add-quick-add').addEventListener('click', () => openQuickAddModal());
document.getElementById('btn-add-debt').addEventListener('click', () => openDebtModal());
document.getElementById('btn-add-goal').addEventListener('click', () => openGoalModal());
document.getElementById('btn-add-holding').addEventListener('click', () => openHoldingModal());

// --- Mobile "More" menu + dashboard "Manage/View" shortcuts ---
document.querySelectorAll('.more-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.getAttribute('data-tab')));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.getAttribute('data-goto')));
});

// --- Backdrop / Escape dismissal for the new modals ---
const HABIT_MODALS = [incomeSourceModal, logPaymentModal, quickAddModal, debtModal, debtPaymentModal,
    goalModal, contributeModal, fundGoalsModal, holdingModal, activityModal];
HABIT_MODALS.forEach(m => {
    if (!m) return;
    m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('active');
    });
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') HABIT_MODALS.forEach(m => m && m.classList.remove('active'));
});

// --- App Bootstrap ---
window.addEventListener('DOMContentLoaded', () => {
    updateDateDisplay();
    loadData();
    populateDropdowns();
    updateDashboard();
});
