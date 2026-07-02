# v102 — Audit fixes (app-sweep 4/4)

Date: 2026-07-01
Scope: static audit per sweep method. No new features.

## Bugs fixed
1. **Token typos in css/styles.css.** `--bg-card` → `--card-bg` (tracker amount input rendered transparent), `--accent-cyan` → `--neon-cyan` (x2, focus rings never appeared), `--surface-1` → `--bg-secondary` and `--surface-2` → `--bg-tertiary` (x3: quick-edit hover, contribution-history cells, budget rows rendered transparent). All targets defined in both themes.
2. **dashboard.js SVG sublabel invisible in dark theme.** `fill="var(--color-text-secondary)"` — token never defined, SVG fill fell back to black. Fixed to `var(--text-secondary)`.
3. **SW offline fallback missed versioned assets.** index.html requests assets with `?v=89` (index-David-Yamel.html uses `?v=79`) but PRECACHE_URLS stores bare paths; `caches.match(event.request)` is query-sensitive, so precached entries never served versioned requests offline. Added `{ ignoreSearch: true }` to the offline fallback.

## Noted, not fixed (not provable bugs)
- Orphans: js/components/*.js, js/tab-labels.js unreferenced by any HTML/JS — left in place (no deletions per sweep rules).
- index-David-Yamel.html pinned to `?v=79` while index.html is at `?v=89` — variant page, intentional/stale, left alone.

## SW
- CACHE_VERSION: finance-v101-bridge-dashboard-key → finance-v102-audit-token-cache-fixes.
