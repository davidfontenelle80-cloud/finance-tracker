# Finance Tracker — Session Handoff

**Date:** 2026-06-14
**Last version live:** v92 — `finance-v92-accounts-layout`
**Open issue:** Account balances look wrong — not yet diagnosed.

---

## Open issue — account balances off

David said "the account balances are off" after seeing v92 live. No diagnosis done yet.

**Diagnose before writing any code — in this order:**

1. **Check the data.** Ask David to export JSON from the app (Home tab → Export Changes button) and paste the `accounts` array. Are the numbers wrong in the data, or just displaying wrong?
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
