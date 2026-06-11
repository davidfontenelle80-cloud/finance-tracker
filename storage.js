(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const STORAGE_KEY = "financeDashboard_v1";
  const LEGACY_KEY = "financeApp_v1";

  function id() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function money(value) {
    return Number(value) || 0;
  }

  function round(value) {
    return Math.round(money(value) * 100) / 100;
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function defaultState() {
    return {
      version: "dashboard-1.0",
      updatedAt: new Date().toISOString(),
      workbook: {
        name: "House Budgetper.xlsx",
        sourcePath: "C:\\Users\\david\\OneDrive\\Accounting\\House Budgetper.xlsx",
        lastSnapshot: null,
      },
      settings: {
        theme: "dark",
        lang: "en",
        paycheckAmount: 3000,
        nextPayday: "",
        paychecksPerYear: 26,
      },
      accounts: [
        { id: id(), name: "SoFi Transfer Account", type: "bank", balance: 0, role: "transfer" },
        { id: id(), name: "SoFi Checking", type: "bank", balance: 0, role: "checking" },
        { id: id(), name: "Savings Account", type: "bank", balance: 0, role: "savings" },
      ],
      vaults: [
        { id: id(), name: "Hold Account", balance: 0, target: 0 },
        { id: id(), name: "Car Savings", balance: 0, target: 35000 },
        { id: id(), name: "Emergency Account", balance: 0, target: 39600 },
        { id: id(), name: "Asamblea", balance: 0, target: 1200 },
        { id: id(), name: "Clothing", balance: 0, target: 1200 },
      ],
      creditCards: [],
      investments: [],
      bills: [],
      snapshots: [],
      paycheckPlan: [
        { id: id(), name: "Transfer Account", amount: 0, destination: "SoFi Transfer Account" },
        { id: id(), name: "Hold / subscriptions", amount: 0, destination: "Hold Account" },
        { id: id(), name: "Car Savings", amount: 0, destination: "Car Savings" },
        { id: id(), name: "Emergency", amount: 0, destination: "Emergency Account" },
      ],
      notes: [
        {
          id: id(),
          date: todayISO(),
          text: "Use this dashboard as the quick input layer for House Budgetper.xlsx.",
          status: "open",
          source: "app",
        },
      ],
      transactions: [],
      pendingChanges: [],
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    const source = raw && typeof raw === "object" ? raw : {};

    if (source.version && String(source.version).startsWith("dashboard-")) {
      return {
        ...base,
        ...source,
        workbook: { ...base.workbook, ...(source.workbook || {}) },
        settings: { ...base.settings, ...(source.settings || {}) },
        accounts: Array.isArray(source.accounts) ? source.accounts : base.accounts,
        vaults: Array.isArray(source.vaults) ? source.vaults : base.vaults,
        creditCards: Array.isArray(source.creditCards) ? source.creditCards : base.creditCards,
        investments: Array.isArray(source.investments) ? source.investments : [],
        bills: Array.isArray(source.bills) ? source.bills : [],
        snapshots: Array.isArray(source.snapshots) ? source.snapshots : [],
        paycheckPlan: Array.isArray(source.paycheckPlan) ? source.paycheckPlan : base.paycheckPlan,
        notes: Array.isArray(source.notes) ? source.notes : base.notes,
        transactions: Array.isArray(source.transactions) ? source.transactions : [],
        pendingChanges: Array.isArray(source.pendingChanges) ? source.pendingChanges : [],
      };
    }

    return fromLegacyFinanceState(source, base);
  }

  function fromLegacyFinanceState(legacy, base) {
    const accounts = ((legacy.accounts && legacy.accounts.bank) || []).map((item) => ({
      id: item.id || id(),
      name: item.name || "Account",
      type: "bank",
      balance: round(item.balance),
      role: item.isTransferAccount ? "transfer" : item.liquidityTier || "bank",
    }));

    const vaults = ((legacy.accounts && legacy.accounts.vaults) || []).map((item) => ({
      id: item.id || id(),
      name: item.name || "Vault",
      balance: round(
        item.items && item.items.length
          ? item.items.reduce((sum, sub) => sum + money(sub.amount), 0)
          : item.balance
      ),
      target: round(item.targetAmount),
      items: item.items || [],
    }));

    const creditCards = ((legacy.accounts && legacy.accounts.cards) || []).map((card) => ({
      id: card.id || id(),
      name: card.name || "Credit Card",
      limit: round(card.limit),
      balance: round(card.balance),
      available: round((money(card.limit) || 0) - (money(card.balance) || 0)),
    }));

    const categories = legacy.yearlyCategories || [];
    const paycheckPlan = categories
      .filter((cat) => money(cat.annualGoal) > 0 || money(cat.weeklyBudget) > 0)
      .slice(0, 18)
      .map((cat) => ({
        id: cat.id || id(),
        name: cat.name,
        amount: round(cat.weeklyBudget ? cat.weeklyBudget : money(cat.annualGoal) / 26),
        destination: cat.name,
      }));

    const notes = []
      .concat(
        (legacy.reminders || []).map((note) => ({
          id: note.id || id(),
          date: note.date || todayISO(),
          text: note.text || "",
          status: note.done ? "done" : "open",
          amount: round(note.amount),
          source: "legacy reminder",
        }))
      )
      .concat(
        Object.entries(legacy.paycheckNotes || {}).map(([key, text]) => ({
          id: id(),
          date: todayISO(),
          text: `${key}: ${text}`,
          status: "open",
          source: "paycheck note",
        }))
      );

    return {
      ...base,
      version: "dashboard-1.0",
      updatedAt: new Date().toISOString(),
      settings: {
        ...base.settings,
        paycheckAmount: money(legacy.income && legacy.income.defaultPaycheckAmount) || 3000,
        nextPayday: nextPayday((legacy.income && legacy.income.paydayDates) || ""),
        paychecksPerYear: money(legacy.income && legacy.income.paychecksPerYear) || 26,
      },
      accounts: accounts.length ? accounts : base.accounts,
      vaults: vaults.length ? vaults : base.vaults,
      creditCards,
      paycheckPlan: paycheckPlan.length ? paycheckPlan : base.paycheckPlan,
      notes: notes.length ? notes : base.notes,
      transactions: legacy.transactions || [],
      pendingChanges: [],
    };
  }

  function nextPayday(paydays) {
    if (!Array.isArray(paydays)) return "";
    const today = todayISO();
    return paydays.find((date) => date >= today) || paydays[paydays.length - 1] || "";
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeState(JSON.parse(saved));

      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) return normalizeState(JSON.parse(legacy));
    } catch (err) {
      console.warn("[Finance Dashboard] load failed:", err);
    }
    return defaultState();
  }

  function netWorthOf(state) {
    const sum = (list) => (list || []).reduce((t, item) => t + (Number(item.balance) || 0), 0);
    return round(sum(state.accounts) + sum(state.vaults) + sum(state.investments) - sum(state.creditCards));
  }

  function saveState(state) {
    const next = normalizeState(state);
    // Net worth history: one point per day, updated in place on same-day saves
    const nw = netWorthOf(next);
    const today = todayISO();
    next.snapshots = Array.isArray(next.snapshots) ? next.snapshots : [];
    const last = next.snapshots[next.snapshots.length - 1];
    if (last && last.date === today) last.netWorth = nw;
    else next.snapshots.push({ date: today, netWorth: nw });
    if (next.snapshots.length > 200) next.snapshots = next.snapshots.slice(-200);
    next.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function addChange(state, change) {
    const next = clone(state);
    next.pendingChanges.unshift({
      id: id(),
      date: todayISO(),
      createdAt: new Date().toISOString(),
      ...change,
    });
    return next;
  }

  function exportJSON(state, kind) {
    const payload =
      kind === "changes"
        ? {
            version: "finance-dashboard-changes-1.0",
            exportedAt: new Date().toISOString(),
            workbook: state.workbook,
            changes: state.pendingChanges || [],
          }
        : normalizeState(state);

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      kind === "changes"
        ? `finance-dashboard-pending-changes-${todayISO()}.json`
        : `finance-dashboard-snapshot-${todayISO()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.name.toLowerCase().endsWith(".json")) {
        reject(new Error("Choose a JSON file."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch (err) {
          reject(new Error("That JSON file could not be read."));
        }
      };
      reader.onerror = () => reject(new Error("File read failed."));
      reader.readAsText(file);
    });
  }

  function mergeImportedState(current, imported) {
    if (imported && imported.version === "finance-dashboard-changes-1.0") {
      const next = clone(current);
      next.pendingChanges = (imported.changes || []).concat(next.pendingChanges || []);
      return next;
    }
    return normalizeState(imported);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function formatCurrency(value, cents) {
    return money(value).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: cents === false ? 0 : 2,
      maximumFractionDigits: cents === false ? 0 : 2,
    });
  }

  App.Storage = {
    id,
    todayISO,
    round,
    clone,
    defaultState,
    normalizeState,
    loadState,
    saveState,
    addChange,
    exportJSON,
    importJSON,
    mergeImportedState,
    formatCurrency,
  };
})(window);
