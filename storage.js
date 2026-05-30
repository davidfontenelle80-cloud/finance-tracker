/* ══════════════════════════════════════════════════════════════
   STORAGE.JS — Data layer
   Handles: localStorage read/write, default state, UUID gen,
   payday date calculation, JSON import/export.

   All other modules read/write through App.getState() / App.setState().
   This file only knows about data — no DOM, no rendering.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const STORAGE_KEY = 'financeApp_v1';

  // ── ID Generator ──────────────────────────────────────────
  // Generates a short unique string for record IDs.
  // Not a real UUID but collision-safe for localStorage scale.
  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
  }

  // ── Payday Date Calculator ────────────────────────────────
  // Given a first payday date (ISO string) and frequency,
  // returns an array of all payday ISO strings for the given year.
  // Uses noon UTC to avoid DST edge cases.
  function calculatePaydayDates(firstPayday, frequency, year) {
    if (!firstPayday) return [];

    const targetYear = year || new Date().getFullYear();
    const dates = [];

    // Parse first payday at noon local time to avoid DST issues
    const parts = firstPayday.split('-').map(Number);
    let current = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);

    if (frequency === 'biweekly') {
      // Step forward 14 days at a time.
      // First, walk forward from firstPayday until we reach the target year.
      while (current.getFullYear() < targetYear) {
        current.setDate(current.getDate() + 14);
      }
      // If we overshot (first payday was after the target year), back up.
      // (This handles edge cases if someone sets a 2025 first payday for a 2027 view.)
      while (current.getFullYear() > targetYear) {
        current.setDate(current.getDate() - 14);
      }
      // Collect all dates within the target year
      while (current.getFullYear() === targetYear) {
        dates.push(toISODate(current));
        current.setDate(current.getDate() + 14);
      }

    } else if (frequency === 'weekly') {
      while (current.getFullYear() < targetYear) {
        current.setDate(current.getDate() + 7);
      }
      while (current.getFullYear() === targetYear) {
        dates.push(toISODate(current));
        current.setDate(current.getDate() + 7);
      }

    } else if (frequency === 'semimonthly') {
      // Always 1st and 15th of each month (24 pay periods)
      for (let m = 0; m < 12; m++) {
        dates.push(toISODate(new Date(targetYear, m, 1, 12)));
        dates.push(toISODate(new Date(targetYear, m, 15, 12)));
      }

    } else if (frequency === 'monthly') {
      // Same day of month, once a month
      const day = current.getDate();
      for (let m = 0; m < 12; m++) {
        dates.push(toISODate(new Date(targetYear, m, day, 12)));
      }
    }

    return dates;
  }

  // Helper: Date → "YYYY-MM-DD"
  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Returns payday dates that fall within a specific month
  // month is 1-indexed (January = 1)
  function getPaydaysInMonth(allDates, year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return allDates.filter(d => d.startsWith(prefix));
  }

  // Returns how many paychecks fall in each month of the year,
  // respecting manual overrides stored in state.monthOverrides.
  // Returns array of 12 objects: { month (1-12), year, count, isOverride }
  function getMonthPaycheckCounts(paydayDates, monthOverrides, year) {
    const result = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const auto = getPaydaysInMonth(paydayDates, year, m).length;
      const override = monthOverrides && monthOverrides[key];
      result.push({
        month: m,
        year,
        count: override ? override.paycheckCount : auto,
        autoCount: auto,
        isOverride: !!override
      });
    }
    return result;
  }

  // ── Default State ─────────────────────────────────────────
  // Called only when no saved data exists (first launch).
  // Pre-populated with David's real categories and accounts
  // from House_Budgetper.xlsx — user will fine-tune in Setup.
  function createDefaultState() {
    const firstPayday = '2026-01-09'; // First payday of 2026
    const frequency   = 'biweekly';
    const currentYear = 2026;
    const paydayDates = calculatePaydayDates(firstPayday, frequency, currentYear);

    return {
      // ── Schema version — bump when adding migrations ──
      version: '1.5',

      // ── User identity ──────────────────────────────────
      user: {
        name:        'David',
        partnerName: 'Yamel'
      },

      // ── Income config ──────────────────────────────────
      income: {
        frequency:              frequency,   // biweekly | weekly | semimonthly | monthly
        defaultPaycheckAmount:  3000,        // gross or net — David uses net
        firstPaydayOfYear:      firstPayday,
        paychecksPerYear:       26,          // auto-derived from frequency
        paydayDates:            paydayDates, // all dates for current year
        // Optional partner income
        partnerEnabled:            false,
        partnerFrequency:          'biweekly',
        partnerPaycheckAmount:     0,
        partnerFirstPayday:        ''
      },

      // ── Month overrides ────────────────────────────────
      // Key: "YYYY-MM"  Value: { paycheckCount: 2 | 3 }
      // Only populated when user manually overrides the auto-detected count
      monthOverrides: {},

      // ── Yearly savings / spending goals ───────────────
      // annualGoal ÷ paychecksPerYear = per-paycheck allocation.
      // User adds/removes/edits in Setup → cascades everywhere.
      // Aligned to House_Budgetper.xlsx Savings Plan sheet (May 2026 actuals).
      yearlyCategories: [
        { id: generateId(), name: 'Gasoline',          annualGoal: 2400,  weeklyBudget: 50,  weeklyDay: 'saturday', targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Food / Groceries',  annualGoal: 7200,  weeklyBudget: 150, weeklyDay: 'sunday',   targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Car Maintenance',   annualGoal: 4000  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Asamblea',          annualGoal: 1200  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Emergencia',        annualGoal: 10000 , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Car Savings',       annualGoal: 5000  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Vacation Fund',     annualGoal: 5000  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Roth IRA — David',  annualGoal: 7500  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Roth IRA — Yamel',  annualGoal: 7500  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Amica Insurance',   annualGoal: 1500  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Clothing',          annualGoal: 1200  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null },
        { id: generateId(), name: 'Fun Money',         annualGoal: 2000  , weeklyBudget: null, weeklyDay: null, targetDate: null, targetAmount: null }
      ],

      // ── Fixed monthly expenses ─────────────────────────
      // These hit every month regardless of paycheck count.
      // effectiveDate: the date this amount takes effect (handles rent changes, etc.)
      // paycheckAssign: 1 or 2 (which paycheck in the month covers it)
      fixedMonthlyExpenses: [
        { id: generateId(), name: 'Rent',      amount: 1697.75, effectiveDate: '2026-06-01', paycheckAssign: 1 },
        { id: generateId(), name: 'Cell',      amount: 50.00,   effectiveDate: '2026-01-01', paycheckAssign: 2 },
        { id: generateId(), name: 'Netflix',   amount: 10.00,   effectiveDate: '2026-01-01', paycheckAssign: 2 }
      ],

      // ── Accounts ───────────────────────────────────────
      accounts: {
        // Bank / savings accounts — balances from House_Budgetper.xlsx May 2026
        // isTransferAccount: true = account used to pay off credit cards
        // liquidityTier: 'immediate' | 'short' | 'locked' (used for net worth breakdown)
        bank: [
          { id: generateId(), name: 'SoFi Checking',             balance: 0,          isTransferAccount: false, liquidityTier: 'immediate' },
          { id: generateId(), name: 'SoFi Transfer Account',     balance: 3312.99,    isTransferAccount: true,  liquidityTier: 'immediate' },
          { id: generateId(), name: 'American Eagle Checking',   balance: 76.46,      isTransferAccount: false, liquidityTier: 'immediate' },
          { id: generateId(), name: 'Emergency Fidelity Cash',   balance: 11062.73,   isTransferAccount: false, liquidityTier: 'short'     },
          { id: generateId(), name: 'Car Savings (Fidelity SGOV)', balance: 24917.56, isTransferAccount: false, liquidityTier: 'short'     }
        ],

        // Envelope vaults — all 20 from House_Budgetper.xlsx Bank Accounts sheet (May 2026).
        // Total should reconcile to SoFi online balance.
        vaults: [
          { id: generateId(), name: 'Gasoline',         balance: 250.00, targetAmount: null,  items: [] },
          { id: generateId(), name: 'Asamblea',         balance: 872.21, targetAmount: null,  items: [] },
          { id: generateId(), name: 'Bilt / Rent',      balance: 2284.52, targetAmount: null, items: [] },
          { id: generateId(), name: 'Entertainment',    balance: 300.00, targetAmount: null,  items: [] },
          { id: generateId(), name: 'Food',             balance: 750.00, targetAmount: null,  items: [] },
          { id: generateId(), name: 'Car Maintenance',  balance: 247.99, targetAmount: null,  items: [] },
          { id: generateId(), name: 'Eversource',       balance: 274.71, targetAmount: null,  items: [] },
          { id: generateId(), name: 'CNG',              balance: 102.63, targetAmount: null,  items: [] },
          { id: generateId(), name: 'Car Taxes',        balance: 268.69, targetAmount: null,  items: [] },
          { id: generateId(), name: 'Hold Account',     balance: 183.99, targetAmount: null,  items: [
            { id: generateId(), name: 'Viki',       amount: 6.99  },
            { id: generateId(), name: 'YouTube',    amount: 22.99 },
            { id: generateId(), name: 'Netflix',    amount: 10.00 },
            { id: generateId(), name: 'ChatGPT',    amount: 22.00 },
            { id: generateId(), name: 'Claude',     amount: 22.00 },
            { id: generateId(), name: 'Apple',      amount: 3.99  },
            { id: generateId(), name: 'Cox',        amount: 30.00 },
            { id: generateId(), name: 'Visible',    amount: 25.00 },
            { id: generateId(), name: 'Microsoft',  amount: 9.99  },
            { id: generateId(), name: 'Costco',     amount: 31.03 }
          ]},
          { id: generateId(), name: 'Slush Fund',       balance: 32.00, targetAmount: null,   items: [] },
          { id: generateId(), name: 'Amica Insurance',  balance: 0.72, targetAmount: null,    items: [] },
          { id: generateId(), name: 'Vacation Fund',    balance: 0.00, targetAmount: null,    items: [] },
          { id: generateId(), name: 'Yamel Personal',   balance: 0.00, targetAmount: null,    items: [] },
          { id: generateId(), name: 'David Personal',   balance: 0.00, targetAmount: null,    items: [] },
          { id: generateId(), name: 'Investing',        balance: 0.00, targetAmount: null,    items: [] },
          { id: generateId(), name: 'Clothing',         balance: 0.00, targetAmount: null,    items: [] },
          { id: generateId(), name: 'Taxes',            balance: 17.30, targetAmount: null,   items: [] },
          { id: generateId(), name: 'Emergency',        balance: 0.00, targetAmount: null,    items: [] },
          { id: generateId(), name: 'Misc',             balance: 0.00, targetAmount: null,    items: [] }
        ],

        // All 10 credit cards — balances from House_Budgetper.xlsx May 2026.
        // balance = current amount owed, limit = credit limit.
        cards: [
          { id: generateId(), name: 'Apple Card',       limit: 16000, balance: 0       },
          { id: generateId(), name: 'Bank of America',  limit: 12000, balance: 0       },
          { id: generateId(), name: 'Wells Fargo',      limit: 10000, balance: 0       },
          { id: generateId(), name: 'Capital One',      limit: 5000,  balance: 0       },
          { id: generateId(), name: 'Chase Flex David', limit: 14800, balance: 607.10  },
          { id: generateId(), name: 'Chase Freedom',    limit: 13500, balance: 0       },
          { id: generateId(), name: 'Chase Yamel',      limit: 12600, balance: 0       },
          { id: generateId(), name: 'Citi Double Cash', limit: 15000, balance: 1975.42 },
          { id: generateId(), name: 'Costco (Citi)',    limit: 12200, balance: 730.47  },
          { id: generateId(), name: 'Discover',         limit: 17000, balance: 0       }
        ]
      },

      // ── Investment accounts ────────────────────────────
      // Holdings use unique IDs so add/edit/remove never breaks unrelated records.
      // targetPct = target allocation percentage (must sum to 100 per account).
      investments: {
        accounts: [
          {
            id: generateId(),
            name: "David's Roth (Fidelity)",
            holdings: [
              { id: generateId(), ticker: 'VOO',  shares: 0, price: 0, targetPct: 45 },
              { id: generateId(), ticker: 'SCHD', shares: 0, price: 0, targetPct: 25 },
              { id: generateId(), ticker: 'SCHG', shares: 0, price: 0, targetPct: 20 },
              { id: generateId(), ticker: 'IBIT', shares: 0, price: 0, targetPct: 5  },
              { id: generateId(), ticker: 'VXUS', shares: 0, price: 0, targetPct: 5  }
            ],
            ytdContribution: 0,
            annualGoal: 7000
          },
          {
            id: generateId(),
            name: "Yamel's Roth (Fidelity)",
            holdings: [],
            ytdContribution: 0,
            annualGoal: 7000
          }
        ]
      },

      // ── Paycheck plan data ─────────────────────────────
      // Keyed by "YYYY-MM", then by paycheck index (1, 2, or 3 for 5-week months).
      // Populated when user opens Paycheck Planner and saves a plan.
      // { amount, expenses: [{categoryId, amount, locked}], customItems: [{name, amount}] }
      paychecks: {},

      // ── Audit journal (append-only) ──────────────────────
      // Every money movement creates a journal entry. Never edit or delete —
      // create a reversal entry instead. See ENGINE_UPGRADE_SPEC for schema.
      journal: [],

      // ── Transaction log ────────────────────────────────
      // Each entry: { id, date, categoryId, categoryName, amount, accountId, accountName, note, paycheckPeriod }
      // paycheckPeriod = "YYYY-MM-NN" (month + paycheck index)
      transactions: [],

      // ── Upcoming expenses ──────────────────────────────
      // Future one-time expenses planned into a specific month/paycheck.
      // { id, month:'YYYY-MM', payee, amount, note, applied, paycheckNum }
      // applied=true pulls it into that month's paycheck as a custom item.
      upcomingExpenses: [],

      // ── Net worth history ──────────────────────────────
      // Logged once per month (on first open of that month).
      // { date: "YYYY-MM-DD", netWorth, investments, cash, debt }
      netWorthHistory: [],

      // ── Paycheck notes ─────────────────────────────────
      // Free-text notes per paycheck. Key: "YYYY-MM-N" (month + check#).
      paycheckNotes: {},

      // ── Tracker ledger ─────────────────────────────────
      // Editable savings record per pay period.
      // Key: period index (0-based string). Value: { amount, note }
      trackerEntries: {},

      // ── App settings ───────────────────────────────────
      settings: {
        theme:    'dark-neon', // 'dark-neon' | 'light' | 'system'
        currency: 'USD',
        lang:     'en',        // 'en' | 'es'
        excludeTransferFromDeficit: false
      },

      // Dated reminders: { id, text, amount, date }
      reminders: []
    };
  }

  // ── Migration ────────────────────────────────────────────
  // Runs on every load. Adds missing fields to existing saved state
  // without wiping data. Bump version after adding new migrations.
  function migrate(state) {
    // v1.0 → v1.1: add journal array + liquidityTier on bank accounts
    if (!state.journal) {
      state.journal = [];
    }
    if (state.accounts && state.accounts.bank) {
      state.accounts.bank.forEach(function(acct) {
        if (!acct.liquidityTier) {
          // Heuristic: transfer/checking = immediate, savings/SGOV = short
          if (acct.isTransferAccount || /checking/i.test(acct.name)) {
            acct.liquidityTier = 'immediate';
          } else if (/roth|ira|retirement/i.test(acct.name)) {
            acct.liquidityTier = 'locked';
          } else {
            acct.liquidityTier = 'short';
          }
        }
      });
    }
    // v1.4 -> v1.5: add lang + reminders
    if (state.settings && !state.settings.lang) state.settings.lang = 'en';
    if (!state.reminders) state.reminders = [];

    // Ensure settings.theme exists
    if (state.settings && !state.settings.theme) {
      state.settings.theme = 'dark-neon';
    }
    // v1.1 -> v1.2: vault sub-items + transfer exclude toggle
    if (state.accounts && state.accounts.vaults) {
      state.accounts.vaults.forEach(function(v) {
        if (!v.items) v.items = [];
        if (v.targetAmount === undefined) v.targetAmount = null;
      });
    }
    if (state.settings && state.settings.excludeTransferFromDeficit === undefined) {
      state.settings.excludeTransferFromDeficit = false;
    }
    // v1.2 -> v1.3: weekly budget + goal countdown + upcoming expenses on categories
    if (state.yearlyCategories) {
      state.yearlyCategories.forEach(function(cat) {
        if (cat.weeklyBudget === undefined) cat.weeklyBudget = null;
        if (cat.weeklyDay   === undefined) cat.weeklyDay   = null;
        if (cat.targetDate  === undefined) cat.targetDate  = null;
        if (cat.targetAmount === undefined) cat.targetAmount = null;
        // Auto-assign weekly day for Gasoline and Food by name
        if (!cat.weeklyDay && /gasoline/i.test(cat.name) && !cat.weeklyBudget) {
          cat.weeklyBudget = 50; cat.weeklyDay = 'saturday';
        }
        if (!cat.weeklyDay && /food/i.test(cat.name) && !cat.weeklyBudget) {
          cat.weeklyBudget = 150; cat.weeklyDay = 'sunday';
        }
      });
    }
    if (!state.upcomingExpenses) state.upcomingExpenses = [];
    // v1.3 -> v1.4: paycheck notes + tracker ledger
    if (!state.paycheckNotes)  state.paycheckNotes  = {};
    if (!state.trackerEntries) state.trackerEntries = {};
    state.version = '1.5';
    return state;
  }

  // ── Load / Save ───────────────────────────────────────────
  // loadState: returns saved state or defaults (first launch).
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        console.log('[Storage] No saved data — loading defaults.');
        return createDefaultState();
      }
      const saved = JSON.parse(raw);
      const migrated = migrate(saved);
      console.log('[Storage] Loaded saved state, version', migrated.version);
      return migrated;
    } catch (err) {
      console.warn('[Storage] Load failed, falling back to defaults:', err);
      return createDefaultState();
    }
  }

  // saveState: persists to localStorage. Called by App.setState().
  function saveState(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[Storage] Save failed:', err);
      // Surface error to user — could be quota exceeded
      if (typeof App.showToast === 'function') {
        App.showToast('Save failed — storage may be full.', 'error');
      } else {
        alert('Save failed — check browser storage quota.');
      }
    }
  }

  // ── JSON Export ───────────────────────────────────────────
  // Downloads full state as a timestamped JSON file.
  function exportJSON(data) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = toISODate(new Date());
    a.href     = url;
    a.download = `finance-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── JSON Import ───────────────────────────────────────────
  // Returns a Promise that resolves to the parsed state object.
  // Rejects with a descriptive error on bad files.
  function importJSON(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.name.endsWith('.json')) {
        reject(new Error('Please select a .json file.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.version) throw new Error('Invalid backup file — missing version field.');
          if (!data.user)    throw new Error('Invalid backup file — missing user data.');
          resolve(data);
        } catch (err) {
          reject(new Error('Could not read file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('File read error.'));
      reader.readAsText(file);
    });
  }

  // ── Currency formatter ────────────────────────────────────
  // Returns "$1,234.56" — used everywhere money is displayed.
  function formatCurrency(amount, showCents = true) {
    const n = Number(amount) || 0;
    return n.toLocaleString('en-US', {
      style:                 'currency',
      currency:              'USD',
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0
    });
  }


  // Deep clone state: returns a JSON-round-tripped copy so mutations
  // in modules never touch the live state object accidentally.
  function cloneState(state) {
    try {
      return JSON.parse(JSON.stringify(state));
    } catch (_) {
      return Object.assign({}, state);
    }
  }

  App.Storage = {
    generateId,
    toISODate,
    calculatePaydayDates,
    getPaydaysInMonth,
    getMonthPaycheckCounts,
    createDefaultState,
    migrate,
    loadState,
    saveState,
    exportJSON,
    importJSON,
    formatCurrency,
    cloneState
  };

})(window.App = window.App || {});
