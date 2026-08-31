# 96orgeBudget

A premium-looking personal finance visualizer and budgeting app. It runs entirely
in the browser — no backend, no build step, no account. All data lives in your
browser's `localStorage`, so it can be hosted as static files (e.g. GitHub Pages).

## Features

- **Dashboard** — balance, income, expenses and savings-rate cards, an expenses-by-category
  doughnut chart, a 6-month income-vs-expenses bar chart, per-category budget progress,
  and a recent-transactions feed. A month selector switches the whole dashboard between
  any month that has activity.
- **Transactions** — add, edit and delete income/expense entries; search, filter by
  type/category and sort.
- **Categories & Budgets** — create custom categories (colour + icon) and set monthly
  spending limits per expense category, with safe/warning/danger thresholds.
- **Data & Backup** — export the full database to JSON, import a backup, or factory reset.
- Responsive: desktop sidebar plus a mobile bottom-nav bar and floating add button.

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
