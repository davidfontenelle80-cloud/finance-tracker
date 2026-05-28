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
      version: '1.0',

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
      yearlyCategories: [
        { id: generateId(), name: 'Gasoline',         annualGoal: 2400  },
        { id: generateId(), name: 'Food / Groceries', annualGoal: 7200  },
        { id: generateId(), name: 'Car Maintenance',  annualGoal: 2673  },
        { id: generateId(), name: 'Asamblea',         annualGoal: 1000  },
        { id: generateId(), name: 'Emergencia',       annualGoal: 10979 },
        { id: generateId(), name: 'Car Savings',      annualGoal: 31000 },
        { id: generateId(), name: 'Vacation Fund',    annualGoal: 3000  },
        { id: generateId(), name: 'Roth IRA — David', annualGoal: 7000  },
        { id: generateId(), name: 'Roth IRA — Yamel', annualGoal: 7000  }
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
        // Bank / savings accounts
        // isTransferAccount: true = the account used to pay off credit cards
        bank: [
          { id: generateId(), name: 'SoFi Checking',   balance: 0,        isTransferAccount: false },
          { id: generateId(), name: 'Transfer Account', balance: 2355.53,  isTransferAccount: true  },
          { id: generateId(), name: 'Emergency (SGOV)', balance: 0,        isTransferAccount: false },
          { id: generateId(), name: 'Car Savings Acct', balance: 0,        isTransferAccount: false }
        ],

        // Envelope vaults (live inside SoFi — virtual sub-accounts)
        // There should be 14; David will add the remainder in Setup.
        vaults: [
          { id: generateId(), name: 'Gasoline',         balance: 0       },
          { id: generateId(), name: 'Rent',             balance: 1705.62 },
          { id: generateId(), name: 'Asamblea',         balance: 0       },
          { id: generateId(), name: 'Slush',            balance: 0       },
          { id: generateId(), name: 'Vacation',         balance: 0       },
          { id: generateId(), name: 'Car Maintenance',  balance: 0       },
          { id: generateId(), name: 'Emergencia',       balance: 0       },
          { id: generateId(), name: 'Car Savings',      balance: 0       },
          { id: generateId(), name: 'Roth — David',     balance: 0       },
          { id: generateId(), name: 'Roth — Yamel',     balance: 0       },
          { id: generateId(), name: 'Groceries',        balance: 0       },
          { id: generateId(), name: 'Cell / Phone',     balance: 0       },
          { id: generateId(), name: 'Netflix',          balance: 0       },
          { id: generateId(), name: 'Misc',             balance: 0       }
        ],

        // Credit cards — David has 10; Chase Flex is confirmed.
        // Add the other 9 in Setup → Accounts section.
        cards: [
          { id: generateId(), name: 'Chase Flex', limit: 14800, balance: 524.91 }
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

      // ── Transaction log ────────────────────────────────
      // Each entry: { id, date, categoryId, categoryName, amount, accountId, accountName, note, paycheckPeriod }
      // paycheckPeriod = "YYYY-MM-NN" (month + paycheck index)
      transactions: [],

      // ── Net worth history ──────────────────────────────
      // Logged once per month (on first open of that month).
      // { date: "YYYY-MM-DD", netWorth, investments, cash, debt }
      netWorthHistory: [],

      // ── App settings ───────────────────────────────────
      settings: {
        theme:    'dark-neon', // locked — do not expose toggle
        currency: 'USD'
      }
    };
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
      // Future: run version migrations here before returning
      console.log('[Storage] Loaded saved state, version', saved.version);
      return saved;
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

  // ── Expose public API ─────────────────────────────────────
  App.Storage = {
    generateId,
    toISODate,
    calculatePaydayDates,
    getPaydaysInMonth,
    getMonthPaycheckCounts,
    createDefaultState,
    loadState,
    saveState,
    exportJSON,
    importJSON,
    formatCurrency
  };

})(window.App = window.App || {});
