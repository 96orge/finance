// --- Application State ---
let state = {
    transactions: [],
    categories: [],
    budgets: {},        // Maps categoryId to monthly limit amount
    incomeSources: [],  // Recurring income (salary, NYSC allowance, ...)
    quickAdds: [],      // One-tap transaction templates (transport, data, ...)
    debts: [],          // Money owed / owed to you, paid down incrementally
    settings: {}        // App-wide preferences (wantsMonthlyCap, ...)
};

const DEFAULT_SETTINGS = {
    wantsMonthlyCap: null // ₦ ceiling for 'want' spending each month; null = off
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
    state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings || {});

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
    ['cat-debt', 'cat-career', 'cat-allowance'].forEach(id => {
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
        }
    ];
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
    debts: 'Debts',
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
    renderRecurringIncomeWidget();
    renderQuickAddWidget();
    renderNeedsWantsWidget();
    renderDebtWidget();
    renderRecentTransactions();
    renderDashboardBudgets();
    renderCharts();
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
    const emptyState = document.getElementById('empty-transactions-state');
    tbody.innerHTML = '';

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
    if (confirm("CAUTION: This will delete ALL transactions, custom categories, budgets, income sources, quick-add buttons and debts permanently. Do you wish to proceed?")) {
        localStorage.removeItem('96orge_budget_state');
        state = {
            transactions: [],
            categories: [...DEFAULT_CATEGORIES],
            budgets: {},
            incomeSources: [],
            quickAdds: [],
            debts: [],
            settings: { ...DEFAULT_SETTINGS }
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
    saveData();
    closeLogPaymentModal();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
    showToast(`${formatNaira(amount)} added to income`, 'success');
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

function renderDebtWidget() {
    const box = document.getElementById('dashboard-debt-list');
    if (!box) return;

    if (state.debts.length === 0) {
        box.innerHTML = placeholder('fa-hand-holding-dollar', 'No debts tracked. Add what you owe to pay it down bit by bit.');
        return;
    }

    const iOwe = state.debts.filter(d => d.kind === 'iOwe' && d.status === 'active');
    if (iOwe.length === 0) {
        box.innerHTML = placeholder('fa-circle-check', 'Nothing outstanding that you owe.');
        return;
    }

    const totalOwed = iOwe.reduce((s, d) => s + debtRemaining(d), 0);
    const withDue = iOwe.filter(d => d.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const focus = withDue[0] || iOwe.slice().sort((a, b) => debtRemaining(a) - debtRemaining(b))[0];

    let html = `<div class="debt-widget-total">You owe <strong>${formatNaira(totalOwed)}</strong> across ${iOwe.length} debt${iOwe.length > 1 ? 's' : ''}</div>`;
    if (focus) {
        const pct = Math.round((debtPaid(focus) / focus.originalAmount) * 100);
        html += `
            <div class="debt-focus">
                <div class="debt-focus-row">
                    <span>${escapeHtml(focus.name)}${focus.dueDate ? ` &bull; due ${new Date(focus.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
                    <span>${formatNaira(debtRemaining(focus))} left</span>
                </div>
                <div class="budget-progress-track"><div class="budget-progress-bar progress-safe" style="width:${Math.min(100, pct)}%"></div></div>
                <button class="btn btn-primary btn-sm" onclick="openDebtPaymentModal('${focus.id}')"><i class="fa-solid fa-coins"></i> Record Payment</button>
            </div>`;
    }
    box.innerHTML = html;
}

function renderDebtsView() {
    const box = document.getElementById('debts-list');
    if (!box) return;
    box.innerHTML = '';

    if (state.debts.length === 0) {
        box.innerHTML = placeholder('fa-hand-holding-dollar', 'No debts yet. Use “Add Debt” to track money you owe or money owed to you.');
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

    const settledNow = debtRemaining(d) <= 0 && d.status !== 'settled';
    if (settledNow) d.status = 'settled';

    saveData();
    closeDebtPaymentModal();
    renderDebtsView();
    updateDashboard();
    if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList();
    showToast(settledNow ? `${d.name} is fully settled!` : `Payment of ${formatNaira(amount)} recorded`, 'success');
});

// --- "Add" buttons on the new views ---
document.getElementById('btn-add-income-source').addEventListener('click', () => openIncomeSourceModal());
document.getElementById('btn-add-quick-add').addEventListener('click', () => openQuickAddModal());
document.getElementById('btn-add-debt').addEventListener('click', () => openDebtModal());

// --- Mobile "More" menu + dashboard "Manage/View" shortcuts ---
document.querySelectorAll('.more-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.getAttribute('data-tab')));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.getAttribute('data-goto')));
});

// --- Backdrop / Escape dismissal for the new modals ---
const HABIT_MODALS = [incomeSourceModal, logPaymentModal, quickAddModal, debtModal, debtPaymentModal];
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
