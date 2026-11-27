export const meta = {
  name: 'build-statements-review-reminders',
  description: 'Build statement import, AI monthly review and push reminders in parallel worktrees, then multi-lens review and fix each',
  phases: [
    { title: 'Build', detail: 'one builder per feature, each in its own git worktree and test port' },
    { title: 'Review', detail: 'correctness, security/privacy and UX/tests lenses per feature, verify-before-report' },
    { title: 'Fix', detail: 'apply confirmed findings, rerun the full suite, commit' },
  ],
}

const SCRATCH = 'C:/Users/d_rke/AppData/Local/Temp/claude/556b7c94580dd357/1ebc8d70-0735-4407-88be-6d4ccd4c8816/scratchpad'

const COMMON = (f) => `
You are working on "Steady", a personal finance PWA for a young professional in Nigeria: plain HTML/CSS/JavaScript, no framework, no build step, hosted on GitHub Pages. Amounts are naira (₦).

YOUR CHECKOUT (a git worktree on branch ${f.branch}): ${f.dir}  (Git Bash path: ${f.bash})
- Work ONLY inside that directory. Use absolute paths. The Bash tool's working directory resets between calls, so start every shell command with: cd ${f.bash} && ...
- NEVER touch C:/Users/d_rke/Projects/finance (the user's own checkout with uncommitted work) or any other finance-* directory.
- Two other features are being built at the same time in other worktrees from the same base commit; they will be merged with yours later. To keep merges clean, edit ONLY the files and regions listed for your feature below.

THE CODEBASE (read these before writing code):
- CLAUDE.md, .claude/skills/brand/SKILL.md and .claude/skills/button-hierarchy/SKILL.md: brand colours/fonts (use CSS tokens like var(--color-primary), never raw hex in components; Saddle/primary = actions, Rust/accent = active state and highlights) and button rules (one obvious primary action per screen/section; two buttons side by side must be different variants, e.g. .btn.btn-primary + .btn-text or .btn-outline; only .btn, .btn-primary, .btn-outline, .btn-danger, .btn-text, .btn-sm).
- online.js: the existing opt-in online features (Claude assistant with Smart add and Ask, live prices, encrypted Gist backup). Copy its conventions: an IIFE with 'use strict', escapeHtml() on EVERY piece of user/bank/AI text before it goes into innerHTML or an attribute, showToast(message, 'success'|'danger'|'warning'), plain-language copy that says exactly what is sent where. At its end it exports window.steadyOnline, which your feature file uses:
    steadyOnline.conn (getter; device-local settings object, e.g. conn.aiKey, conn.aiModel; you may add your own sub-object such as conn.reminders and persist it with steadyOnline.saveConn()),
    steadyOnline.aiReady(), steadyOnline.isBooted(), steadyOnline.onSaved(fn) (runs after every saveData()),
    steadyOnline.getClient() (async; Anthropic SDK client from vendor/anthropic-sdk, created with dangerouslyAllowBrowser because the key is the user's own),
    steadyOnline.baseParams() (returns { model, betas, fallbacks } - always spread it into Claude requests and use client.beta.messages.*),
    steadyOnline.friendlyAiError(err), steadyOnline.formatReply(text) (safe HTML: escapes, then **bold**, "-" bullets, paragraphs),
    steadyOnline.money(n), steadyOnline.timeAgo(ts), steadyOnline.goToSetting(fieldId), steadyOnline.financeSnapshot(), DEFAULT_MODEL.
  Do NOT edit online.js. If something you need is missing from steadyOnline, implement it locally in your own file.
- app.js: all the core logic; its top-level functions and variables are globals you can call from your file: state, saveData(), showToast(), formatNaira(n), escapeHtml(s), makeId(prefix), todayISO(), ymd(date), touchStreak(), updateDashboard(), renderTransactionsList(), switchToTab(tab), catById(id), accountBalance(acc), monthKey(date), monthLabel(key), monthReviewStats(key), renderReviewModal(), reviewMonthKey, nextExpectedDate(source), CADENCE_DAYS, daysUntil(dateStr), debtRemaining(d), debtPaid(d), prefersReducedMotion, TAB_TITLES, placeholder(icon, text). Function declarations in app.js can be wrapped from your file the way online.js wraps renderInvestmentsView (const base = fn; fn = function () { base.apply(this, arguments); ... }). Do NOT edit app.js: the user has uncommitted changes to it elsewhere and we must not conflict. Note app.js loads saved data on DOMContentLoaded, so anything that reads state at startup must run in a DOMContentLoaded listener (registered after app.js's, so it runs after the data is loaded).
- State shape: state.transactions [{id, title, type: 'income'|'expense', amount, categoryId, date: 'YYYY-MM-DD', notes, accountId|null}], state.categories [{id, name, type, priority: 'need'|'want', ...}], state.accounts [{id, name, type, openingBalance, archived}], state.transfers, state.recurringExpenses (bills: {id, name, amount, cadence: 'monthly'|'weekly'|'biweekly', startDate, endDate|null, lastLoggedDate|null, active, categoryId, accountId}), state.incomeSources (same shape), state.debts [{id, name, counterparty, kind: 'iOwe'|'owedToMe', originalAmount, dueDate|null, status: 'active'|..., payments: [{date, amount, ...}]}], state.goals, state.budgets {categoryId: limit}, state.reviews [{id, month: 'YYYY-MM', note, createdDate}], state.settings. Keys, tokens and device preferences must NEVER go into state (state is exported, backed up and summarised for Claude); they belong in steadyOnline.conn.
- Dates: 'YYYY-MM-DD' strings. new Date('YYYY-MM-DD') parses as UTC midnight; when you need a local calendar date use new Date(y, m - 1, d) and ymd(date). Be careful with time zones.

CLAUDE API RULES (the vendored SDK is @anthropic-ai/sdk 1.14.0):
- const client = await steadyOnline.getClient(); then client.beta.messages.create({ ...steadyOnline.baseParams(), max_tokens, system, messages, output_config }) or, for long outputs, const stream = client.beta.messages.stream({...}); stream.on('text', delta => ...); const msg = await stream.finalMessage(). Use streaming whenever the output can be long (then max_tokens up to 64000); non-streaming requests use max_tokens 16000.
- Model: whatever baseParams() returns (default claude-opus-5-5). Never hard-code a different model and never send temperature/top_p/top_k or a thinking budget; set depth with output_config.effort ('low' for extraction/classification, 'medium' for writing).
- Structured JSON output: output_config: { format: { type: 'json_schema', schema } } and JSON.parse the text block. Schema rules: every object needs additionalProperties: false and a "required" array listing ALL of its properties; nullable fields use anyOf: [{...}, { type: 'null' }]; enums are fine; NO minimum/maximum/minLength/maxLength/pattern; an enum must never be empty.
- Images: { type: 'image', source: { type: 'base64', media_type, data } }. PDFs: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } placed before the text block (limit 32 MB per request; password-protected PDFs cannot be read). Plain text can also go in as { type: 'document', source: { type: 'text', media_type: 'text/plain', data } }.
- Always check msg.stop_reason: 'refusal' (Claude declined: show a calm message, save nothing) and 'max_tokens' (output cut off: never use partial data; tell the user what to do). Show errors with steadyOnline.friendlyAiError(err).

TESTS (Playwright, Chromium, phone + desktop projects):
- Read tests/helpers.js (openApp(page, state, { connections }) freezes the page clock at 2026-09-15T10:00+01:00 and seeds localStorage; connections seeds steadyOnline.conn, default { fxAuto: false }; fixtures RICH_STATE and EMPTY_STATE; goToTab(page, tab); trackPageErrors(page)) and tests/mocks.js (mock(page, urlPattern, handler) answers CORS preflights; json(route, body); claudeMessage(text) builds a non-streaming response; claudeStream(text) builds a streaming SSE body to fulfil with content-type text/event-stream; storedState(page)). Read tests/online.spec.js for examples of mocking Claude.
- Every external service MUST be mocked in tests: tests never reach the real internet or spend API credit.
- Put your tests in ${f.spec} only. Do not edit tests/helpers.js, tests/mocks.js, playwright.config.js or other spec files.
- Run tests ONLY on your own port, with list output and an output folder outside the repo, e.g.:
    cd ${f.bash} && PORT=${f.port} npx playwright test ${f.spec} --workers=2 --reporter=list --output=${SCRATCH}/pw-${f.key}
  and finally the whole suite the same way without the file argument. All tests must pass (9 tests are skipped on purpose; that is expected).

DONE MEANS: the feature works end to end, its spec covers the main flows and the important edge cases with meaningful assertions, the full suite passes, the UI is checked at a 360-412px phone width (no horizontal overflow; you can assert document.documentElement.scrollWidth <= window.innerWidth in a test) and on desktop, and the work is committed on ${f.branch} with a message ending in the line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Do not push. Do not edit README.md, CONTRIBUTING.md, CLAUDE.md or vendor/README.md (docs are updated after the merge; list any doc or copy changes you think are needed in your result). Do not leave scratch files behind.
`

const STATEMENTS_SPEC = `
FEATURE: BANK STATEMENT IMPORT (bulk-add a PDF or CSV statement through Smart add).

FILES YOU OWN: online-statements.js (currently a stub), the "SLOT: statement import" region in index.html (inside the Smart add card, between the Smart add form and #smart-add-results), the "Statement import" region at the end of style.css (between its header comment and "/* END: statement import */"), and tests/statements.spec.js (new).

WHY: Nigerian banks (GTBank, Access, Zenith, UBA, First Bank, Kuda, OPay, Moniepoint, PalmPay...) email statements as PDF (often password-protected) or let you export CSV/Excel. Logging every POS purchase, transfer and bank charge by hand is the biggest chore in the app.

UX:
- In the Smart add card, a secondary affordance (not a second primary button): e.g. a .btn-text label "Import a bank statement (PDF or CSV)" for a hidden file input (accept .pdf, .csv, .txt). One short line explaining what happens and what is sent: CSVs are read on this device and only the dates, amounts and descriptions are sent to Claude to name and categorise them; PDFs are sent to Claude (Anthropic) to read. Mention Excel users can "Save as CSV".
- While working: a clear progress message in an aria-live region ("Reading your statement...", and for streamed PDFs a running count like "Found 37 transactions so far"), controls disabled. Long PDFs can take a minute.
- Review screen (rendered in your slot or #smart-add-results; it may hold hundreds of rows, so keep it compact and fast):
  - Summary: bank and period if known, number of transactions, total money in and money out, and a reconciliation line: "Matches the statement's balances" when opening balance + credits - debits equals the closing balance (within ₦1), a warning with the difference when it does not (and which rows look wrong if per-row balances are available), or "This statement has no balances to check against".
  - An account picker ("Which account is this statement for?") with "No account" plus the user's non-archived accounts, defaulting to an account whose name matches the bank name when there is an obvious match.
  - Rows: include checkbox, date, editable title, category select (categories of the row's type), amount (money in vs out clearly distinguished; editable, because a PDF can be misread), and flags. Flags: "Possible duplicate of <existing title> on <date>" when an existing transaction has the same type, an amount within ₦0.01 and a date within 3 days (and the same account or either has none) - these start unticked; "Looks like a transfer between your own accounts" (Claude's likelyTransfer flag or obvious own-account wording) - start unticked and say to record it as a transfer instead; "Balance doesn't add up here" for rows where a per-row balance check fails.
  - Select all / select none, and a filter to show only flagged rows. Phone layout must not overflow at 360px.
  - Actions: primary "Import N transactions" (N = ticked rows, disabled at 0) + .btn-text "Discard".
  - Optional checkbox, shown only when it is safe: the chosen account has no transactions and no transfers yet, its openingBalance is 0, and the statement's opening balance is known: "Set <account>'s opening balance to ₦X (the balance at the start of this statement)", ticked by default.
- Saving: push each ticked row into state.transactions as { id: makeId('tx'), title, type, amount (rounded to 2 dp), categoryId, date, notes: the original bank description, accountId }, touchStreak(), saveData(), updateDashboard(), re-render the transactions list if visible, clear the review, toast "Imported N transactions" (+ account name). Nothing is saved before the user presses Import.

CSV PATH (amounts must be exact, so parse on the device):
- Robust parser: BOM, quoted fields with commas/newlines/escaped quotes, delimiter detection (comma, semicolon, tab, pipe), blank lines, preamble lines before the header (account name, period...), trailing totals rows.
- Header detection within the first ~40 rows using synonyms (case/punctuation-insensitive): date (trans date, transaction date, txn date, tran date, date, posting date, posted date, booking date, value date - prefer the transaction date over value date), description (narration, description, remarks, details, transaction details, particulars, narrative, memo, beneficiary; reference is a weak fallback), debit (debit, debits, withdrawal(s), money out, paid out, dr, debit amount, outflow), credit (credit, credits, deposit(s), money in, paid in, cr, credit amount, inflow), single signed amount (amount, transaction amount) optionally with a type column (dr/cr, debit/credit, type), balance (balance, running balance, closing balance, available balance, ledger balance, balance after).
- Amounts: strip ₦, NGN, a leading N (e.g. N5,000.00), commas, spaces; (1,234.50) is negative; trailing DR/CR; "-" or empty means none. Dates: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YY, DD-MMM-YYYY, DD-MMM-YY, DD MMM YYYY, MMM DD, YYYY, with or without a time part, and Excel serial numbers. Nigerian statements are day-first; switch to month-first only if the file proves it (a middle component above 12 while the first never is).
- Rows without a valid date or amount are skipped; "opening balance" / "balance b/f" / "brought forward" rows give the opening balance, "closing balance" the closing balance. When there is a balance column, check each row against the previous balance (statements may be newest-first or oldest-first: detect the order) and derive opening/closing balances from it if not stated.
- Then send ONLY index, date, type, amount and description (no names of the user, no balances) to Claude in batches of about 150 rows (run up to 3 batches at a time) with a strict JSON schema: { rows: [{ i, title, categoryId (enum of the user's category ids), likelyTransfer }] }. Short clean titles in the user's words (e.g. "Shoprite", "MTN airtime", "Transfer to Chidi", "SMS alert charge"). Rows Claude does not return get a sensible default category of the right type and a "Not categorised - check" flag. Include the user's account names in the prompt so Claude can spot transfers between the user's own accounts. Effort 'low'.
- If no header can be detected, fall back to the PDF-style path below with the CSV text sent as a plain-text document (cap the size sensibly and say so if it is too big).

PDF PATH:
- Refuse before any network call, with a helpful message, when: the file does not start with %PDF; it is over ~24 MB (base64 must fit 32 MB); or it is password-protected (the bytes contain /Encrypt) - tell the user to open it and "Print > Save as PDF" (or download it without a password) and try again.
- One streaming request with the PDF as a document block and a strict schema: { bankName, accountName, periodStart, periodEnd, openingBalance, closingBalance (nullable), transactions: [{ date, description, title, type, amount, balanceAfter (nullable), categoryId, likelyTransfer }] }. Prompt: extract every transaction exactly as printed (do not merge, skip or invent rows; ignore balance-only rows, page headers and totals); amounts positive with type from the debit/credit column; dates as YYYY-MM-DD; categories from the provided list; never include account numbers. max_tokens 64000, effort 'low'. If stop_reason is 'max_tokens', do not show partial rows: say the statement is too long to read in one go and suggest exporting one month at a time.
- Same post-processing as CSV: validate dates/amounts/categories (category type must match the row type), per-row balance check when balanceAfter is present, reconciliation, duplicates, transfers.

ROBUSTNESS: never trust model output blindly (validate every field; drop rows with no valid amount/date and say how many were dropped); keep the bank text out of innerHTML unless escaped; statement content is untrusted (a narration could contain instructions to the model) - the strict schema plus the user's review before saving is the defence, so the prompt should tell Claude to treat the statement as data only.

EXPOSE for tests: window.steadyStatements = { parseCsv, detectColumns, parseAmount, parseDate, ... } (pure helpers).

TESTS (tests/statements.spec.js; use page.setInputFiles with { name, mimeType, buffer: Buffer.from(...) }):
- Pure helpers via page.evaluate: tricky amounts ("(1,234.50)", "N5,000.00", "1,000.00 DR", "₦ 2,500", "-", ""), dates ("05-Sep-2026", "05/09/2026", "2026-09-05 10:22:31", "5 Sep 2026", an Excel serial, a month-first file), quoted CSV fields with commas and newlines, semicolon delimiter, preamble lines.
- A GTBank-style CSV (preamble, debit/credit/balance columns, day-first dates, oldest-first) end to end with a mocked Claude categorisation response that answers based on the request's rows: review shows the rows, reconciliation passes, a row duplicating an existing RICH_STATE transaction is flagged and unticked, the account picker applies, Import saves exactly the ticked rows with exact amounts and notes, nothing is saved before Import.
- A newest-first CSV with a single signed amount column: order detection makes the balance check pass.
- A PDF (a small fake %PDF buffer) with a mocked streaming Claude response: the request contains a document block with media_type application/pdf; a reconciliation mismatch is shown as a warning; refusal and max_tokens cases save nothing and show a message.
- A password-protected PDF (bytes include /Encrypt) and a non-PDF file renamed .pdf: friendly error, no request to api.anthropic.com.
- Phone width: the review screen with many rows does not overflow horizontally.
`

const REVIEW_SPEC = `
FEATURE: AI MONTHLY REVIEW (Claude writes up the month's summary on the Monthly Review).

FILES YOU OWN: online-review.js (currently a stub), the "SLOT: AI monthly review" region in index.html (inside #review-form in the Monthly Review modal, between #review-body and the "Your reflection" field), the "AI monthly review" region at the end of style.css (between its header comment and "/* END: AI monthly review */"), and tests/review.spec.js (new).

HOW THE REVIEW WORKS TODAY (app.js, read the "Monthly review" section): the dashboard button #btn-open-review (and a reminders-banner item "Review <Month>") calls openReviewModal(key), which sets the global reviewMonthKey ('YYYY-MM', default = last month) and calls renderReviewModal(): it fills #review-body with monthReviewStats(key) (income, spending, net, savings rate, top categories vs last month, budgets kept, goal contributions, needs/wants, biggest want) and loads the saved reflection note. The form saves { id, month, note, createdDate } into state.reviews; when a review for that month already exists it only updates .note (so extra fields you add to that review object are kept).

WHAT TO BUILD:
- In the modal, a "Claude's take" section below the numbers:
  - No AI key (steadyOnline.aiReady() is false): one short line with a .btn-text "Set up the assistant" that closes the modal and calls steadyOnline.goToSetting('ai-key'). No API calls ever.
  - Key present, no saved write-up for this month: a .btn-outline (the modal's primary stays "Save Review") "Write my review with Claude" with the wand icon, and one line saying it sends this month's numbers (and last month's reflection, if any) to Anthropic.
  - Generating: stream the text into the section as it arrives (aria-live polite), show a "Stop" .btn-text that aborts the stream (stream.abort()), disable the generate button. On finish, save the write-up into that month's review: find it in state.reviews or create { id: makeId('rev'), month, note: '', createdDate: todayISO() }, then set aiSummary: { text, model (the model that answered, from the final message), generatedAt (ISO), basis } and saveData(). basis is a small fingerprint of the month's numbers (e.g. income, spending, transaction count, rounded) used to detect staleness.
  - Saved write-up: render it immediately when the modal opens (steadyOnline.formatReply), with a footer like "Written by Claude on 3 Oct 2026" + a .btn-text "Rewrite". If the month's numbers no longer match basis, show "Your numbers for this month have changed since this was written" next to Rewrite.
  - Errors, refusal (stop_reason 'refusal') and Stop: show a calm message in the section; save nothing; the user can try again. Never leave the section stuck in a loading state.
  - Keep it working when the user switches months or reopens the modal mid-stream (ignore/abort a stream that belongs to a different month or a closed modal).
  - Add a short "Based on the numbers in Steady. Not financial advice." line in small muted text.
- The prompt (build it in your file; do not put keys or settings in it):
  - Month data: the month label and whether it is still in progress (current month) or complete; income, spending, net, savings rate; spending by category for this month vs last month (all categories with spending, not just the top 5); budgets: limit vs spent and over/under; the monthly cap on wants if set; needs vs wants; the 10 largest expenses (date, title, amount, category); income received (by source/title); goal contributions this month and each active goal's progress and target date; debts: payments made this month, what is left, anything overdue; net worth at month end if state.netWorthHistory has it (and the change from the month before).
  - Continuity: last month's review reflection note and last month's Claude write-up, if they exist, so Claude can follow up on what the user said they would change ("Last month you planned to cut eating out: you spent ₦X, down from ₦Y").
  - System prompt: a warm, direct money coach for a young professional in Nigeria; use only the numbers given and do the arithmetic; never invent numbers; naira formatting. Structure: a one-line verdict; **What went well** (2-3 "-" bullets with numbers); **Where the money went** (2-3 bullets: leaks, overspent budgets, big one-offs); **For next month** (exactly 3 specific, measurable actions, e.g. "Cap Food & Dining at ₦100,000 (you spent ₦142,500)"). Plain text with **bold** headings and "-" bullets only (formatReply renders exactly that). Under about 250 words. If the month has almost no data, say so briefly and suggest logging consistently instead of inventing insights.
  - Streaming, effort 'medium', max_tokens 16000. Handle stop_reason as described.
- Make sure saving the reflection (the existing form) still works and keeps aiSummary, and that a review created by your feature does not break the dashboard reminders or the Monthly Review numbers.

EXPOSE for tests: window.steadyReview = { buildReviewPrompt(monthKey), reviewBasis(monthKey), ... }.

TESTS (tests/review.spec.js; build your own state fixtures with transactions in August 2026 and July 2026, since the clock is frozen at 2026-09-15 and the modal defaults to last month = 2026-08; mock Claude with claudeStream):
- Generate: click #btn-open-review, then "Write my review with Claude": text streams in, bullets render as a list, state.reviews has month '2026-08' with aiSummary.text/model/generatedAt/basis; the request uses the model from baseParams, is a streaming request, and its prompt contains the August category totals, a budget line, the largest expenses, and July's reflection note.
- Reopen the modal: the saved write-up shows with no new request (count requests to api.anthropic.com); Rewrite makes a new request and replaces it.
- Saving a reflection after generating keeps aiSummary; generating after saving a reflection keeps the note.
- Staleness: add an August transaction, reopen: the "numbers have changed" note shows.
- No key: no generate button, the setup link is shown, no requests.
- Refusal and a network/500 error: a message shows, nothing is saved, the button works again.
- Phone width: no horizontal overflow with a long write-up.
`

const REMINDERS_SPEC = `
FEATURE: REMINDER NOTIFICATIONS for bills due and loans overdue.

FILES YOU OWN: online-reminders.js (currently a stub), sw.js (ADD to it; do not change its existing caching code, SHELL_ASSETS or CACHE_VERSION, which are already updated), the "SLOT: reminders" region in index.html (inside the "Online features" card in Data & Backup, after the cloud backup block), the "Reminders & notifications" region at the end of style.css (between its header comment and "/* END: reminders */"), and tests/reminders.spec.js (new).

CONSTRAINT: there is no backend (static GitHub Pages site), so true server push is not available. Build the best client-only design:
1. The page computes a reminder SCHEDULE from state and stores it in IndexedDB (the service worker cannot read localStorage). Recompute it (debounced) on startup, after every save (steadyOnline.onSaved) and when the reminder settings change. Store only what notifications need: { id, fireAt (ms), title, body, tab }, plus the prefs and a map of already-notified ids (prune entries older than ~120 days).
2. The service worker (sw.js) shows due notifications: on a 'periodicsync' event with tag 'steady-reminders' (Periodic Background Sync: Chrome/Edge on Android and desktop when the app is installed; this is the true background path) and on a message { type: 'steady-check-reminders' } from the page (the fallback while Steady is open, e.g. a tab left open on a laptop: the page asks on startup, on visibilitychange and every ~15 minutes). It shows each due, not-yet-notified item (fireAt <= now, and not older than ~7 days so a long-closed app does not dump stale alerts), at most 3 individual notifications plus one summary ("2 more bills and loans need attention") when there are more, using tag = id so repeats replace, icon icons/icon-192.png, and data { tab }. It marks shown ids as notified. If a client window is visible and focused, skip showing (the in-app reminders banner already covers it) and do NOT mark those ids, so they show once the user leaves the app. For tests only, the message may carry a 'now' value to use instead of Date.now().
3. 'notificationclick': close the notification, focus an existing app window and postMessage { type: 'steady-open-tab', tab }, or open './?tab=<tab>' if none. The page handles both: a service-worker message listener and a ?tab= query on startup call switchToTab(tab) (only for known tabs, i.e. TAB_TITLES has it) and then remove the query with history.replaceState.

SCHEDULE RULES (one pure function computeSchedule(state-derived inputs, prefs, now), exported for tests; local calendar dates; fire at the chosen hour, local time):
- Bills (state.recurringExpenses with active !== false): occurrences from nextExpectedDate(bill) (an app.js global) onward, advancing by cadence (monthly: same day next month, clamped to the month's length; weekly 7 days; biweekly 14), up to 90 days ahead and never past endDate. For each occurrence D: if leadDays > 0 a "before" item at D minus leadDays ("DSTV is due tomorrow" / "...due in 3 days"); a "due" item on D ("DSTV is due today"). If the next occurrence is already in the past (unlogged bill), an "overdue" item on the day after D ("DSTV is overdue"). Ids like bill:<id>:<YYYY-MM-DD>:before|due|overdue so they are stable across recomputes. Logging a bill advances lastLoggedDate, which moves the schedule on.
- Debts (status 'active' with a dueDate): kind 'iOwe': before (if leadDays > 0) and due-day items ("Your loan from Chidi is due today"), then overdue items the day after the due date and weekly after that for up to 8 weeks ("Your loan from Chidi is overdue"). kind 'owedToMe': overdue items on the same weekly pattern ("Emeka's repayment is overdue"). Ids debt:<id>:<dueDate>:<kind>:<n>.
- Body: the amount (formatNaira of the bill amount or debtRemaining) and a short action ("Tap to log it once paid"), unless the user turned off "Show amounts", in which case no amounts at all (notifications can appear on a lock screen). Tab: 'income' for bills, 'debts' for debts.
- Drop items more than 30 days in the past. Disabled prefs means an empty schedule.

SETTINGS UI (a fourth .online-feature block in your index.html slot, same structure and classes as the three blocks above it, so it looks the same):
- Title "Reminders on this device" with a status pill (.online-status, add .is-on when active): "Background" (notification permission granted and periodic sync registered), "While Steady is open" (permission granted, periodic sync unavailable, e.g. iPhone or not installed), "Blocked" (permission denied: explain how to allow notifications for the site in the browser settings), "Not supported" (no Notification or service worker support), or "Off".
- Copy: what it does; that nothing is sent anywhere (everything happens on this device); that for reminders when Steady is closed, Android/Chrome users should install the app (Add to Home screen); that iPhones only show them while Steady is open (and need the app added to the Home Screen for notifications at all).
- Controls: a checkbox to turn reminders on (turning it on must call Notification.requestPermission() from the user's click, then register periodic sync via (await navigator.serviceWorker.ready).periodicSync.register('steady-reminders', { minInterval: 12 * 60 * 60 * 1000 }) inside try/catch); "Remind me" select (on the day / 1 day before / 3 days before); a time select (8 am / 12 pm / 6 pm); a "Show amounts in notifications" checkbox (on by default); a primary "Save" button and a .btn-text "Send a test notification" (shows a sample notification right away through the service worker registration, or new Notification as a fallback; explain if permission is missing). Save prefs in steadyOnline.conn.reminders = { enabled, leadDays, hour, showAmounts } via steadyOnline.saveConn(). Turning reminders off clears the schedule and unregisters periodic sync.
- All of this is device-local: never put it in state.

EXPOSE for tests: window.steadyReminders = { computeSchedule, writeSchedule, readSchedule, ... }.

TESTS (tests/reminders.spec.js):
- computeSchedule via page.evaluate with a state built for the frozen date 2026-09-15: a monthly bill due 2026-09-16 with leadDays 1 gives a "before" item at 2026-09-15 08:00 local and a "due" item at 2026-09-16 08:00 local; an unlogged bill whose due date was 2026-09-10 gives an overdue item; a bill past its endDate gives nothing; weekly cadence spacing; month-end clamping (Jan 31 -> Feb 28/29); iOwe debt overdue items weekly up to 8; owedToMe overdue; showAmounts false removes every ₦ amount from titles and bodies; disabled prefs give an empty schedule; ids are stable across recomputes.
- Settings flow with context.grantPermissions(['notifications']): enabling saves conn.reminders, writes the schedule to IndexedDB (read it back with page.evaluate), and shows a status; disabling clears it; nothing is written to state (check localStorage '96orge_budget_state' has no reminder prefs).
- Service worker (test.use({ serviceWorkers: 'allow' }) in a describe block, desktop only like tests/pwa.spec.js): wait for navigator.serviceWorker.ready, enable reminders, post { type: 'steady-check-reminders', now } with a 'now' after a due item's fireAt, then assert (await navigator.serviceWorker.ready).getNotifications() contains the expected title. Note the page clock is frozen with page.clock.setFixedTime but the service worker may not be, which is why the message carries 'now'. Notifications are not repeated on a second check; a visible focused page suppresses them only if that is how you implemented it (test what you built). If headless Chromium cannot display notifications reliably, test the service worker's decision logic another way and explain in your result.
- ?tab=income deep link opens the Income view and cleans the URL; a 'steady-open-tab' message switches tabs.
- Phone width: the settings block does not overflow.
`

const FEATURES = [
  { key: 'statements', name: 'Bank statement import', branch: 'build/statements', dir: 'C:/Users/d_rke/Projects/finance-statements', bash: '/c/Users/d_rke/Projects/finance-statements', port: 4181, spec: 'tests/statements.spec.js', file: 'online-statements.js', SPEC: STATEMENTS_SPEC, reviewPorts: [4191, 4192, 4193] },
  { key: 'review', name: 'AI monthly review', branch: 'build/review', dir: 'C:/Users/d_rke/Projects/finance-review', bash: '/c/Users/d_rke/Projects/finance-review', port: 4182, spec: 'tests/review.spec.js', file: 'online-review.js', SPEC: REVIEW_SPEC, reviewPorts: [4194, 4195, 4196] },
  { key: 'reminders', name: 'Reminder notifications', branch: 'build/reminders', dir: 'C:/Users/d_rke/Projects/finance-reminders', bash: '/c/Users/d_rke/Projects/finance-reminders', port: 4183, spec: 'tests/reminders.spec.js', file: 'online-reminders.js', SPEC: REMINDERS_SPEC, reviewPorts: [4197, 4198, 4199] },
]

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'What you built, in a few sentences' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsAdded: { type: 'array', items: { type: 'string' }, description: 'Test titles you added' },
    fullSuiteResult: { type: 'string', description: 'e.g. "48 passed, 9 skipped"' },
    allTestsPass: { type: 'boolean' },
    commit: { type: 'string', description: 'Commit hash and subject' },
    docNotes: { type: 'array', items: { type: 'string' }, description: 'Doc or UI copy changes needed outside your files (README, privacy table, AI disclosure text...)' },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'filesChanged', 'testsAdded', 'fullSuiteResult', 'allTestsPass', 'commit', 'docNotes', 'limitations'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          scenario: { type: 'string', description: 'Concrete inputs or steps and the wrong result' },
          evidence: { type: 'string', description: 'How you verified it: the code path you traced and/or the scratch test you ran and its output' },
          fix: { type: 'string', description: 'Suggested fix' },
        },
        required: ['severity', 'title', 'file', 'line', 'scenario', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, how: { type: 'string' } }, required: ['title', 'how'] } },
    skipped: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, why: { type: 'string' } }, required: ['title', 'why'] } },
    fullSuiteResult: { type: 'string' },
    allTestsPass: { type: 'boolean' },
    commit: { type: 'string' },
    remainingConcerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'skipped', 'fullSuiteResult', 'allTestsPass', 'commit', 'remainingConcerns'],
}

const LENSES = [
  { key: 'correctness', focus: `CORRECTNESS AND ROBUSTNESS. Hunt for real bugs: wrong results (amounts, dates, categories, schedules, totals), data loss or corruption in state, anything saved without the user's confirmation, crashes and unhandled promise rejections, stuck loading states, broken edge cases (empty data, huge inputs, unusual formats, month ends, leap years, time zones: new Date('YYYY-MM-DD') is UTC), race conditions (double clicks, stale async results landing in the wrong place), Claude API request shapes that the API would reject (schema rules: additionalProperties false and all properties required on every object, no min/max/pattern constraints, no empty enums; streaming handling; stop_reason 'refusal'/'max_tokens' handling), service-worker lifecycle problems, and code paths the tests do not actually exercise.` },
  { key: 'security', focus: `SECURITY AND PRIVACY. Hunt for: XSS (bank narrations, file names, category/account/bill/person names, Claude's text or any other untrusted string reaching innerHTML or an attribute without escapeHtml; inline event handlers built from data), secrets leaking (API keys, GitHub token or passphrase ending up in state, IndexedDB, prompts, notifications, logs or exports), more data sent to Anthropic or anywhere else than the UI copy says (compare every request body with the on-screen disclosure), prompt injection from untrusted content (statement text telling the model to do things; is the output schema-constrained and reviewed before saving?), lock-screen exposure in notifications, unsafe file handling (size limits, password-protected or malformed files, memory blowups), and anything that could corrupt or overwrite the user's saved data.` },
  { key: 'ux', focus: `UX, ACCESSIBILITY, BRAND AND TEST QUALITY. Check the feature against .claude/skills/brand/SKILL.md (tokens only, no raw hex in components, Saddle/primary for actions, Rust/accent for active states) and .claude/skills/button-hierarchy/SKILL.md (one obvious primary per section, never two equally weighted buttons side by side). Check phone widths 360px and 412px (no horizontal overflow, usable controls) and desktop, keyboard use and focus, labels on every control, aria-live for async results, clear loading/empty/error states, plain and accurate copy. Then judge the tests: would they fail if the feature broke? Are the mocks realistic (shape of Claude responses, streaming events)? Are there flaky waits or assertions that always pass? Are important flows untested? Take screenshots with Playwright where it helps you judge layout (save them under ${SCRATCH}).` },
]

const buildPrompt = (f) => `${COMMON(f)}
${f.SPEC}

Plan briefly, then implement the whole feature, write the tests, run them until they pass, run the full suite, check phone and desktop layouts, and commit. Report what you built (structured output).`

const reviewPrompt = (f, lens, port, built) => `${COMMON(f)}
${f.SPEC}

YOUR ROLE: you are an independent, skeptical REVIEWER of the "${f.name}" feature that another engineer just built and committed on ${f.branch} in ${f.dir}. Their report: ${JSON.stringify(built)}

Review lens: ${lens.focus}

Rules for reviewers:
- Read the feature code (${f.file}${f.key === 'reminders' ? ', the additions to sw.js' : ''}, its index.html slot, its style.css region, ${f.spec}) end to end, plus whatever app.js / online.js code it relies on.
- Report ONLY problems you have verified: by tracing the exact code path, and wherever practical by reproducing it in a scratch test. Scratch tests go in tests/_scratch_${f.key}_${lens.key}.spec.js; run ONLY specific files, never the whole suite (other reviewers are working in the same checkout), on YOUR port ${port}: cd ${f.bash} && PORT=${port} npx playwright test tests/_scratch_${f.key}_${lens.key}.spec.js --workers=1 --reporter=list --output=${SCRATCH}/pw-${f.key}-${lens.key}
- Do NOT modify any file in the checkout except your own scratch test, and DELETE your scratch test before you finish. Do not commit.
- Severity: critical = data loss/corruption, security or privacy breach, or the feature does not work; important = wrong behaviour in realistic cases, accessibility blockers, misleading privacy copy, missing test coverage for a main flow; minor = polish.
- Most severe first, at most 12 findings. An empty list is a valid answer if you find nothing real. Do not pad with speculation.`

const fixPrompt = (f, built, findings) => `${COMMON(f)}
${f.SPEC}

YOUR ROLE: you built (or are taking over) the "${f.name}" feature on ${f.branch} in ${f.dir}. The build report was: ${JSON.stringify(built)}

Three independent reviewers (correctness, security/privacy, UX/accessibility/tests) reported these findings:
${JSON.stringify(findings, null, 1)}

Do this:
1. For each finding, check it against the code yourself. Fix every critical and important finding that is real; fix minor ones when the fix is small and safe. If you disagree with a finding, skip it and say why (with evidence). Several reviewers may describe the same issue; fix it once.
2. Add or strengthen tests so the fixed bugs would be caught next time.
3. Delete any leftover tests/_scratch_* files (git status should show only your intended changes).
4. Run ${f.spec}, then the full suite on port ${f.port} (cd ${f.bash} && PORT=${f.port} npx playwright test --workers=2 --reporter=list --output=${SCRATCH}/pw-${f.key}). Everything must pass.
5. Commit on ${f.branch} (message ending with the Co-Authored-By line). Report (structured output).`

const results = await pipeline(
  FEATURES,
  (f) => agent(buildPrompt(f), { label: `build:${f.key}`, phase: 'Build', schema: BUILD_SCHEMA }),
  async (built, f) => {
    if (!built) return null
    log(`${f.name}: built (${built.fullSuiteResult}); reviewing with 3 lenses`)
    const reviews = await parallel(LENSES.map((lens, i) => () =>
      agent(reviewPrompt(f, lens, f.reviewPorts[i], built), { label: `review:${f.key}:${lens.key}`, phase: 'Review', schema: FINDINGS_SCHEMA })))
    const findings = reviews.filter(Boolean).flatMap((r, i) => (r.findings || []).map(x => ({ ...x, lens: LENSES[i] ? LENSES[i].key : 'unknown' })))
    const serious = findings.filter(x => x.severity !== 'minor').length
    log(`${f.name}: ${findings.length} findings (${serious} critical/important)`)
    return { built, findings }
  },
  async (r, f) => {
    if (!r) return null
    const fix = await agent(fixPrompt(f, r.built, r.findings), { label: `fix:${f.key}`, phase: 'Fix', schema: FIX_SCHEMA })
    log(`${f.name}: fixes ${fix ? fix.fullSuiteResult : 'FAILED'}`)
    return { feature: f.key, built: r.built, findings: r.findings, fix }
  },
)

return results
