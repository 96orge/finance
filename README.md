# Steady

A personal finance tracker built around healthy money habits. It runs entirely
in the browser — no backend, no build step, no account. All data lives in your
browser's `localStorage`, so it can be hosted as static files (e.g. GitHub Pages),
and it can be installed to your phone's home screen and used offline.

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
- **Data & Backup** — export everything to JSON or transactions / investment activity to
  **CSV**, import a backup, or factory reset.
- **Light / dark theme** — Auto (follows your OS), Light or Dark, chosen from the sidebar
  (or the mobile *More* menu) and remembered. Gold brand with an indigo accent, driven
  entirely by semantic design tokens.
- Responsive: desktop sidebar; on phones a sticky top bar with a slide-out menu, a
  floating tab bar (with a **More** menu), a floating add button, and bottom-sheet modals.
- **Installable & offline** — a PWA with a web app manifest and a service worker, so it
  can be added to the home screen and keeps working without a connection.
- **Accessible** — visible keyboard focus, labelled controls, `role="dialog"` modals with
  a focus trap, `prefers-reduced-motion` support, AA colour contrast, and zoom left
  enabled.

## Tech

- Vanilla HTML, CSS and JavaScript — no framework, no build step.
- [Chart.js](https://www.chartjs.org/) via CDN for the charts.
- Font Awesome + Google Fonts (Outfit) via CDN.
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
Nothing is sent anywhere. Clearing site data or switching browsers/devices loses it —
use **Data & Backup → Export** to keep a copy.

## License

[MIT](LICENSE)
