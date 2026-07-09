// --- Application State ---
let state = {
    transactions: [],
    categories: [],
    budgets: {} // Maps categoryId to limit amount
};

// Chart.js global instances
let categoryChartInstance = null;
let trendChartInstance = null;

// --- Default Base Categories ---
const DEFAULT_CATEGORIES = [
    // Expense Categories
    { id: 'cat-housing', name: 'Housing & Rent', type: 'expense', color: '#3b82f6', icon: 'fa-solid fa-house' },
    { id: 'cat-food', name: 'Food & Dining', type: 'expense', color: '#f59e0b', icon: 'fa-solid fa-utensils' },
    { id: 'cat-transport', name: 'Transportation', type: 'expense', color: '#8b5cf6', icon: 'fa-solid fa-car' },
    { id: 'cat-entertainment', name: 'Entertainment', type: 'expense', color: '#f43f5e', icon: 'fa-solid fa-gamepad' },
    { id: 'cat-utilities', name: 'Utilities', type: 'expense', color: '#06b6d4', icon: 'fa-solid fa-bolt' },
    { id: 'cat-healthcare', name: 'Healthcare', type: 'expense', color: '#10b981', icon: 'fa-solid fa-heart-pulse' },
    { id: 'cat-misc', name: 'Miscellaneous', type: 'expense', color: '#64748b', icon: 'fa-solid fa-circle-nodes' },
    // Income Categories
    { id: 'cat-salary', name: 'Salary', type: 'income', color: '#10b981', icon: 'fa-solid fa-briefcase' },
    { id: 'cat-freelance', name: 'Freelance & Projects', type: 'income', color: '#14b8a6', icon: 'fa-solid fa-laptop-code' },
    { id: 'cat-investments', name: 'Investments', type: 'income', color: '#6366f1', icon: 'fa-solid fa-piggy-bank' },
    { id: 'cat-gift', name: 'Gifts & Others', type: 'income', color: '#ec4899', icon: 'fa-solid fa-gift' }
];

// --- Initialization & Local Storage ---
function loadData() {
    try {
        const saved = localStorage.getItem('96orge_budget_state');
        if (saved) {
            state = JSON.parse(saved);
            if (!state.transactions) state.transactions = [];
            if (!state.categories || state.categories.length === 0) state.categories = [...DEFAULT_CATEGORIES];
            if (!state.budgets) state.budgets = {};
        } else {
            state.categories = [...DEFAULT_CATEGORIES];
            loadSampleData();
        }
    } catch (e) {
        console.error("Error loading data from local storage, resetting defaults:", e);
        state.categories = [...DEFAULT_CATEGORIES];
    }
}

function saveData() {
    localStorage.setItem('96orge_budget_state', JSON.stringify(state));
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
}

// --- App Layout Navigation ---
const NAV_BUTTONS = document.querySelectorAll('.nav-btn');
const VIEWS = document.querySelectorAll('.app-view');
const PAGE_TITLE = document.getElementById('page-title');

NAV_BUTTONS.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (!targetTab) return;

        NAV_BUTTONS.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        VIEWS.forEach(view => {
            view.classList.remove('active');
            if (view.id === `view-${targetTab}`) {
                view.classList.add('active');
            }
        });

        if (targetTab === 'dashboard') PAGE_TITLE.textContent = 'Dashboard';
        else if (targetTab === 'transactions') PAGE_TITLE.textContent = 'Transactions';
        else if (targetTab === 'categories') PAGE_TITLE.textContent = 'Categories & Budgets';
        else if (targetTab === 'settings') PAGE_TITLE.textContent = 'Data Management';

        if (targetTab === 'dashboard') {
            updateDashboard();
        } else if (targetTab === 'transactions') {
            renderTransactionsList();
            populateFilterCategories();
        } else if (targetTab === 'categories') {
            renderCategoriesManager();
            renderBudgetsManager();
            populateDropdowns();
        }
    });
});

// Shortcut button redirects
document.getElementById('btn-view-all-transactions').addEventListener('click', () => {
    document.querySelector('.nav-btn[data-tab="transactions"]').click();
});
document.getElementById('btn-quick-manage-budgets').addEventListener('click', () => {
    document.querySelector('.nav-btn[data-tab="categories"]').click();
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

// --- Dynamic Visual Updates (Stats & Visualizations) ---
function updateDashboard() {
    updateDashboardStats();
    renderRecentTransactions();
    renderDashboardBudgets();
    renderCharts();
}

function updateDashboardStats() {
    const transactions = state.transactions;
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

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

    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

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
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

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

    let filtered = state.transactions.filter(tx => {
        const cat = state.categories.find(c => c.id === tx.categoryId) || { name: '' };
        
        const matchSearch = tx.title.toLowerCase().includes(searchValue) || 
                            cat.name.toLowerCase().includes(searchValue) || 
                            (tx.notes && tx.notes.toLowerCase().includes(searchValue));

        const matchType = typeValue === 'all' || tx.type === typeValue;
        const matchCat = catValue === 'all' || tx.categoryId === catValue;

        return matchSearch && matchType && matchCat;
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
            </td>
            <td>
                <span class="badge ${badgeTypeClass}">${typeLabel}</span>
            </td>
            <td class="text-right ${amountClass}" style="font-weight: 600">
                ${amountSign}${formatNaira(tx.amount)}
            </td>
            <td class="text-center">
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
    renderTransactionsList();
});

document.getElementById('tx-search').addEventListener('input', renderTransactionsList);
document.getElementById('filter-type').addEventListener('change', renderTransactionsList);
document.getElementById('filter-category').addEventListener('change', renderTransactionsList);
document.getElementById('filter-sort').addEventListener('change', renderTransactionsList);

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

        const card = document.createElement('div');
        card.className = 'category-manager-card';
        card.innerHTML = `
            <div class="category-manager-icon" style="background: ${cat.color}15; color: ${cat.color}">
                <i class="${cat.icon}"></i>
            </div>
            <div class="category-manager-name">${escapeHtml(cat.name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: -4px;">${usages} items</div>
            <div class="category-manager-actions">
                <button class="btn-card-action btn-card-action-delete" onclick="deleteCategory('${cat.id}')" title="Delete Category">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

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

function openTxModal() {
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('tx-title').value = '';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-notes').value = '';
    document.getElementById('type-expense').checked = true;
    toggleTxModalCategories();
    txModal.classList.add('active');
}

function closeTxModal() {
    txModal.classList.remove('active');
}

openTxModalBtn.addEventListener('click', openTxModal);
closeTxModalBtn.addEventListener('click', closeTxModal);
cancelTxModalBtn.addEventListener('click', closeTxModal);

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

    const txId = 'tx-' + Date.now() + Math.random().toString(36).substr(2, 4);

    const newTx = {
        id: txId,
        title,
        type,
        amount,
        categoryId,
        date,
        notes
    };

    state.transactions.push(newTx);
    saveData();
    closeTxModal();
    updateDashboard();
    showToast("Transaction saved successfully", "success");
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
    document.getElementById('cat-icon').selectedIndex = 0;
    catModal.classList.add('active');
}

function closeCatModal() {
    catModal.classList.remove('active');
}

openCatModalBtn.addEventListener('click', openCatModal);
closeCatModalBtn.addEventListener('click', closeCatModal);
cancelCatModalBtn.addEventListener('click', closeCatModal);

document.getElementById('category-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const type = document.querySelector('input[name="cat-type"]:checked').value;
    const name = document.getElementById('cat-name').value.trim();
    const color = catColorInput.value;
    const icon = document.getElementById('cat-icon').value;

    if (!name) {
        showToast("Please enter a category name", "danger");
        return;
    }

    const catId = 'cat-' + Date.now();

    const newCat = {
        id: catId,
        name,
        type,
        color,
        icon
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
                saveData();
                showToast("Database restored successfully!", "success");
                
                // Refresh App states
                updateDashboard();
                populateDropdowns();
                renderCategoriesManager();
                renderBudgetsManager();
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
    if (confirm("CAUTION: This will delete ALL transactions, custom categories, and budgets permanently. Do you wish to proceed?")) {
        localStorage.removeItem('96orge_budget_state');
        state.transactions = [];
        state.categories = [...DEFAULT_CATEGORIES];
        state.budgets = {};
        saveData();
        showToast("Workspace database reset", "warning");

        // Reload views
        updateDashboard();
        populateDropdowns();
        renderCategoriesManager();
        renderBudgetsManager();
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

// --- App Bootstrap ---
window.addEventListener('DOMContentLoaded', () => {
    updateDateDisplay();
    loadData();
    populateDropdowns();
    updateDashboard();
});
