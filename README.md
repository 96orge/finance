# 96orgeBudget

A premium-looking personal finance visualizer and budgeting app. It runs entirely
in the browser — no backend, no build step, no account. All data lives in your
browser's `localStorage`, so it can be hosted as static files (e.g. GitHub Pages).

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
  derived from assigned transactions, and a net-worth breakdown (cash + investments +
  savings goals + money owed to you − debts) with a monthly trend.
- **Debts & Lending** — money you owe and money you've lent out, per-person rollup,
  partial payments that can auto-post as transactions, overdue flags.
- **Goals** — sinking funds with progress, a target-date pace figure, and a "pay yourself
  first" prompt after every logged payment.
- **Investments** — a holdings portfolio (units, average cost, a price you update
  yourself) with buy / sell / dividend history, realised & unrealised P/L, and USD
  holdings converted at a ₦/$ rate you set.
- **Monthly Review** — an end-of-month summary (income, spend by category vs prior month,
  budget adherence, needs/wants, biggest leak) plus a saved reflection note.
- **Categories & Budgets** — custom categories (colour + icon), need/want tags, monthly
  spending limits, and a monthly "wants" cap with safe / warning / danger alerts.
- **Data & Backup** — export everything to JSON or transactions / investment activity to
  **CSV**, import a backup, or factory reset.
- Responsive: desktop sidebar plus a mobile bottom-nav bar (with a **More** menu),
  floating add button, and bottom-sheet modals.

## Tech

- Vanilla HTML, CSS and JavaScript — no framework.
- [Chart.js](https://www.chartjs.org/) via CDN for the charts.
- Font Awesome + Google Fonts (Outfit) via CDN.

## Running locally

It's a static site — open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploying

Push to a repo and enable **GitHub Pages** on the default branch. No configuration needed.

## Data & privacy

Everything is stored locally in your browser under the `96orge_budget_state` key.
Nothing is sent anywhere. Clearing site data or switching browsers/devices loses it —
use **Data & Backup → Export** to keep a copy.

## License

[MIT](LICENSE)
