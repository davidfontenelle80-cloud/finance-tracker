# Build and Ship Rules for This App

This file is read automatically when working in this repo. Honor it on every change.

---

## Session startup — do this FIRST, every time

### 1. Request folder access
At the start of every session, request both folders using `mcp__cowork__request_cowork_directory`:
- **PRIMARY (always needed):** `C:\Users\david\OneDrive\Documents\GitHub\finance-tracker` — this is GitHub Desktop's active clone. All edits go here.
- **SECONDARY (optional, already mounted):** `C:\Users\david\OneDrive\Documents\DIcursos Publico\finance-tracker-gh-work` — stale copy, read-only reference only. Never edit here.

### 2. Request computer-use access
Call `mcp__computer-use__request_access` for:
- **GitHub Desktop** — the ONLY way to commit and push (no git tokens available)
- **File Explorer** — needed if `.git/` lock files need to be deleted manually

### 3. Tools available in this project
| Tool | How it's used |
|------|--------------|
| `Read` / `Edit` / `Write` | Edit source files directly in the PRIMARY folder |
| `mcp__workspace__bash` | Run `curl` to verify live site, run `node scripts/khub-check.mjs` — CANNOT run git commands (OneDrive mount blocks `.git/` writes) |
| GitHub Desktop (computer-use) | Commit + push to GitHub — required for every deploy |
| File Explorer (computer-use) | Delete `.git/ORIG_HEAD` or lock files if GitHub Desktop pull fails |
| `mcp__workspace__web_fetch` | Verify the live GitHub Pages URL after push |

### 4. Critical repo facts
- **Git push via bash = broken.** OneDrive mount denies writes to `.git/`. Always use GitHub Desktop.
- **Two local clones exist** — only `GitHub\finance-tracker` is connected to GitHub Desktop. Edits to `finance-tracker-gh-work` will NOT deploy.
- **Deploy path:** Edit files → GitHub Desktop detects changes → Commit to main → Push origin → Pages deploys in ~1 min
- **Verify deploy:** `curl -s "https://davidfontenelle80-cloud.github.io/finance-tracker/sw.js" | grep CACHE_VERSION`
- **Bump `CACHE_VERSION` in `sw.js` on every deploy** that changes HTML/CSS/JS

### 5. Live site
`https://davidfontenelle80-cloud.github.io/finance-tracker/`

---

## What this app is

Personal finance tracker for David and Yamel Fontenelle. It replaces a manual Excel workbook ("House Budgetper.xlsx") with a mobile-first PWA. David tracks bank accounts, vaults (savings buckets), credit cards, paycheck allocation, investments, bills, and notes — all in one place. The app lives on his phone as an installed PWA.

**Key accounts in real data:**
- Bank accounts include a "SoFi Transfer Account" — this is the account David uses to pre-load card payments. Its balance should always approximately equal total credit card balances. When it does, the dashboard shows "Cards covered." When it doesn't match (or isn't found), it shows "Cards short."
- Vaults are named savings goals (e.g. Emergency Fund, Car, etc.)

**Where real data lives:**
- App stores state in `localStorage` key `financeDashboard_v1`
- JSON backups are exported via "Export Changes" button on the dashboard
- Backup files are saved to `C:\Users\david\OneDrive\Documents\DIcursos Publico\Accounting\`

**Before starting any build session, invoke the `finance-app-dev` skill** — it carries the full architecture and drops in ready without David needing to re-explain anything.

---

## Feature inventory — what's built

| View | What it does |
|------|-------------|
| Home (dashboard) | Net worth, bank cash, vaults, card debt KPIs; Cards covered/short banner; Next Paycheck summary; Notes & changes |
| Accounts | Bank accounts list with balances |
| Cards | Credit cards — balance, available, limit |
| Paycheck | Paycheck allocation planner — items, amounts, left-after-plan |
| Changes | Pending edits queue before export |
| Settings | Next payday seed, paycheck amount, paychecks/year, theme, language |

**Other files:**
- `excel-import-bridge.html` — separate mini-app for importing from the Excel workbook
- `js/firebase/` — optional cloud backup (Firebase); not required for core features

---

## Open bugs (as of 2026-06-14)

| Bug | Status | Notes |
|-----|--------|-------|
| "Cards short $2,512.07" banner always shows | Unresolved | `findTransferAccount()` fix deployed at v84 but user still sees banner. Likely cause: SoFi Transfer Account name in their JSON doesn't include "transfer account" — need to export JSON and check exact `.name` value. Fix: update name-match pattern OR set `role:"transfer"` on that account. |
| Auto-payday date | Deployed v84 | `getNextPayday()` now auto-advances seed date — should be working |

**First move next session:** Ask David to export JSON → check `state.accounts` → find exact name of the SoFi account → update `findTransferAccount()` to match it.

---

## App architecture — know this before touching code

**Stack:** Vanilla JS, no framework, no build step. Single-page PWA hosted on GitHub Pages.

**Module map (load order matters):**
| File | Role |
|------|------|
| `storage.js` | State shape, localStorage read/write, migration, defaultState |
| `dashboard.js` | All rendering — home, accounts, cards, paycheck, settings views |
| `app.js` | App shell, event routing, SW registration, view switching |
| `sw.js` | Service worker — precache, network-first fetch, RELOAD_READY broadcast |
| `css/styles.css` | KHub design tokens and base layout |
| `js/firebase/` | Cloud backup (optional, not required for core features) |

**State shape (key fields):**
```js
state = {
  settings: { nextPayday, paycheckAmount, paychecksPerYear, theme, language },
  accounts: [ { name, balance, role? } ],   // role:"transfer" flags the transfer account
  vaults: [ { name, balance } ],
  creditCards: [ { name, balance, available, limit } ],
  paycheckPlan: [ { name, amount } ],
  investments: [ { name, balance } ],
  bills: [ { name, amount } ],
  notes: [ { text, status } ],
  pendingChanges: []
}
```

**The "Cards short" banner logic (dashboard.js):**
- `metrics()` computes `transferGap = transferAccount.balance - totalCardBalance`
- If `transferGap < 0` → banner shows "Cards short [amount]"
- `findTransferAccount()` matches by `role === "transfer"` OR `name.toLowerCase().includes("transfer account")`
- If the account name doesn't match either condition → `transferBalance = 0` → banner always shows

**Known pitfall — two clones:**
- `GitHub\finance-tracker` → GitHub Desktop's repo → **only this deploys**
- `DIcursos Publico\finance-tracker-gh-work` → stale disconnected copy → **never edit here**

---

## How to build with David

**The rhythm — one step at a time:**
- Make one change. Confirm it works. Then advance. Never stack multiple fixes in one move.
- Before touching any file, say exactly what you're about to do and why: "Editing dashboard.js line 124 — replacing the `.find()` with `findTransferAccount()` so it matches by name fallback."
- After every deploy, checkpoint: "Done. Here's what changed: [X]. Verified live. Next step is [Y] — ready?"
- Never declare something "done" until David confirms he sees it working in the app, not just because `curl` returned the right version.

**Running autonomously:**
- When David says "run it" or "do it autonomously" — execute the full sequence without stopping to narrate each micro-step. Take the screenshots, commit in GitHub Desktop, push, verify with curl, then report the outcome.
- Autonomous mode ends when something breaks or requires a decision. Stop and surface it: "Hit a blocker — [what it is]. Do you want me to [option A] or [option B]?"

**Session momentum:**
- David starts strong and can lose the thread mid-session. Watch for short replies, trailing off, or silence.
- If momentum drops: close the loop ("Here's where we are — ready to finish this?") or shelve it explicitly ("Want to park this and pick it up next session with a fresh start?"). Never let it drift.
- If the chat is getting long, offer a handoff: "This is getting long — want me to write a handoff so we pick this up clean next session?"

---

## How to troubleshoot with David

**Rule 1 — "nothing" or "same thing" means stop, don't push more code.**
When David reports a fix didn't work, the instinct is to write another code change. Don't. Stop and diagnose.

**Troubleshooting order:**
1. **Check data first.** The state JSON is the source of truth. Ask David to export his JSON (Export Changes button on dashboard) and look at the raw data before assuming the code is wrong.
2. **Check the service worker.** This PWA caches aggressively. "Deployed" does not mean the user's device is running the new code. If a fix is live on the server but David still sees the old behavior, the old SW is serving cached files. Ask him to clear the PWA cache before chasing more code.
3. **Check the right repo.** Always confirm edits landed in `GitHub\finance-tracker`, not the stale `finance-tracker-gh-work` clone. They look identical — verify with `curl` + CACHE_VERSION every time.
4. **Then look at the code** — only after ruling out data issues and cache issues.

**"Deployed" vs "fixed" — these are not the same thing:**
- Deployed = `curl` returns the new CACHE_VERSION ✓
- Fixed = David opens the app and the bug is gone ✓
- Always ask David what he sees after a deploy. Don't assume.

**When a fix doesn't take after clearing cache:**
- Export the JSON, inspect the relevant data field, compare against what the code expects.
- For the "Cards short" bug specifically: check `state.accounts` for the exact `.name` of the SoFi Transfer Account. `findTransferAccount()` will miss it if the name doesn't include "transfer account."

---

## How to work with David

**Communication style:**
- Lead with the point. No preamble, no recap of what he just said.
- One clarifying question max — ask it, then proceed. Don't stall waiting for perfect information.
- When something's unclear, name your best assumption and move: "Assuming you want X — going ahead."
- If David says something vague ("fix that thing"), ask once for the specific, then act.

**Pushback:**
- Name the weak point directly: "This won't hold because X. I'd do Y instead. Your call."
- If a proposed change could break another part of the app, say so before going along: "That would also affect [Z] — want me to handle both, or just this?"
- Don't soften it. David prefers honest over comfortable.

**Blind spots to watch in build sessions:**
- David sometimes starts a fix and loses it mid-execution. If he goes quiet after a partial change, either close the loop or shelve it explicitly.
- He'll sometimes say "A or B?" when he's already decided. Confirm cleanly: "Sounds like you're leaning toward A — going with that."
- "Run it autonomously" means go all the way to verified and report back — not stop after each tool call for approval.

---

## House finish (from KHub-Boilerplate)
- Dark theme by default, light theme on toggle. Both must work.
- All color, radius, spacing, shadow, and motion come from the KHub tokens. No raw values
  in component CSS.
- No sharp corners. Radius comes from the scale: sm 10, md 16, lg 22, xl 28, full.
- Press-scale, spring transitions, glow on the primary action, monospace tabular numbers.

## Before calling any version done, run the ship check
1. Open the app. No console errors. Error boundary present.
2. Open every view, tab, and modal. Each renders real content, not a blank or white screen.
3. Dark and light both render. Language toggle works.
4. Installs as a PWA and serves clean from GitHub Pages.
5. Design conformance: tokens only, unified radii, no mixed sharp and rounded edges,
   components match the KHub library, motion and polish present.
6. Fix every fail before shipping. Deliver one clean working build.

## How to run the static part of the check
From the repo root:
```
node scripts/khub-check.mjs .
```
This reports operational and design drift. A clean report is required to ship.
