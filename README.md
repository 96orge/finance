# Steady

A personal finance tracker built around healthy money habits. It runs in the
browser — no backend, no build step, no account. All data lives in your browser's
`localStorage`, so it can be hosted as static files (e.g. GitHub Pages), and it can
be installed to your phone's home screen and used offline. Optional online features
(an AI assistant, live prices and encrypted cloud backup) work when you switch them on.

**Try it:** [96orge.github.io/finance](https://96orge.github.io/finance/)

## Features

- **Dashboard** — **Net Worth** headline card plus monthly income / expenses / savings-rate,
  an expenses-by-category doughnut, a 6-month bar chart, budget progress and a recent
  feed. A dismissible **reminders banner** (bills due, loans overdue, unreviewed month,
  streak nudge). Habit widgets: a **Today strip** (safe-to-spend, monthly cashflow,
  logging streak, biggest month-over-month mover), quick-add tiles, a **Coming Up** list
  (due income + due bills), needs-vs-wants, debt & lending, goals and investments.
- **Transactions** — add, edit and delete income/expense entries with an optional
  **account**; search, filter by type / category / need-vs-want and sort. Table on
  desktop, cards on mobile.
- **Income & Recurring** — recurring income and **recurring expenses / bills** (rent,
  DSTV, data) with amount, cadence and optional end date, logged with one tap. One-tap
  **quick-add** buttons. Auto-detected **recurring charges** that can be promoted to
  tracked bills.
- **Net Worth** — real **cash accounts** (bank / cash / mobile money) whose balances are
  derived from assigned transactions, **transfers** between accounts (which never count
  as income or spending), and a net-worth breakdown (cash + investments + savings goals +
  money owed to you − debts) with a monthly trend.
- **Debts & Lending** — money you owe and money you've lent out, per-person rollup,
  partial payments that can auto-post as transactions, overdue flags. Settled debts
  tuck away into a collapsible section.
- **Goals** — sinking funds with progress, a target-date pace figure, and a "pay yourself
  first" prompt after every logged payment. Reached goals collapse out of the way.
- **Investments** — a holdings portfolio (units, average cost, a price you update
  yourself) with buy / sell / dividend history and realised & unrealised P/L. NGX (₦)
  and US ($) stocks are totalled separately, and USD holdings are converted at a ₦/$
  rate you set.
- **Learn** — personalised insights drawn from your own numbers (needs vs wants, savings
  rate, debt, streak), a money tip of the day, and a curated library of books and
  principles on money habits, wealth building, business and income.
- **Monthly Review** — an end-of-month summary (income, spend by category vs prior month,
  budget adherence, needs/wants, biggest leak) plus a saved reflection note.
- **Categories & Budgets** — custom categories (colour + icon), need/want tags, monthly
  spending limits, and a monthly "wants" cap with safe / warning / danger alerts.
- **Assistant (Claude)** — *optional, needs your own Anthropic API key.* **Smart add**
  turns a typed note, a pasted bank alert (SMS or email) or a receipt photo into draft
  transactions you check before saving. **Ask about your money** answers questions using a
  summary of your own accounts, spending, budgets, debts, goals and investments.
- **Live prices** — the ₦/$ rate updates itself when you hold US stocks; US stock prices
  refresh from Finnhub (free key); NGX prices are looked up by Claude with web search, and
  implausible jumps are skipped.
- **Encrypted cloud backup & sync** — *optional.* Your data is encrypted in the browser
  (AES-256-GCM, key derived from your passphrase) and kept in a secret GitHub Gist, so you
  can restore it or use Steady on another device. Newer backups from another device are
  offered, never applied silently.
- **Data & Backup** — export everything to JSON or transactions / investment activity to
  **CSV**, import a backup, or factory reset.
- **Light / dark theme** — Auto (follows your OS), Light or Dark, chosen from the sidebar
  (or the mobile *More* menu) and remembered. Warm cream-and-brown brand palette (Poppins
  headings, Source Sans 3 body), driven entirely by semantic design tokens.
- Responsive: desktop sidebar; on phones a sticky top bar with a slide-out menu, a
  floating tab bar (with a **More** menu), a floating add button, and bottom-sheet modals.
- **Installable & offline** — a PWA with a web app manifest and a service worker, so it
  can be added to the home screen. Everything except the online features keeps working
  without a connection.
- **Accessible** — visible keyboard focus, labelled controls, `role="dialog"` modals with
  a focus trap, `prefers-reduced-motion` support, AA colour contrast, and zoom left
  enabled.

## Tech

- Vanilla HTML, CSS and JavaScript — no framework, no build step.
- [Chart.js](https://www.chartjs.org/) for the charts, Font Awesome for icons, the Poppins
  and Source Sans 3 fonts, and the [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)
  for the assistant — all hosted in [`vendor/`](vendor/README.md), so the app's own files
  never load from other servers.
- The online features live in `online.js`; with none set up, it makes no requests (apart
  from the public ₦/$ rate when you hold US stocks).
- [Playwright](https://playwright.dev) end-to-end tests, run on every pull request.

## Running locally

It's a static site. With [Node.js](https://nodejs.org) installed:

```bash
npm install
npm start        # http://127.0.0.1:4173
npm test         # run the test suite (first time: npx playwright install chromium)
```

Or serve the folder with any static server, e.g. `python -m http.server 8000`.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to run the
app and tests, and the few ground rules (most importantly: nothing ever leaves the
user's device).

## Deploying

Push to a repo and enable **GitHub Pages** on the default branch. No configuration needed.

## Data & privacy

Everything is stored locally in your browser under the `96orge_budget_state` key
(a legacy internal name kept for backward compatibility with existing saved data).
Clearing site data or switching browsers/devices loses it, so use **Data & Backup →
Export** or turn on encrypted cloud backup.

Steady only sends data when you use an online feature, and each one says what it sends:

| Feature | Goes to | What is sent |
|---|---|---|
| ₦/$ rate | ExchangeRate-API | Nothing about you (a plain request for public rates), only when you hold US stocks |
| US stock prices | Finnhub | Your US tickers and your Finnhub key |
| Assistant | Anthropic | What you type or photograph; for questions, a summary of your finances |
| NGX prices | Anthropic | Your NGX tickers and company names |
| Cloud backup | GitHub (secret Gist) | Your data, encrypted on your device; GitHub can't read it |

API keys, the GitHub token and the backup passphrase are stored separately on your device
(`steady_connections`): they are never in exports or backups and never sent to Claude.

## License

[MIT](LICENSE)
