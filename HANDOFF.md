# Finance Tracker — Session Handoff

**Date:** 2026-06-14
**Last version live:** v98 — `finance-v98-inv-fix-car-savings`
**Open issue:** None — all bridge fixes deployed and verified.

---

## What shipped this session (v94–v98)

### Root issues fixed

**v94–v96 — Wrong localStorage key (core import bug)**
Bridge was writing to `financeApp_v1`. App reads from `financeDashboard_v1`. Nothing was actually importing. Fixed localStorage key. Confirmed working — David ran bridge and saw live changes populate.

**v97 — Bank dedup + emergency vault**
- App state had two "Emergency Fidelity Cash" entries — `usedBankRows` set caused the second to block. Fixed by adding `seenBankNorms` Set that deduplicates app bank accounts by normalized name before matching Excel rows.
- Removed `'emergency vault': 'emergency account'` from VAULT_NAME_OVERRIDES. Emergency Vault now intentionally skips (no Excel row). Bank sheet is source of truth for that balance, not the vault list.

**v98 — Investment Roth totals + car savings**
- Root cause: bridge was looking for `ftState.investments.accounts` — that path doesn't exist. App uses flat `state.investments: [{name, balance}]`.
- Fix: bridge now computes David Roth total and Yamel Roth total from shares × price (reads F col for shares, B col for prices). Finds accounts by keyword match ("david" / "yamel") in name.
- Car Savings override: Excel name "Car Savings (Fidelity SGOV)" normalizes to `car savings fidelity sgov`. Added three overrides to catch all app name variations.

### Version log

| Version | What shipped |
|---------|-------------|
| v98 | Investment section rewrite (shares×price Roth totals), car savings multi-override, bank dedup (`seenBankNorms`) |
| v97 | Bank dedup fix, emergency vault override removed |
| v96 | Fixed localStorage key: `financeApp_v1` → `financeDashboard_v1` |
| v95 | Bridge UI/UX improvements |
| v94 | (intermediate) |
| v93 | Vault row range 17-35 → 17-36; Row 36 (Food $300) was missing |

---

## What shipped in earlier sessions (v93)

**Root cause found:** `excel-import-bridge.html` was reading `VAULT_ROWS` only up to row 35, but the Bank Accounts sheet has 20 vaults (rows 17–36). Row 36 = Food ($300.00) was never imported.

**Fix:** Changed `for (let r = 17; r <= 35; r++)` → `r <= 36` in bridge. Bumped CACHE_VERSION to `finance-v93-bridge-vault-fix`.

**Also confirmed from workbook inspection:**
- Bank accounts: rows 7–12, column C = balance ✓
- Vaults: rows 17–36, column C = balance (now fixed)
- Transfer Account vault (row 25) stays — David confirmed he wants it visible
- SoFi Checking / Savings Account show "-" in workbook → bridge skips those rows → app keeps stale balance. If those show non-zero, zero them out manually in the app.
- Data Entry sheet = transaction log + monthly net worth tracker (not used by bridge)

**Workbook sheet map (confirmed):**
| Sheet | Bridge reads? | What it is |
|-------|--------------|-----------|
| Credit Cards | Yes | CC balances, rows 7-16 |
| Bank Accounts | Yes | Bank accounts rows 7-12, SoFi Vaults rows 17-36 |
| Paycheck Planner | Yes | Paycheck allocation |
| Paycheck Tracker | No | Historical paycheck log |
| Investment Tracker 2026 | Yes | Investment accounts |
| Data Entry | No | Transaction log + monthly net worth |
| Savings Goals | Yes | 14 goals, rows 7-20 |
| Savings Plan | No | Unknown |
| Savings Challenge | No | 52-week / 26 bi-weekly challenge |

---
2. **Check the bridge.** If data is wrong, the issue is in `excel-import-bridge.html` — look at how bank account balances are read from `House Budgetper.xlsx`.
3. **Check the render.** If data is correct but display is wrong, look at `renderAccounts()` in `dashboard.js` around line 311 — the bank account rows added in v92.

**Ask David:**
- "Can you export your JSON and paste the `accounts` array?"
- "Which accounts look wrong — all of them or specific ones?"

---

## What shipped this session

| Version | What shipped |
|---------|-------------|
| v92 | Accounts tab redesign: bank accounts show bold name + green balance per row (no bar, no target). Vaults show name + balance + horizontal progress bar with "$X of $Y · Z%" label above it. Replaced SVG rings. |
| v91 | Bridge picks paycheck column by NEXT upcoming date (reads row 1 of B, D, F cols — June 23 in col F was next, not July 7 in col B). |
| v90 | Fixed paycheck duplicates — bridge was combining all 3 paycheck columns additively. Now imports one column only. |

---

## Key files

| File | Relevant to issue |
|------|------------------|
| `dashboard.js` ~line 298 | `renderAccounts()` — bank account and vault rendering |
| `excel-import-bridge.html` | Bank account import from workbook |
| `storage.js` | `defaultState` shape for `state.accounts[]` |

**State shape:**
```js
state.accounts = [ { name: "SoFi Checking", balance: 1234.56, role?: "transfer" } ]
state.vaults   = [ { name: "Emergency Fund", balance: 11000, target: 39600 } ]
```

---

## Deploy reminder

- Edit only in `C:\Users\david\OneDrive\Documents\GitHub\finance-tracker`
- Commit + push via **GitHub Desktop** (bash git is broken on OneDrive mount)
- Bump `CACHE_VERSION` in `sw.js` on every deploy
- Verify: `curl -s "https://davidfontenelle80-cloud.github.io/finance-tracker/sw.js" | grep CACHE_VERSION`

---

## What we were fixing

### Bug 1 — "Cards short $2,512.07" banner
- Dashboard shows a `status-card` section comparing `transferGap = transferBalance - cards`
- When `transferGap < 0` → shows "Cards short [amount]" in orange/red
- Root cause: `SoFi Transfer Account` in `state.accounts` does NOT have `role: "transfer"` set in the JSON data, so the old `.find(item => item.role === "transfer")` returned `null`, making `transferBalance = 0`, and `transferGap = 0 - cards = negative`
- **Fix deployed:** `findTransferAccount()` function added — matches by `role === "transfer"` OR `name.toLowerCase().includes("transfer account")`

### Bug 2 — Auto-payday (minor)
- Dashboard was showing raw `state.settings.nextPayday` (a stored seed date, not the next future date)
- **Fix deployed:** `getNextPayday(state)` function added — advances seed by 14-day intervals until it reaches today or later

---

## Deployment status

Both fixes are **confirmed live** on GitHub Pages:
```
curl https://davidfontenelle80-cloud.github.io/finance-tracker/sw.js | grep CACHE_VERSION
→ finance-v84-card-transfer-coverage  ✓

curl https://davidfontenelle80-cloud.github.io/finance-tracker/dashboard.js | grep "findTransferAccount\|getNextPayday"
→ line 105: function findTransferAccount(accounts)  ✓
→ line 124: const transfer = findTransferAccount(state.accounts)  ✓
→ line 144: function getNextPayday(state)  ✓
→ line 200: ${esc(getNextPayday(state) || "No date set")}  ✓
```

User still sees the old banner. Two possible causes:

### Cause A — Service worker still serving v83 cache
The PWA's old service worker is intercepting requests and returning cached files before v84 can load.

**Fix:** User needs to clear the PWA cache manually:
- iPhone: Settings → Safari → Advanced → Website Data → find "finance-tracker" → Delete
- Android: App long-press → App Info → Storage → Clear Storage
- Desktop Chrome: DevTools → Application → Service Workers → Unregister → reload

### Cause B — Data issue: SoFi Transfer Account balance is 0 or name doesn't match
Even with v84 loaded, if `state.accounts` doesn't contain an account whose `.name.toLowerCase().includes("transfer account")`, `findTransferAccount` returns `null` and the banner persists.

**Diagnosis:** Export the app's JSON (Export Changes button on dashboard) and check `state.accounts`:
- Is there an account named "SoFi Transfer Account" (or similar)?
- Does it have a `balance` > 0?
- Does `balance` approximately equal the total credit card balance ($2,512.07)?

If the account name doesn't include "transfer account" — the fix won't catch it. The function would need to be updated to match the actual account name in the data.

---

## Two repos — critical distinction

| Repo | Path (Windows) | Path (bash sandbox) | Purpose |
|------|---------------|---------------------|---------|
| **CORRECT** | `C:\Users\david\OneDrive\Documents\GitHub\finance-tracker` | `/sessions/.../mnt/finance-tracker/` | GitHub Desktop's active clone — edits here deploy |
| OLD (stale) | `C:\Users\david\OneDrive\Documents\DIcursos Publico\finance-tracker-gh-work` | `/sessions/.../mnt/finance-tracker-gh-work/` | Disconnected copy — DO NOT edit here |

**Always edit the CORRECT repo.** The old one is mounted but stale.

---

## Deploy method

**GitHub Desktop ONLY** — no git push tokens are available as of Jun 2026.

1. Edit files directly in `C:\Users\david\OneDrive\Documents\GitHub\finance-tracker\` using the Read/Edit tools (the correct mounted folder)
2. Open GitHub Desktop — it will detect the changed files automatically
3. In GitHub Desktop: add commit message → Commit to main → Push origin
4. GitHub Pages deploys automatically (takes ~1 min)
5. Verify with: `curl https://davidfontenelle80-cloud.github.io/finance-tracker/sw.js | grep CACHE_VERSION`

Bash sandbox git commands DO NOT work on OneDrive mounts (permission denied on `.git/`). Never attempt `git push` from bash.

---

## Key files

- `dashboard.js` — all dashboard rendering, `findTransferAccount`, `getNextPayday`, `metrics()`
- `sw.js` — service worker; bump `CACHE_VERSION` string on every deploy
- `storage.js` — data layer
- `app.js` — app shell, SW registration, update detection
- `accounts.js`, `transfers.js`, `paychecks.js`, `investments.js` — feature modules

---

## Next steps for next session

1. Ask David to export his Finance Tracker JSON and paste or share the `accounts` array
2. Check whether `findTransferAccount` would actually match his SoFi Transfer Account given his real data
3. If name doesn't match → update `findTransferAccount` with the correct name pattern
4. OR: set `role: "transfer"` on that account via the app's account editor (no code change needed)
5. Bump `CACHE_VERSION` to `finance-v85-...`, push via GitHub Desktop, verify live

---

## Live site
`https://davidfontenelle80-cloud.github.io/finance-tracker/`
