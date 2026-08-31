# 96orgeBudget

A premium-looking personal finance visualizer and budgeting app. It runs entirely
in the browser — no backend, no build step, no account. All data lives in your
browser's `localStorage`, so it can be hosted as static files (e.g. GitHub Pages).

## Features

- **Dashboard** — balance / income / expenses / savings-rate cards, an expenses-by-category
  doughnut, a 6-month income-vs-expenses bar chart, budget progress and a recent-transactions
  feed. A month selector drives the whole dashboard. Habit widgets: a **Today strip**
  (safe-to-spend, logging streak, biggest month-over-month mover), quick-add tiles,
  recurring-income due list, needs-vs-wants split, debt & lending, savings goals and
  investment portfolio.
- **Transactions** — add, edit and delete income/expense entries; search, filter by
  type / category / need-vs-want and sort. Table on desktop, cards on mobile.
- **Income & Recurring** — recurring income (salary, NYSC allowance, …) with amount,
  cadence and optional end date, logged with one tap per payment. One-tap **quick-add**
  buttons for routine spends. Auto-detected **recurring charges** (likely subscriptions).
- **Debts & Lending** — money you owe and money you've lent out, grouped and rolled up
  per person, with partial payments that can auto-post as transactions and overdue flags.
- **Goals** — savings goals / sinking funds with progress, a target-date pace figure, and
  a "pay yourself first" prompt after every logged payment.
- **Investments** — a holdings portfolio (units, average cost, a price you update
  yourself) with buy / sell / dividend history, realised & unrealised P/L, and USD
  holdings converted at a ₦/$ rate you set.
- **Categories & Budgets** — custom categories (colour + icon), need/want tags, monthly
  spending limits, and a monthly "wants" cap with safe / warning / danger alerts.
- **Data & Backup** — export everything to JSON, import a backup, or factory reset.
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
