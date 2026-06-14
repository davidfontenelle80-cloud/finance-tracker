# Tools and Environment Reference
# Finance Tracker — David Fontenelle
# Last updated: 2026-06-14
#
# READ THIS EVERY SESSION. Update it whenever a new tool, skill, or workflow is added.
# When David says "handoff" — read this file, update it if anything changed, then generate HANDOFF.md.

---

## Computer (Desktop) Tools

These require `mcp__computer-use__request_access` before use. Always request at session start.

| App | Why it's needed | Tier |
|-----|----------------|------|
| **GitHub Desktop** | ONLY way to commit and push. Git via bash is broken (OneDrive mount blocks `.git/` writes). | full |
| **File Explorer** | Delete `.git/ORIG_HEAD` or lock files when GitHub Desktop pull fails. | full |

How to open GitHub Desktop via computer-use:
1. `mcp__computer-use__request_access` with apps: ["GitHub Desktop", "File Explorer"]
2. `mcp__computer-use__open_application` with app: "GitHub Desktop"
3. Take a screenshot to confirm which repo is active — it may switch to a wrong repo
4. If wrong repo: click "Current repository" dropdown, select finance-tracker under davidfontenelle80-cloud
5. Type commit message in the Summary field, click "Commit to main", then "Push origin"

KNOWN TRAP: When typing a commit message, GitHub Desktop sometimes interprets it as a new repo name if the summary field isn't focused properly. Always click the summary field first, then type.

---

## Shell / Bash Tools

Run via `mcp__workspace__bash`. Sandboxed Linux — no git commands (OneDrive mount blocks `.git/`).

| Command | What it does |
|---------|-------------|
| `curl -s "https://davidfontenelle80-cloud.github.io/finance-tracker/sw.js" \| grep CACHE_VERSION` | Verify live deploy — check version string matches what was just pushed |
| `node scripts/khub-check.mjs .` | Static design conformance check — run before declaring any build done |
| `python3 -c "..."` | Line-by-line file scan when grep fails on binary-embedded files (excel-import-bridge.html has base64 images — bash grep returns "binary file matches") |

Shell path mapping (bash path vs Windows path):
- `C:\Users\david\OneDrive\Documents\GitHub\finance-tracker` → `/sessions/*/mnt/finance-tracker/`
- `C:\Users\david\OneDrive\Documents\DIcursos Publico\Accounting\` → `/sessions/*/mnt/...` (accounting backup folder)

---

## File Tools (Read / Write / Edit)

Direct file access — no shell needed. Always use the Windows path.

- Read a file before editing it (Edit tool requires prior Read)
- Prefer Edit over Write for existing files (sends diff only, safer)
- Write is for new files or complete rewrites only
- NEVER edit the stale clone at `DIcursos Publico\finance-tracker-gh-work`

---

## Web Fetch / Verify

- `mcp__workspace__web_fetch` — fetch a URL and read content
- Use to verify live site after deploy
- GitHub Pages takes ~60 seconds to deploy after push

---

## Skills Available (invoke with Skill tool)

| Skill | When to use |
|-------|------------|
| `finance-app-dev` | ANY session touching the Finance Tracker app — carries full architecture, state shape, module map. Read this first every session. |
| `html-app-dev` | Single-file HTML app edits |
| `multifile-pwa-dev` | Building new multi-file PWAs from scratch |
| `reflect` | End of session — reviews what was built, what to remember, what to improve |
| `budget-updater` | Updating House Budgetper.xlsx from screenshots |
| `finance-report` | Generating PDF financial report from app JSON |
| `finance-workbook-bridge` | Syncing workbook to/from app JSON (two-way) |
| `update-finance-app` | Updating Finance Tracker balances from screenshots |
| `clear-screenshots` | Clearing OneDrive Screenshots folder |
| `skill-creator` | Creating or modifying skills |
| `xlsx` | Excel file creation/editing |
| `pdf` | PDF creation/manipulation |
| `docx` | Word document creation/editing |

---

## Repo Facts

| Fact | Detail |
|------|--------|
| Live URL | `https://davidfontenelle80-cloud.github.io/finance-tracker/` |
| Active clone | `C:\Users\david\OneDrive\Documents\GitHub\finance-tracker` |
| Stale clone (never edit) | `C:\Users\david\OneDrive\Documents\DIcursos Publico\finance-tracker-gh-work` |
| Deploy path | Edit files → GitHub Desktop detects → Commit to main → Push origin → Pages ~60s |
| Cache bust | Bump `CACHE_VERSION` string in `sw.js` on every deploy that changes HTML/CSS/JS |
| JSON backups | `C:\Users\david\OneDrive\Documents\DIcursos Publico\Accounting\` |

---

## Key Source Files

| File | Role |
|------|------|
| `storage.js` | State shape, localStorage read/write, defaultState, migration |
| `dashboard.js` | All rendering — home, accounts, cards, paycheck, settings, goals, notes views |
| `app.js` | App shell, event routing, SW registration, view switching |
| `sw.js` | Service worker — CACHE_VERSION lives here, bump on every deploy |
| `css/styles.css` | KHub design tokens — use only CSS vars, no raw values |
| `excel-import-bridge.html` | Separate mini-app for importing from Excel workbook (~1100 lines, has embedded base64 images — use python3 for line scanning, not grep) |
| `HANDOFF.md` | Session-to-session handoff notes — always update at end of session |
| `TOOLS.md` | This file — update when tools or workflow changes |
| `CLAUDE.md` | Auto-loaded project rules — never contradict this file |

---

## State Shape (quick reference)

```js
state = {
  settings:     { nextPayday, paycheckAmount, paychecksPerYear, theme, language },
  accounts:     [ { name, balance, role? } ],          // role:"transfer" = SoFi Transfer Account
  vaults:       [ { name, balance, target? } ],
  creditCards:  [ { name, balance, available, limit } ],
  paycheckPlan: [ { name, amount } ],
  investments:  [ { name, balance } ],
  bills:        [ { name, amount } ],
  notes:        [ { text, status } ],
  goals:        [ { name, target, saved, pct } ],
  pendingChanges: []
}
```

---

## Handoff Protocol

When David says **"handoff"** or **"give me a handoff"**, do ALL of this in one sequence:

1. **Reflect** — What did we build? What worked? What broke? What should be done differently?
2. **Update TOOLS.md** — Add any new tools, skills, or workflow changes discovered this session.
3. **Update HANDOFF.md** — Write the full session summary: open issues, files touched, what's next, diagnosis steps.
4. **Generate copy-paste brief** — Output a single block David can paste into the next session. It must include:
   - Live version and URL
   - Open issue with diagnosis steps
   - All file paths needed
   - State shape snippet if relevant
   - Deploy reminder (GitHub Desktop only, bump CACHE_VERSION, verify with curl)
   - Tools to request at session start (GitHub Desktop, File Explorer)

The copy-paste brief goes directly in chat so David can copy it without opening any file.

---

## Common Pitfalls (learn from these)

| Pitfall | What happened | Fix |
|---------|--------------|-----|
| Wrong repo in GitHub Desktop | GHD switched to a different repo mid-session | Always check "Current repository" label before committing. Switch back via the repo dropdown. |
| Commit message became repo name | Typed commit message before clicking the summary field | Always left-click the Summary field first, THEN type. |
| excel-import-bridge.html grep fails | File has embedded base64 images — bash grep returns "binary file matches" | Use `python3 -c "with open(f) as fh: [print(i+1,l) for i,l in enumerate(fh) if 'keyword' in l]"` |
| "Deployed" != "Fixed" | curl showed new CACHE_VERSION but David still saw old behavior | Old service worker was cached. Ask David to clear PWA cache before chasing more code. |
| Two clones look identical | Both clones have the same files but only one deploys | Always confirm edits landed in `GitHub\finance-tracker` by verifying CACHE_VERSION via curl after push. |
| Combining paycheck columns (v89 bug) | Bridge imported P1+P2+P3 additively — caused duplicates and "over planned" | Each paycheck column is a separate paycheck. Pick ONE based on next upcoming date (from row 1). |
