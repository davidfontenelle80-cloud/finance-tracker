# Finance Tracker

Personal finance tracker for David & Yamel. Tracks paychecks, budgets, transfers, investments, goals, savings plans, and calendar events. EN/ES bilingual via lang.js. Dark neon theme.

## Modules

`storage.js` → `lang.js` → `setup.js` → `paychecks.js` → `entry.js` → `transfers.js` → `tracker.js` → `accounts.js` → `investments.js` → `dashboard.js` → `goals.js` → `calendar.js` → `paycheck-tracker.js` → `next-year-planner.js` → `savings-plan.js` → `app.js`

## KHub standard (added 2026-06-05)

**New files added (existing app files unchanged):**
- `js/config.js` — env detection
- `js/error-boundary.js` — global error handler
- `js/a11y.js` — live region, focus management, keyboard shortcuts (Alt+D theme, Alt+L lang, Alt+H focus)
- `js/perf.js` — Core Web Vitals logging
- `js/components/` — shared button, card, input, modal components
- `css/dark-mode.css` / `css/components.css` / `css/responsive.css` — KHub CSS layers
- `sw.js` — upgraded from minified to full KHub pattern (v57)
- `icons/` — full PWA icon set (72–512px)
- `.eslintrc.json`, `.prettierrc`, `TEST-CHECKLIST.md`

## Version

v1.0.0 KHub — 2026-06-05 (cache: finance-tracker-v57)
