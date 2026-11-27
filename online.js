// ============================================================================
//  Online features: live prices, the Claude assistant, and encrypted cloud
//  backup & sync. Every feature here is opt-in. With nothing set up, this file
//  makes no network requests at all, except the ₦/$ rate (public data, no
//  personal information) when the user holds US stocks.
//
//  Loaded after app.js, so it can use app.js's globals (state, saveData,
//  showToast, formatNaira, ...). Keys, tokens and the sync passphrase live in
//  their own localStorage entry, never in `state`, so they are never exported,
//  backed up, or sent to Claude.
// ============================================================================
(function () {
    'use strict';

    const CONN_KEY = 'steady_connections';
    const DEFAULT_MODEL = 'claude-opus-5-5';
    const FX_URL = 'https://open.er-api.com/v6/latest/USD';
    const FX_MAX_AGE_MS = 6 * 60 * 60 * 1000;      // refresh the ₦/$ rate at most every 6 hours
    const PRICES_MAX_AGE_MS = 60 * 60 * 1000;      // auto-refresh US prices at most hourly
    const GIST_FILE = 'steady-backup.json';
    const GIST_DESCRIPTION = 'Steady encrypted backup';
    const PBKDF2_ITERATIONS = 310000;
    const SYNC_DEBOUNCE_MS = 15000;

    // ------------------------------------------------------------------
    // Connection settings (device-local, never part of `state`)
    // ------------------------------------------------------------------
    function loadConn() {
        let c = {};
        try { c = JSON.parse(localStorage.getItem(CONN_KEY)) || {}; } catch (e) { c = {}; }
        return Object.assign({
            aiKey: '', aiModel: DEFAULT_MODEL,
            finnhubKey: '', fxAuto: true, fxUpdatedAt: null, pricesUpdatedAt: null,
            sync: {}
        }, c, { sync: Object.assign({ token: '', passphrase: '', gistId: null, auto: true, lastSyncedAt: null, dirty: false }, c.sync || {}) });
    }
    let conn = loadConn();
    function saveConn() { localStorage.setItem(CONN_KEY, JSON.stringify(conn)); }

    const aiReady = () => Boolean(conn.aiKey);
    const syncReady = () => Boolean(conn.sync.token && conn.sync.passphrase);

    function timeAgo(ts) {
        if (!ts) return 'never';
        const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return `${hrs} h ago`;
        return `${Math.round(hrs / 24)} d ago`;
    }

    // Re-render whatever is on screen after data changed underneath it.
    function rerender() {
        try { updateDashboard(); } catch (e) { /* view not ready */ }
        try { if (document.getElementById('view-investments').classList.contains('active')) renderInvestmentsView(); } catch (e) { /* ignore */ }
        try { if (document.getElementById('view-transactions').classList.contains('active')) renderTransactionsList(); } catch (e) { /* ignore */ }
    }

    // ------------------------------------------------------------------
    // Hook saveData so cloud sync knows when there is something new to back up.
    // ------------------------------------------------------------------
    const baseSaveData = saveData;
    let syncTimer = null;
    let booted = false; // app.js saves once while starting up; that isn't a user change
    const saveListeners = []; // see steadyOnline.onSaved below
    saveData = function () {
        baseSaveData();
        saveListeners.forEach(fn => { try { fn(); } catch (e) { console.warn('A save listener failed:', e); } });
        if (booted && syncReady() && conn.sync.auto && !applyingRemote) {
            conn.sync.dirty = true;
            saveConn();
            clearTimeout(syncTimer);
            syncTimer = setTimeout(() => backupNow({ quiet: true }), SYNC_DEBOUNCE_MS);
        }
    };
    let applyingRemote = false;

    // ==================================================================
    // 1. Live ₦/$ rate
    // ==================================================================
    const hasUsdHoldings = () => state.investments.holdings.some(h => h.currency === 'USD');

    async function refreshFx({ force = false } = {}) {
        if (!force && (!conn.fxAuto || !hasUsdHoldings())) return false;
        if (!force && conn.fxUpdatedAt && Date.now() - conn.fxUpdatedAt < FX_MAX_AGE_MS && state.settings.usdRate) return false;
        try {
            const res = await fetch(FX_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const ngn = json && json.rates && json.rates.NGN;
            if (json.result !== 'success' || !(ngn > 0)) throw new Error('No NGN rate in response');
            state.settings.usdRate = Math.round(ngn * 100) / 100;
            conn.fxUpdatedAt = Date.now();
            saveConn();
            saveData();
            rerender();
            return true;
        } catch (e) {
            console.warn('₦/$ rate update failed:', e);
            if (force) showToast("Couldn't fetch the ₦/$ rate. Check your connection and try again.", 'danger');
            return false;
        }
    }

    // Typing a rate yourself means you want that rate, so stop overwriting it.
    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'usd-rate-input' && conn.fxAuto) {
            conn.fxAuto = false;
            saveConn();
            renderOnlineSettings();
            showToast('Using your rate. Automatic ₦/$ updates are now off (turn them back on in Data & Backup).', 'warning');
        }
    }, true);

    // ==================================================================
    // 2. Live stock prices
    // ==================================================================
    async function refreshUsdPrices() {
        const targets = state.investments.holdings.filter(h => h.currency === 'USD' && h.ticker);
        if (!conn.finnhubKey || targets.length === 0) return { updated: 0, failed: [] };
        let updated = 0;
        const failed = [];
        await Promise.all(targets.map(async (h) => {
            try {
                const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(h.ticker)}&token=${encodeURIComponent(conn.finnhubKey)}`;
                const res = await fetch(url);
                if (res.status === 401 || res.status === 403) throw new Error('key');
                const q = await res.json();
                if (!(q && q.c > 0)) throw new Error('no price');
                h.currentPrice = q.c;
                updated++;
            } catch (e) {
                failed.push(e.message === 'key' ? `${h.ticker} (key rejected)` : h.ticker);
            }
        }));
        return { updated, failed };
    }

    // NGX has no free price API, so Claude looks prices up with web search.
    // Implausible results (a >60% jump from the price on file) are skipped.
    async function refreshNgxPrices() {
        const targets = state.investments.holdings.filter(h => h.currency !== 'USD' && (h.ticker || h.name));
        if (!aiReady() || targets.length === 0) return { updated: 0, failed: [], skipped: [] };
        const list = targets.map(h => `- ${h.ticker || '(no ticker)'}: ${h.name}`).join('\n');
        const model = conn.aiModel || DEFAULT_MODEL;
        const webSearchType = model.startsWith('claude-haiku') ? 'web_search_20250305' : 'web_search_20260209';
        const params = {
            ...baseParams(),
            max_tokens: 16000,
            output_config: { effort: 'low' },
            tools: [{ type: webSearchType, name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'NG' } }],
            system: 'You look up share prices on the Nigerian Exchange (NGX). Use web search to find the most recent closing price in naira for each stock. Prefer ngxgroup.com, african-markets.com, or major Nigerian financial news. Never guess: if you cannot find a recent price, use null.',
            messages: [{
                role: 'user',
                content: `Find the latest NGX closing price (₦ per share) for each of these holdings:\n${list}\n\nWhen done, end your reply with only this JSON on its own line:\n{"prices":[{"ticker":"MTNN","price":235.5,"date":"YYYY-MM-DD"}]}\nUse the ticker as I wrote it (or the company name if there is no ticker), and price null when not found.`
            }]
        };
        const client = await getClient();
        let response = await client.beta.messages.create(params);
        // Server tools may pause a long turn; continue it a few times.
        for (let i = 0; i < 3 && response.stop_reason === 'pause_turn'; i++) {
            params.messages = [...params.messages, { role: 'assistant', content: response.content }];
            response = await client.beta.messages.create(params);
        }
        if (response.stop_reason === 'refusal') throw new Error('Claude declined this request.');
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        const match = text.match(/\{[^{}]*"prices"\s*:\s*\[[\s\S]*?\]\s*\}/);
        if (!match) throw new Error('Claude did not return prices.');
        const prices = JSON.parse(match[0]).prices || [];
        let updated = 0;
        const failed = [], skipped = [];
        targets.forEach(h => {
            const key = (h.ticker || h.name || '').toUpperCase();
            const p = prices.find(x => String(x.ticker || '').toUpperCase() === key);
            if (!p || !(p.price > 0)) { failed.push(h.ticker || h.name); return; }
            if (h.currentPrice > 0 && Math.abs(p.price - h.currentPrice) / h.currentPrice > 0.6) {
                skipped.push(`${h.ticker || h.name} (₦${p.price}?)`);
                return;
            }
            h.currentPrice = Math.round(p.price * 100) / 100;
            updated++;
        });
        return { updated, failed, skipped };
    }

    let pricesBusy = false;
    async function refreshAllPrices({ includeNgx = true, quiet = false } = {}) {
        if (pricesBusy) return;
        pricesBusy = true;
        decorateInvestments();
        const notes = [];
        let total = 0;
        try {
            await refreshFx({ force: conn.fxAuto });
            const usd = await refreshUsdPrices();
            total += usd.updated;
            if (usd.failed.length) notes.push(`no US price for ${usd.failed.join(', ')}`);
            if (includeNgx && aiReady()) {
                try {
                    const ngx = await refreshNgxPrices();
                    total += ngx.updated;
                    if (ngx.failed.length) notes.push(`no NGX price for ${ngx.failed.join(', ')}`);
                    if (ngx.skipped.length) notes.push(`skipped unlikely prices: ${ngx.skipped.join(', ')}`);
                } catch (e) {
                    notes.push(`NGX look-up failed: ${friendlyAiError(e)}`);
                }
            }
            if (total > 0) {
                conn.pricesUpdatedAt = Date.now();
                saveConn();
                saveData();
            }
            if (!quiet) {
                const msg = total > 0 ? `Updated ${total} price${total === 1 ? '' : 's'}` : 'No prices were updated';
                showToast(notes.length ? `${msg}; ${notes.join('; ')}.` : `${msg}.`, notes.length ? 'warning' : 'success');
            }
        } finally {
            pricesBusy = false;
            rerender();
            decorateInvestments();
        }
    }

    // Add a live-prices bar to the Portfolio card each time it renders.
    function decorateInvestments() {
        const summary = document.getElementById('portfolio-summary');
        if (!summary || state.investments.holdings.length === 0) return;
        let bar = document.getElementById('online-prices-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'online-prices-bar';
            bar.className = 'online-prices-bar';
            summary.appendChild(bar);
        }
        const hasUsd = hasUsdHoldings();
        const hasNgn = state.investments.holdings.some(h => h.currency !== 'USD');
        const canRefresh = (hasUsd && (conn.fxAuto || conn.finnhubKey)) || (hasNgn && aiReady());
        const bits = [];
        if (hasUsd) bits.push(conn.fxAuto ? `₦/$ rate: live, updated ${timeAgo(conn.fxUpdatedAt)}` : '₦/$ rate: set by you');
        if (conn.pricesUpdatedAt) bits.push(`prices updated ${timeAgo(conn.pricesUpdatedAt)}`);
        if (!canRefresh) bits.push('turn on live prices in Data & Backup');
        bar.innerHTML = `
            <span class="online-prices-meta"><i class="fa-solid fa-signal" aria-hidden="true"></i> ${escapeHtml(bits.join(' · '))}</span>
            ${canRefresh ? `<button type="button" class="btn btn-outline btn-sm" id="btn-refresh-prices" ${pricesBusy ? 'disabled' : ''}>
                <i class="fa-solid fa-rotate${pricesBusy ? ' fa-spin' : ''}" aria-hidden="true"></i> ${pricesBusy ? 'Refreshing…' : 'Refresh prices'}
            </button>` : `<button type="button" class="btn-text" id="btn-setup-prices">Set up</button>`}`;
        const refreshBtn = document.getElementById('btn-refresh-prices');
        if (refreshBtn) refreshBtn.addEventListener('click', () => refreshAllPrices());
        const setupBtn = document.getElementById('btn-setup-prices');
        if (setupBtn) setupBtn.addEventListener('click', () => goToSetting('finnhub-key'));
    }

    const baseRenderInvestmentsView = renderInvestmentsView;
    renderInvestmentsView = function () {
        baseRenderInvestmentsView.apply(this, arguments);
        decorateInvestments();
    };

    // ==================================================================
    // 3. Claude: shared client
    // ==================================================================
    let sdkModule = null;
    async function getClient() {
        if (!aiReady()) throw new Error('NO_KEY');
        if (!sdkModule) sdkModule = await import('./vendor/anthropic-sdk/anthropic-sdk.mjs');
        // The key is the user's own, entered on their own device, so calling the API
        // straight from the browser is the intended set-up here.
        return new sdkModule.Anthropic({ apiKey: conn.aiKey, dangerouslyAllowBrowser: true });
    }

    function baseParams() {
        const model = conn.aiModel || DEFAULT_MODEL;
        const params = { model };
        // If the model declines on safety grounds, let the API retry on a suitable
        // fallback model instead of failing. Haiku has no server-side fallback.
        if (!model.startsWith('claude-haiku')) {
            params.betas = ['server-side-fallback-2026-07-01'];
            params.fallbacks = 'default';
        }
        return params;
    }

    function friendlyAiError(e) {
        const A = sdkModule && sdkModule.Anthropic;
        if (e && e.message === 'NO_KEY') return 'add your Anthropic API key in Data & Backup first';
        if (A) {
            if (e instanceof A.AuthenticationError) return 'your Anthropic API key was rejected; check it in Data & Backup';
            if (e instanceof A.PermissionDeniedError) return 'your API key does not have access to this model';
            if (e instanceof A.RateLimitError) return 'too many requests right now; wait a minute and try again';
            if (e instanceof A.BadRequestError) return `the request was rejected (${e.message})`;
            if (e instanceof A.APIConnectionError) return "couldn't reach Anthropic; check your connection";
            if (e instanceof A.APIError) return `Anthropic returned an error (${e.status || 'unknown'})`;
        }
        return (e && e.message) || 'something went wrong';
    }

    // ==================================================================
    // 3a. Smart add: text / bank alert / receipt photo -> draft transactions
    // ==================================================================
    let smartPhoto = null; // { media_type, data }
    let drafts = [];

    async function imageToBase64(file) {
        // Shrink large phone photos: smaller uploads, same accuracy.
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        return { media_type: 'image/jpeg', data: dataUrl.split(',')[1] };
    }

    function draftSchema() {
        const catIds = state.categories.map(c => c.id);
        const accIds = state.accounts.filter(a => !a.archived).map(a => a.id);
        return {
            type: 'object',
            additionalProperties: false,
            required: ['transactions'],
            properties: {
                transactions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['title', 'type', 'amount', 'date', 'categoryId', 'accountId', 'notes'],
                        properties: {
                            title: { type: 'string', description: 'Short merchant or description, e.g. "Shoprite" or "Salary"' },
                            type: { type: 'string', enum: ['expense', 'income'] },
                            amount: { type: 'number', description: 'Amount in naira, positive' },
                            date: { type: 'string', format: 'date' },
                            categoryId: { type: 'string', enum: catIds },
                            accountId: accIds.length ? { anyOf: [{ type: 'string', enum: accIds }, { type: 'null' }] } : { type: 'null' },
                            notes: { type: 'string' }
                        }
                    }
                }
            }
        };
    }

    async function draftTransactions(text, photo) {
        const today = todayISO();
        const cats = state.categories.map(c => `${c.id}: ${c.name} (${c.type})`).join('\n');
        const accs = state.accounts.filter(a => !a.archived).map(a => `${a.id}: ${a.name} (${a.type})`).join('\n') || '(none)';
        const content = [];
        if (photo) content.push({ type: 'image', source: { type: 'base64', media_type: photo.media_type, data: photo.data } });
        content.push({
            type: 'text',
            text: `Today is ${today}.\n\nCategories:\n${cats}\n\nAccounts:\n${accs}\n\n` +
                (text ? `What the user wrote or pasted:\n<input>\n${text}\n</input>` : 'The user attached a receipt photo and wrote nothing.')
        });
        const client = await getClient();
        const response = await client.beta.messages.create({
            ...baseParams(),
            max_tokens: 16000,
            output_config: { effort: 'low', format: { type: 'json_schema', schema: draftSchema() } },
            system:
                'You turn notes, bank alerts and receipts from a Nigerian user into transactions for their budgeting app. ' +
                'Amounts are in naira: "k" means thousand and "m" means million; ignore commas and the ₦/NGN symbol. ' +
                'Resolve relative dates ("yesterday", "last Friday") from today; when no date is given, use today. ' +
                'A debit alert is an expense and a credit alert is income. Do not create transactions for account balances. ' +
                'List bank charges (VAT, stamp duty, SMS fees) as separate expenses only when an amount is stated. ' +
                'For a receipt, create one expense for the total, with the store as the title and the main items in notes. ' +
                'Pick the closest category of the right type (an expense category for expenses, an income category for income). ' +
                'Match the account by bank or wallet name when it is clear, otherwise use null. ' +
                'Write short titles in the user\'s own words. If there is nothing that describes money moving, return an empty list.',
            messages: [{ role: 'user', content }]
        });
        if (response.stop_reason === 'refusal') throw new Error('Claude declined this request.');
        if (response.stop_reason === 'max_tokens') throw new Error('That was too long to read in one go. Try a shorter piece.');
        const textBlock = response.content.find(b => b.type === 'text');
        const parsed = JSON.parse(textBlock ? textBlock.text : '{}');
        const catIds = new Set(state.categories.map(c => c.id));
        return (parsed.transactions || [])
            .filter(t => t && t.amount > 0 && catIds.has(t.categoryId))
            .map(t => ({ ...t, include: true, date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : today }));
    }

    function renderDrafts(message) {
        const box = document.getElementById('smart-add-results');
        if (!box) return;
        if (message) { box.innerHTML = `<p class="smart-add-message">${message}</p>`; return; }
        if (drafts.length === 0) { box.innerHTML = ''; return; }
        const accounts = state.accounts.filter(a => !a.archived);
        const catOptions = (type, sel) => state.categories.filter(c => c.type === type)
            .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
        const accOptions = (sel) => `<option value="">No account</option>` + accounts
            .map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
        const count = drafts.filter(d => d.include).length;
        box.innerHTML = `
            <h3 class="smart-add-heading">Check before saving</h3>
            <div class="draft-list">
            ${drafts.map((d, i) => `
                <div class="draft-row ${d.include ? '' : 'draft-excluded'}" data-i="${i}">
                    <div class="draft-head">
                        <label class="draft-include"><input type="checkbox" data-f="include" ${d.include ? 'checked' : ''}><span class="sr-only">Include</span></label>
                        <input type="text" class="draft-title" data-f="title" value="${escapeHtml(d.title)}" aria-label="Title">
                    </div>
                    <span class="input-prefix-wrapper draft-amount"><span class="input-prefix">₦</span><input type="number" data-f="amount" min="0.01" step="0.01" value="${d.amount}" aria-label="Amount"></span>
                    <select data-f="type" aria-label="Type"><option value="expense" ${d.type === 'expense' ? 'selected' : ''}>Expense</option><option value="income" ${d.type === 'income' ? 'selected' : ''}>Income</option></select>
                    <select data-f="categoryId" aria-label="Category">${catOptions(d.type, d.categoryId)}</select>
                    <input type="date" data-f="date" value="${d.date}" aria-label="Date">
                    ${accounts.length ? `<select data-f="accountId" aria-label="Account">${accOptions(d.accountId)}</select>` : ''}
                    ${d.notes ? `<span class="draft-notes">${escapeHtml(d.notes)}</span>` : ''}
                </div>`).join('')}
            </div>
            <div class="modal-actions smart-add-save-row">
                <button type="button" class="btn-text" id="smart-add-discard">Discard</button>
                <button type="button" class="btn btn-primary" id="smart-add-save" ${count ? '' : 'disabled'}>
                    <i class="fa-solid fa-check"></i> Save ${count} transaction${count === 1 ? '' : 's'}
                </button>
            </div>`;
    }

    function wireSmartAdd() {
        const form = document.getElementById('smart-add-form');
        const textEl = document.getElementById('smart-add-text');
        const photoEl = document.getElementById('smart-add-photo');
        const photoName = document.getElementById('smart-add-photo-name');
        const submit = document.getElementById('smart-add-submit');
        const results = document.getElementById('smart-add-results');

        photoEl.addEventListener('change', async () => {
            const file = photoEl.files && photoEl.files[0];
            smartPhoto = null;
            photoName.textContent = 'Add receipt photo';
            if (!file) return;
            try {
                smartPhoto = await imageToBase64(file);
                photoName.textContent = `Photo: ${file.name}`;
            } catch (e) {
                showToast("Couldn't read that image. Try a JPG or PNG.", 'danger');
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = textEl.value.trim();
            if (!text && !smartPhoto) { textEl.focus(); return; }
            submit.disabled = true;
            submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading…';
            renderDrafts('Claude is reading that…');
            try {
                drafts = await draftTransactions(text, smartPhoto);
                if (drafts.length === 0) renderDrafts("Claude didn't find any transactions in that. Try adding an amount and what it was for.");
                else renderDrafts();
            } catch (err) {
                renderDrafts(escapeHtml(`Couldn't draft transactions: ${friendlyAiError(err)}.`));
            } finally {
                submit.disabled = false;
                submit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Draft transactions';
            }
        });

        // Edits to the draft rows
        results.addEventListener('change', (e) => {
            const row = e.target.closest('.draft-row');
            if (!row) return;
            const d = drafts[Number(row.dataset.i)];
            const f = e.target.dataset.f;
            if (f === 'include') d.include = e.target.checked;
            else if (f === 'amount') d.amount = parseFloat(e.target.value) || 0;
            else if (f === 'accountId') d.accountId = e.target.value || null;
            else d[f] = e.target.value;
            if (f === 'type') {
                const first = state.categories.find(c => c.type === d.type);
                if (first && !state.categories.some(c => c.id === d.categoryId && c.type === d.type)) d.categoryId = first.id;
            }
            if (f === 'include' || f === 'type') renderDrafts();
        });
        results.addEventListener('input', (e) => {
            const row = e.target.closest('.draft-row');
            if (row && e.target.dataset.f === 'title') drafts[Number(row.dataset.i)].title = e.target.value;
        });
        results.addEventListener('click', (e) => {
            if (e.target.closest('#smart-add-discard')) { drafts = []; renderDrafts(); return; }
            if (!e.target.closest('#smart-add-save')) return;
            const chosen = drafts.filter(d => d.include && d.amount > 0 && d.title.trim());
            chosen.forEach(d => {
                state.transactions.push({
                    id: makeId('tx'), title: d.title.trim(), type: d.type, amount: Math.round(d.amount * 100) / 100,
                    categoryId: d.categoryId, date: d.date, notes: d.notes || '', accountId: d.accountId || null
                });
            });
            if (chosen.length) touchStreak();
            saveData();
            updateDashboard();
            drafts = [];
            textEl.value = '';
            smartPhoto = null;
            photoEl.value = '';
            photoName.textContent = 'Add receipt photo';
            renderDrafts();
            showToast(`${chosen.length} transaction${chosen.length === 1 ? '' : 's'} saved`, 'success');
        });
    }

    // ==================================================================
    // 3b. Ask about your money (streaming chat over a finance summary)
    // ==================================================================
    function money(n) { return formatNaira(Math.round(n || 0)); }

    function financeSnapshot() {
        const lines = [];
        const safe = (fn) => { try { fn(); } catch (e) { /* skip a section rather than fail */ } };
        const catName = (id) => (state.categories.find(c => c.id === id) || {}).name || 'Uncategorised';
        const now = new Date();
        lines.push(`Today: ${todayISO()}. Currency: Nigerian naira (₦).`);

        safe(() => {
            const nw = netWorthBreakdown();
            lines.push(`\nNET WORTH ${money(nw.total)} = cash ${money(nw.cash)} + investments ${money(nw.invest)} + savings goals ${money(nw.savings)} + owed to me ${money(nw.owedToMe)} - debts ${money(nw.iOwe)}`);
        });

        safe(() => {
            lines.push('\nMONTHLY TOTALS (last 6 months, newest first):');
            for (let i = 0; i < 6; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const txs = state.transactions.filter(t => (t.date || '').startsWith(key));
                if (!txs.length) continue;
                const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                const byCat = {};
                txs.filter(t => t.type === 'expense').forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
                const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])
                    .map(([id, v]) => `${catName(id)} ${money(v)}`).join(', ');
                lines.push(`- ${key}${i === 0 ? ' (this month, in progress)' : ''}: income ${money(inc)}, spending ${money(exp)}. Spending by category: ${top || 'none'}`);
            }
        });

        safe(() => {
            const entries = Object.entries(state.budgets || {});
            if (!entries.length && !state.settings.wantsMonthlyCap) return;
            lines.push('\nBUDGETS THIS MONTH:');
            entries.forEach(([id, limit]) => {
                lines.push(`- ${catName(id)}: spent ${money(monthCategorySpend(id, now.getFullYear(), now.getMonth()))} of ${money(limit)}`);
            });
            if (state.settings.wantsMonthlyCap) lines.push(`- Monthly cap on "wants": ${money(state.settings.wantsMonthlyCap)}`);
        });

        safe(() => {
            const wants = state.categories.filter(c => c.type === 'expense').map(c => `${c.name} (${c.priority})`).join(', ');
            lines.push(`\nEXPENSE CATEGORIES (need/want): ${wants}`);
        });

        safe(() => {
            const accs = state.accounts.filter(a => !a.archived);
            if (!accs.length) return;
            lines.push('\nCASH ACCOUNTS:');
            accs.forEach(a => lines.push(`- ${a.name} (${a.type}): ${money(accountBalance(a))}`));
        });

        safe(() => {
            const items = [
                ...state.incomeSources.map(s => `- Income: ${s.name} ${money(s.amount)} ${s.cadence || ''}`),
                ...state.recurringExpenses.map(b => `- Bill: ${b.name} ${money(b.amount)} ${b.cadence || ''}`)
            ];
            if (items.length) lines.push('\nRECURRING:', ...items);
        });

        safe(() => {
            const active = state.debts.filter(d => d.status === 'active');
            if (!active.length) return;
            lines.push('\nDEBTS & LOANS (active):');
            active.forEach(d => lines.push(`- ${d.kind === 'iOwe' ? 'I owe' : 'Owed to me by'} ${d.counterparty || '?'} (${d.name}): ${money(debtRemaining(d))} left of ${money(d.originalAmount)}${d.dueDate ? `, due ${d.dueDate}` : ''}`));
        });

        safe(() => {
            if (!state.goals.length) return;
            lines.push('\nSAVINGS GOALS:');
            state.goals.forEach(g => lines.push(`- ${g.name} (${g.status}): saved ${money(g.savedAmount)} of ${money(g.targetAmount)}${g.targetDate ? `, target date ${g.targetDate}` : ''}`));
        });

        safe(() => {
            const hs = state.investments.holdings;
            if (!hs.length) return;
            lines.push(`\nINVESTMENTS (₦/$ rate ${state.settings.usdRate || 'not set'}):`);
            hs.forEach(h => {
                const sym = h.currency === 'USD' ? '$' : '₦';
                lines.push(`- ${h.name}${h.ticker ? ` [${h.ticker}]` : ''}: ${h.units} units, avg cost ${sym}${h.avgCost}, price ${sym}${h.currentPrice}`);
            });
        });

        safe(() => {
            const recent = state.transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 40);
            if (!recent.length) return;
            lines.push('\nRECENT TRANSACTIONS (newest first):');
            recent.forEach(t => lines.push(`- ${t.date} ${t.type === 'income' ? '+' : '-'}${money(t.amount)} ${t.title} [${catName(t.categoryId)}]`));
        });

        return lines.join('\n');
    }

    const ASK_SYSTEM =
        'You are the money coach inside Steady, a personal finance app used by a young professional in Nigeria. ' +
        'Answer using the numbers in the finance summary below; quote them in naira (₦) and do the arithmetic for the user. ' +
        'Be direct and practical: a short answer first, then at most a few specific next steps they could take in the app or their life. ' +
        'Think in terms of the local context (inflation, naira volatility, NGX vs US stocks, treasury bills and money-market funds) when relevant. ' +
        'If the summary lacks something you need, say what is missing instead of inventing it. ' +
        'You are not a licensed financial adviser; for big or irreversible decisions, suggest checking with one, in one sentence at most. ' +
        'Use plain text with short paragraphs and "-" bullet lists. Keep most answers under 200 words.';

    let askHistory = [];
    let askSnapshot = null;
    let askBusy = false;

    // Minimal, safe formatting for Claude's replies: escape everything, then add
    // bold, bullets and paragraphs.
    function formatReply(text) {
        const esc = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const blocks = esc.split(/\n{2,}/).map(block => {
            const lines = block.split('\n');
            if (lines.every(l => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
                return `<ul>${lines.map(l => `<li>${l.replace(/^\s*([-*•]|\d+\.)\s+/, '')}</li>`).join('')}</ul>`;
            }
            return `<p>${lines.join('<br>')}</p>`;
        });
        return blocks.join('');
    }

    function addBubble(role, html) {
        const thread = document.getElementById('ask-thread');
        const div = document.createElement('div');
        div.className = `ask-bubble ask-${role}`;
        div.innerHTML = html;
        thread.appendChild(div);
        div.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        return div;
    }

    async function ask(question) {
        if (askBusy || !question.trim()) return;
        askBusy = true;
        const input = document.getElementById('ask-input');
        const submit = document.getElementById('ask-submit');
        submit.disabled = true;
        document.getElementById('ask-suggestions').hidden = true;
        document.getElementById('ask-clear').hidden = false;
        addBubble('user', escapeHtml(question));
        const reply = addBubble('assistant', '<span class="ask-typing">Thinking…</span>');
        if (!askSnapshot) askSnapshot = financeSnapshot();
        askHistory.push({ role: 'user', content: question });
        try {
            const client = await getClient();
            const stream = client.beta.messages.stream({
                ...baseParams(),
                max_tokens: 32000,
                output_config: { effort: 'medium' },
                system: [
                    { type: 'text', text: ASK_SYSTEM },
                    { type: 'text', text: `<finance_summary>\n${askSnapshot}\n</finance_summary>`, cache_control: { type: 'ephemeral' } }
                ],
                messages: askHistory
            });
            let text = '';
            stream.on('text', (delta) => {
                text += delta;
                reply.innerHTML = formatReply(text);
            });
            const final = await stream.finalMessage();
            if (final.stop_reason === 'refusal') {
                reply.innerHTML = '<p>Claude declined to answer that. Try asking it another way.</p>';
                askHistory.pop();
            } else {
                // Keep the full content (including thinking blocks) so follow-ups keep their context.
                askHistory.push({ role: 'assistant', content: final.content });
                if (!text) reply.innerHTML = formatReply(final.content.filter(b => b.type === 'text').map(b => b.text).join('\n'));
            }
        } catch (err) {
            askHistory.pop();
            reply.innerHTML = `<p>${escapeHtml(`Sorry, ${friendlyAiError(err)}.`)}</p>`;
        } finally {
            askBusy = false;
            submit.disabled = false;
            input.focus();
        }
    }

    function wireAsk() {
        const form = document.getElementById('ask-form');
        const input = document.getElementById('ask-input');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = input.value;
            input.value = '';
            ask(q);
        });
        document.getElementById('ask-suggestions').addEventListener('click', (e) => {
            const chip = e.target.closest('.chip-btn');
            if (chip) ask(chip.textContent);
        });
        document.getElementById('ask-clear').addEventListener('click', () => {
            askHistory = [];
            askSnapshot = null;
            document.getElementById('ask-thread').innerHTML = '';
            document.getElementById('ask-suggestions').hidden = false;
            document.getElementById('ask-clear').hidden = true;
        });
    }

    function renderAssistantView() {
        const ready = aiReady();
        document.getElementById('assistant-setup-card').hidden = ready;
        document.getElementById('smart-add-card').hidden = !ready;
        document.getElementById('ask-card').hidden = !ready;
    }

    // ==================================================================
    // 4. Encrypted cloud backup & sync (GitHub Gist)
    // ==================================================================
    const b64 = {
        from: (buf) => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); },
        to: (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0))
    };

    async function deriveKey(passphrase, salt, iterations) {
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
            material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    async function encryptState(passphrase) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
        const savedAt = new Date().toISOString();
        const plain = new TextEncoder().encode(JSON.stringify(state));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
        return {
            app: 'steady', v: 1, savedAt,
            kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: b64.from(salt) },
            cipher: { name: 'AES-256-GCM', iv: b64.from(iv) },
            data: b64.from(cipher)
        };
    }

    async function decryptPayload(payload, passphrase) {
        const key = await deriveKey(passphrase, b64.to(payload.kdf.salt), payload.kdf.iterations);
        try {
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.to(payload.cipher.iv) }, key, b64.to(payload.data));
            return JSON.parse(new TextDecoder().decode(plain));
        } catch (e) {
            throw new Error('WRONG_PASSPHRASE');
        }
    }

    async function gh(path, options = {}) {
        const res = await fetch(`https://api.github.com${path}`, {
            ...options,
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${conn.sync.token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                ...(options.body ? { 'Content-Type': 'application/json' } : {})
            }
        });
        if (res.status === 401) throw new Error('GITHUB_AUTH');
        if (res.status === 403 || res.status === 404) {
            const err = new Error(res.status === 404 ? 'GITHUB_NOT_FOUND' : 'GITHUB_FORBIDDEN');
            err.status = res.status;
            throw err;
        }
        if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
        return res.json();
    }

    function friendlySyncError(e) {
        switch (e && e.message) {
            case 'GITHUB_AUTH': return 'GitHub rejected the token; check it has Gists read and write access';
            case 'GITHUB_FORBIDDEN': return "the token isn't allowed to use Gists; give it Gists read and write access";
            case 'GITHUB_NOT_FOUND': return 'the backup Gist was not found';
            case 'WRONG_PASSPHRASE': return "the passphrase doesn't match the one this backup was made with";
            default: return (e instanceof TypeError) ? "couldn't reach GitHub; check your connection" : ((e && e.message) || 'something went wrong');
        }
    }

    // Find this user's backup Gist (e.g. when connecting a second device).
    async function findGist() {
        if (conn.sync.gistId) {
            try { return await gh(`/gists/${conn.sync.gistId}`); }
            catch (e) { if (e.message !== 'GITHUB_NOT_FOUND') throw e; conn.sync.gistId = null; }
        }
        for (let page = 1; page <= 5; page++) {
            const list = await gh(`/gists?per_page=100&page=${page}`);
            const hit = list.find(g => g.files && g.files[GIST_FILE]);
            if (hit) {
                conn.sync.gistId = hit.id;
                saveConn();
                return gh(`/gists/${hit.id}`);
            }
            if (list.length < 100) break;
        }
        return null;
    }

    async function readRemote(gist) {
        const file = gist && gist.files && gist.files[GIST_FILE];
        if (!file) return null;
        let text = file.content;
        if (file.truncated || !text) {
            const res = await fetch(file.raw_url);
            text = await res.text();
        }
        const payload = JSON.parse(text);
        if (payload.app !== 'steady' || !payload.data) throw new Error("The backup Gist doesn't contain a Steady backup.");
        return payload;
    }

    let syncBusy = false;
    async function backupNow({ quiet = false, overwrite = false } = {}) {
        if (!syncReady() || syncBusy) return;
        syncBusy = true;
        clearTimeout(syncTimer);
        try {
            const gist = await findGist();
            if (gist && !overwrite) {
                const remote = await readRemote(gist).catch(() => null);
                // Someone (another device) backed up after our last sync: don't clobber it.
                if (remote && (!conn.sync.lastSyncedAt || remote.savedAt > conn.sync.lastSyncedAt)) {
                    offerRemote(remote, { conflict: conn.sync.dirty || !conn.sync.lastSyncedAt });
                    return;
                }
            }
            const payload = await encryptState(conn.sync.passphrase);
            const body = JSON.stringify({
                description: GIST_DESCRIPTION,
                files: { [GIST_FILE]: { content: JSON.stringify(payload) } },
                ...(gist ? {} : { public: false })
            });
            const saved = gist
                ? await gh(`/gists/${gist.id}`, { method: 'PATCH', body })
                : await gh('/gists', { method: 'POST', body });
            conn.sync.gistId = saved.id;
            conn.sync.lastSyncedAt = payload.savedAt;
            conn.sync.dirty = false;
            saveConn();
            renderOnlineSettings();
            if (!quiet) showToast('Backed up (encrypted) to your GitHub Gist', 'success');
        } catch (e) {
            if (!quiet) showToast(`Backup failed: ${friendlySyncError(e)}.`, 'danger');
            else console.warn('Auto-backup failed:', e);
        } finally {
            syncBusy = false;
        }
    }

    async function restoreFrom(payload) {
        const data = await decryptPayload(payload, conn.sync.passphrase);
        if (!data || !Array.isArray(data.transactions)) throw new Error("The backup doesn't look like Steady data.");
        applyingRemote = true;
        localStorage.setItem('96orge_budget_state', JSON.stringify(data));
        conn.sync.lastSyncedAt = payload.savedAt;
        conn.sync.dirty = false;
        saveConn();
        location.reload();
    }

    async function restoreNow() {
        if (!syncReady()) { showToast('Add your GitHub token and passphrase first.', 'warning'); return; }
        try {
            const gist = await findGist();
            const remote = await readRemote(gist);
            if (!remote) { showToast('No backup found yet. Use "Save & back up now" to make one.', 'warning'); return; }
            offerRemote(remote, { conflict: true, manual: true });
        } catch (e) {
            showToast(`Restore failed: ${friendlySyncError(e)}.`, 'danger');
        }
    }

    // A banner offering to load a backup that is newer than what this device has.
    function offerRemote(remote, { conflict = false, manual = false } = {}) {
        document.getElementById('sync-banner')?.remove();
        const when = new Date(remote.savedAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
        const banner = document.createElement('div');
        banner.id = 'sync-banner';
        banner.className = 'sync-banner glass-card';
        banner.setAttribute('role', 'alert');
        banner.innerHTML = `
            <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i>
            <div class="sync-banner-text">
                <strong>${manual ? 'Restore your backup?' : 'A newer backup is available'}</strong>
                <span>Saved ${escapeHtml(when)}. ${conflict ? 'Restoring replaces the data on this device; changes made here since then will be lost.' : 'This device has no unsaved changes, so restoring is safe.'}</span>
            </div>
            <div class="sync-banner-actions">
                <button type="button" class="btn-text" data-act="keep">${manual ? 'Cancel' : 'Keep this device’s data'}</button>
                <button type="button" class="btn btn-primary btn-sm" data-act="restore">Restore backup</button>
            </div>`;
        const main = document.getElementById('main');
        main.insertBefore(banner, main.querySelector('.app-header').nextSibling);
        banner.addEventListener('click', async (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            if (act === 'restore') {
                try { await restoreFrom(remote); }
                catch (err) { showToast(`Restore failed: ${friendlySyncError(err)}.`, 'danger'); }
                return;
            }
            banner.remove();
            if (!manual) {
                // Keep local: from now on this device's data is the newest, so push it.
                conn.sync.lastSyncedAt = remote.savedAt;
                saveConn();
                backupNow({ quiet: false, overwrite: true });
            }
        });
    }

    async function checkRemoteOnStartup() {
        if (!syncReady() || !conn.sync.auto) return;
        try {
            const gist = await findGist();
            const remote = await readRemote(gist);
            if (!remote) { if (conn.sync.dirty) backupNow({ quiet: true }); return; }
            if (!conn.sync.lastSyncedAt || remote.savedAt > conn.sync.lastSyncedAt) {
                offerRemote(remote, { conflict: conn.sync.dirty || !conn.sync.lastSyncedAt });
            } else if (conn.sync.dirty) {
                backupNow({ quiet: true });
            }
        } catch (e) {
            console.warn('Sync check failed:', e);
        }
    }

    // Flush a pending auto-backup when the tab is hidden (switching apps on a phone).
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && conn.sync.dirty && syncReady() && conn.sync.auto) backupNow({ quiet: true });
    });

    // ==================================================================
    // Settings panel (Data & Backup -> Online features)
    // ==================================================================
    function setStatus(id, on, text) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text || (on ? 'On' : 'Off');
        el.classList.toggle('is-on', Boolean(on));
    }

    function renderOnlineSettings() {
        const aiKey = document.getElementById('ai-key');
        if (!aiKey) return;
        aiKey.value = conn.aiKey ? '••••••••' + conn.aiKey.slice(-4) : '';
        aiKey.dataset.masked = conn.aiKey ? '1' : '';
        document.getElementById('ai-model').value = conn.aiModel || DEFAULT_MODEL;
        document.getElementById('ai-forget').hidden = !conn.aiKey;
        setStatus('ai-status', aiReady());

        document.getElementById('fx-auto').checked = Boolean(conn.fxAuto);
        const fh = document.getElementById('finnhub-key');
        fh.value = conn.finnhubKey ? '••••••••' + conn.finnhubKey.slice(-4) : '';
        fh.dataset.masked = conn.finnhubKey ? '1' : '';
        setStatus('prices-status', conn.fxAuto || conn.finnhubKey, conn.finnhubKey ? 'On' : (conn.fxAuto ? '₦/$ only' : 'Off'));

        const tok = document.getElementById('sync-token');
        tok.value = conn.sync.token ? '••••••••' + conn.sync.token.slice(-4) : '';
        tok.dataset.masked = conn.sync.token ? '1' : '';
        const pass = document.getElementById('sync-passphrase');
        pass.value = conn.sync.passphrase ? '••••••••••' : '';
        pass.dataset.masked = conn.sync.passphrase ? '1' : '';
        document.getElementById('sync-auto').checked = Boolean(conn.sync.auto);
        document.getElementById('sync-forget').hidden = !syncReady();
        document.getElementById('sync-restore').hidden = !syncReady();
        setStatus('sync-status', syncReady(), syncReady() ? (conn.sync.lastSyncedAt ? `Backed up ${timeAgo(conn.sync.lastSyncedAt)}` : 'On') : 'Off');

        renderAssistantView();
    }

    // A masked field keeps its stored value unless the user types a new one.
    function fieldValue(el, stored) {
        return el.dataset.masked && el.value.startsWith('••••') ? stored : el.value.trim();
    }
    function unmaskOnFocus(el) {
        el.addEventListener('focus', () => { if (el.dataset.masked) { el.select(); } });
        el.addEventListener('input', () => { el.dataset.masked = ''; });
    }

    function goToSetting(fieldId) {
        switchToTab('settings');
        const el = document.getElementById(fieldId);
        if (el) {
            el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            el.focus({ preventScroll: true });
        }
    }

    function wireSettings() {
        ['ai-key', 'finnhub-key', 'sync-token', 'sync-passphrase'].forEach(id => unmaskOnFocus(document.getElementById(id)));

        document.getElementById('ai-settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const key = fieldValue(document.getElementById('ai-key'), conn.aiKey);
            if (key && !key.startsWith('sk-ant-')) { showToast('That doesn\'t look like an Anthropic API key (they start with "sk-ant-").', 'danger'); return; }
            conn.aiKey = key;
            conn.aiModel = document.getElementById('ai-model').value;
            saveConn();
            renderOnlineSettings();
            decorateInvestments();
            showToast(key ? 'Assistant is on. Find it under Assistant in the menu.' : 'Assistant settings saved', 'success');
        });
        document.getElementById('ai-forget').addEventListener('click', () => {
            conn.aiKey = '';
            saveConn();
            renderOnlineSettings();
            showToast('API key removed from this device', 'success');
        });

        document.getElementById('prices-settings-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            conn.fxAuto = document.getElementById('fx-auto').checked;
            conn.finnhubKey = fieldValue(document.getElementById('finnhub-key'), conn.finnhubKey);
            saveConn();
            renderOnlineSettings();
            showToast('Live price settings saved', 'success');
            if (conn.fxAuto) await refreshFx({ force: true });
            if (conn.finnhubKey) refreshAllPrices({ includeNgx: false, quiet: true });
        });

        document.getElementById('sync-settings-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = fieldValue(document.getElementById('sync-token'), conn.sync.token);
            const passphrase = fieldValue(document.getElementById('sync-passphrase'), conn.sync.passphrase);
            if (!token || !passphrase) { showToast('Enter both a GitHub token and a passphrase.', 'danger'); return; }
            if (passphrase.length < 10) { showToast('Use a passphrase of at least 10 characters.', 'danger'); return; }
            if (passphrase !== conn.sync.passphrase && conn.sync.passphrase) conn.sync.lastSyncedAt = null;
            conn.sync.token = token;
            conn.sync.passphrase = passphrase;
            conn.sync.auto = document.getElementById('sync-auto').checked;
            saveConn();
            renderOnlineSettings();
            await backupNow();
            renderOnlineSettings();
        });
        document.getElementById('sync-restore').addEventListener('click', restoreNow);
        document.getElementById('sync-forget').addEventListener('click', () => {
            conn.sync = { token: '', passphrase: '', gistId: null, auto: true, lastSyncedAt: null, dirty: false };
            saveConn();
            renderOnlineSettings();
            showToast('Cloud backup disconnected on this device. Your Gist is still on GitHub.', 'success');
        });

        document.getElementById('assistant-setup-btn').addEventListener('click', () => goToSetting('ai-key'));
    }

    // ==================================================================
    // Boot
    // ==================================================================
    TAB_TITLES.assistant = 'Assistant';
    wireSettings();
    wireSmartAdd();
    wireAsk();

    // Auto-refresh prices when the Investments view opens (rate-limited).
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-tab]');
        if (!tab) return;
        if (tab.dataset.tab === 'investments' && conn.finnhubKey && (!conn.pricesUpdatedAt || Date.now() - conn.pricesUpdatedAt > PRICES_MAX_AGE_MS)) {
            refreshAllPrices({ includeNgx: false, quiet: true });
        }
        if (tab.dataset.tab === 'settings') renderOnlineSettings();
    });

    // app.js loads the saved data on DOMContentLoaded; this listener was added after
    // app.js's, so it runs once the data is in place.
    window.addEventListener('DOMContentLoaded', () => {
        booted = true;
        renderOnlineSettings();
        decorateInvestments();
        refreshFx();
        checkRemoteOnStartup();
    });

    // Shared with the feature files that load after this one (online-statements.js,
    // online-review.js, online-reminders.js) and with the tests.
    window.steadyOnline = {
        // Device-local online settings (keys, preferences). Never part of `state`.
        get conn() { return conn; },
        saveConn,
        DEFAULT_MODEL,
        aiReady,
        isBooted: () => booted,
        // Run `fn` after every saveData() (including app.js's save while starting up).
        onSaved(fn) { saveListeners.push(fn); },
        // Claude: the vendored SDK client, base request params (model + refusal
        // fallbacks), and a readable message for any error from a Claude call.
        getClient,
        baseParams,
        friendlyAiError,
        // Formatting: safe HTML for Claude's replies, rounded naira, "3 h ago".
        formatReply,
        money,
        timeAgo,
        // Open Data & Backup and focus a field there.
        goToSetting,
        // Tests and debugging.
        financeSnapshot, refreshFx, backupNow, encryptState, decryptPayload
    };
})();
