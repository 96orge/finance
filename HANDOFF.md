# Handoff: statement import, AI monthly review, reminder notifications

Temporary file for the agent continuing this work in the cloud. Delete it, and
HANDOFF-build-specs.js, before opening the pull request.

## Where things are

- `feat/statements-review-reminders` (this branch): base for the three features. Already has the
  shared groundwork: `window.steadyOnline` helpers in online.js, slots in index.html marked
  `SLOT: ...`, regions at the end of style.css, stub files online-statements.js /
  online-review.js / online-reminders.js, sw.js caching them (CACHE_VERSION steady-v5),
  tests/mocks.js, and PORT from the environment in playwright.config.js. All 35 tests pass here.
- `build/review`: monthly review mostly written (online-review.js, style.css region,
  tests/review.spec.js) but NOT yet run or tested. Verify everything; don't trust it.
- `build/reminders`: only a partial sw.js change. online-reminders.js is still a stub.
- `build/statements`: nothing written yet.

## The specs

HANDOFF-build-specs.js is the workflow script that was running locally. Read it for the full
specs: `COMMON` (codebase conventions and rules), `STATEMENTS_SPEC`, `REVIEW_SPEC`,
`REMINDERS_SPEC`, and `LENSES` (the three review lenses). Ignore its Windows paths, worktree
folders, ports and scratch directory; they were for the local machine. In the cloud, work in
one checkout, and run the suite with `npx playwright test` (first
`npm ci && npx playwright install --with-deps chromium`).

## Rules that still apply

- Don't edit app.js (the user has uncommitted changes to it on their own machine). Use its
  globals and wrap functions from the feature files, as online.js does.
- Keys, tokens and device preferences live in `steadyOnline.conn`, never in `state`.
- Mock every external service in tests.
- Brand and button rules: .claude/skills/brand/SKILL.md, .claude/skills/button-hierarchy/SKILL.md.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
