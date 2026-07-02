(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const Storage = () => App.Storage;

  // ── EN/ES strings ──────────────────────────────────────────
  const STR = {
    en: {
      tab_dashboard: "Home", tab_accounts: "Accounts", tab_cards: "Cards",
      tab_paycheck: "Paycheck", tab_goals: "Goals", tab_notes: "Notes",
      tab_settings: "Settings", subtitle: "Home base for the House Budget",
      net_worth: "Net worth", bank_cash: "Bank cash", vaults: "Vaults", card_debt: "Card debt",
      cards_covered: "Cards covered", cards_short: "Cards short",
      next_paycheck: "Next Paycheck", open: "Open", no_plan: "No paycheck plan yet.",
      left_after: "Left after plan", over_planned: "Over planned", notes_changes: "Notes",
      add: "Add", no_notes: "No open notes.", credit_cards: "Credit Cards",
      total_owed: "Total owed", total_available: "Total available",
      nw_history: "Net worth history", no_history: "History builds as you save changes.",
      banking: "Banking", bank_accounts: "Bank Accounts", savings_vaults: "Savings Vaults",
      investments: "Investments", balance: "Balance", available: "Available",
      limit: "Limit", used: "used", cards_title: "Cards",
      cloud: "Cloud Backup", language: "Language", theme: "Theme", dark: "Dark", light: "Light",
      appearance: "Appearance", reset: "Reset", open_notes: "Open",
      no_items: "No items yet.", no_cards: "No cards yet.",
      goals_title: "Savings Goals", goals_overall: "Overall Progress",
      goals_needed: "Biggest gap", goals_none: "No goals loaded yet.",
      upcoming_paydays: "Upcoming Paydays", allocation_split: "Allocation Split",
      source_workbook: "Source Workbook",
      completed_notes: "Completed Notes", no_completed: "No completed notes.",
      accounts: "Accounts",
    },
    es: {
      tab_dashboard: "Inicio", tab_accounts: "Cuentas", tab_cards: "Tarjetas",
      tab_paycheck: "Cheque", tab_goals: "Metas", tab_notes: "Notas",
      tab_settings: "Ajustes", subtitle: "Base del presupuesto de la casa",
      net_worth: "Patrimonio neto", bank_cash: "Efectivo en bancos", vaults: "Apartados", card_debt: "Deuda de tarjetas",
      cards_covered: "Tarjetas cubiertas", cards_short: "Tarjetas al descubierto",
      next_paycheck: "Proximo cheque", open: "Abrir", no_plan: "Aun no hay plan de cheque.",
      left_after: "Sobra tras el plan", over_planned: "Plan excedido", notes_changes: "Notas",
      add: "Agregar", no_notes: "Sin notas abiertas.", credit_cards: "Tarjetas de credito",
      total_owed: "Total adeudado", total_available: "Total disponible",
      nw_history: "Historial de patrimonio", no_history: "El historial crece al guardar cambios.",
      banking: "Bancos", bank_accounts: "Cuentas bancarias", savings_vaults: "Apartados de ahorro",
      investments: "Inversiones", balance: "Saldo", available: "Disponible",
      limit: "Limite", used: "usado", cards_title: "Tarjetas",
      cloud: "Respaldo en la nube", language: "Idioma", theme: "Tema", dark: "Oscuro", light: "Claro",
      appearance: "Apariencia", reset: "Restablecer", open_notes: "Abiertas",
      no_items: "Sin elementos.", no_cards: "Sin tarjetas.",
      goals_title: "Metas de ahorro", goals_overall: "Progreso general",
      goals_needed: "Mayor diferencia", goals_none: "Sin metas cargadas.",
      upcoming_paydays: "Proximos dias de pago", allocation_split: "Division de asignacion",
      source_workbook: "Workbook de origen",
      completed_notes: "Notas completadas", no_completed: "Sin notas completadas.",
      accounts: "Cuentas",
    },
  };
  let LANG = "en";
  const t = (key) => (STR[LANG] && STR[LANG][key]) || STR.en[key] || key;

  function applyChrome() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      const label = btn.querySelector(".tab-label");
      if (label) label.textContent = t("tab_" + btn.dataset.tab);
    });
    const sub = document.querySelector(".app-header__subtitle");
    if (sub) sub.textContent = t("subtitle");
    document.documentElement.lang = LANG;
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function money(value, cents) { return Storage().formatCurrency(value, cents); }

  function total(list, field) {
    return (list || []).reduce((sum, item) => sum + (Number(item[field || "balance"]) || 0), 0);
  }

  function findTransferAccount(accounts) {
    const list = accounts || [];
    const candidates = list.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      return item.role === "transfer" || name.includes("transfer account");
    });
    return candidates.find((item) => (Number(item.balance) || 0) > 0 && String(item.name || "").toLowerCase().includes("transfer account"))
      || candidates.find((item) => (Number(item.balance) || 0) > 0)
      || candidates[0]
      || null;
  }

  function metrics(state) {
    const bank = total(state.accounts, "balance");
    const vaults = total(state.vaults, "balance");
    const cards = total(state.creditCards, "balance");
    const invest = total(state.investments, "balance");
    const cardAvailable = total(state.creditCards, "available");
    const billsTotal = total(state.bills, "amount");
    const transfer = findTransferAccount(state.accounts);
    const liquidBal = (state.accounts || [])
      .filter(function(a) { return a.role === "transfer" || a.role === "immediate" || a.role === "checking"; })
      .reduce(function(sum, a) { return sum + (Number(a.balance) || 0); }, 0);
    const paycheckTotal = total(state.paycheckPlan, "amount");
    return {
      bank, vaults, cards, invest, cardAvailable, billsTotal,
      transferBalance: transfer ? Number(transfer.balance) || 0 : 0,
      transferName: transfer ? transfer.name : "Transfer account",
      netWorth: bank + vaults + invest - cards,
      transferGap: liquidBal - cards,
      paycheckTotal,
      paycheckLeft: (Number(state.settings.paycheckAmount) || 0) - paycheckTotal,
      openNotes: (state.notes || []).filter((note) => note.status !== "done").length,
    };
  }

  function getNextPayday(state) {
    const seed = (state.settings && state.settings.nextPayday) || "";
    if (!seed) return null;
    const perYear = Number((state.settings && state.settings.paychecksPerYear) || 26);
    const intervalMs = Math.round(365 / perYear) * 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let d = new Date(seed + "T12:00:00");
    while (d < today) d = new Date(d.getTime() + intervalMs);
    return d.toISOString().slice(0, 10);
  }

  function getUpcomingPaydays(state, count) {
    const seed = (state.settings && state.settings.nextPayday) || "";
    if (!seed) return [];
    const perYear = Number((state.settings && state.settings.paychecksPerYear) || 26);
    const intervalMs = Math.round(365 / perYear) * 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let d = new Date(seed + "T12:00:00");
    while (d < today) d = new Date(d.getTime() + intervalMs);
    const days = [];
    for (let i = 0; i < (count || 8); i++) {
      days.push(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + intervalMs);
    }
    return days;
  }

  function button(label, action, cls) {
    return '<button class="btn ' + (cls || "btn--secondary") + '" data-action="' + action + '">' + label + "</button>";
  }

  function row(label, value) {
    return '<div class="mini-row"><span>' + esc(label) + "</span><strong>" + esc(value) + "</strong></div>";
  }

  function empty(text) { return '<div class="empty-state">' + esc(text) + "</div>"; }

  function kpi(label, value, tone) {
    return '<div class="kpi kpi--' + (tone || "neutral") + '"><span>' + esc(label) + "</span><strong>" + esc(value) + "</strong></div>";
  }

  function noteRow(note, editable) {
    return '<div class="note-row"><div><strong>' + esc(note.text) + "</strong><span>" + esc(note.date || "") +
      (note.amount ? " &middot; " + money(note.amount) : "") + "</span></div>" +
      (editable ? '<button class="link-btn" data-action="done-note" data-id="' + esc(note.id) + '">Done</button>' : "") +
      "</div>";
  }

  // ── SVG Charts ────────────────────────────────────────────────

  function svgDonut(usedVal, totalVal, ariaLabel, sublabel) {
    var pct = totalVal > 0 ? Math.min(100, (usedVal / totalVal) * 100) : 0;
    var r = 52;
    var circ = 2 * Math.PI * r;
    var dash = (pct / 100) * circ;
    var strokeColor = pct >= 80 ? "var(--color-error)" : pct >= 40 ? "var(--color-warning)" : "var(--color-primary)";
    return '<svg viewBox="0 0 120 120" width="120" height="120" style="display:block;margin:0 auto" role="img" aria-label="' + esc(ariaLabel) + '">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--color-surface-2,rgba(143,151,184,.18))" stroke-width="14"/>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + strokeColor + '" stroke-width="14"' +
        ' stroke-dasharray="' + dash.toFixed(1) + " " + circ.toFixed(1) + '"' +
        ' stroke-linecap="round" transform="rotate(-90 60 60)"/>' +
      '<text x="60" y="54" text-anchor="middle" dominant-baseline="middle" font-size="20" font-weight="700" fill="var(--color-text)" font-family="inherit">' + Math.round(pct) + '%</text>' +
      '<text x="60" y="72" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="var(--text-secondary)" font-family="inherit">' + esc(sublabel || "") + '</text>' +
      '</svg>';
  }

  function svgVaultRing(pct) {
    var s = 56, r = 21;
    var circ = 2 * Math.PI * r;
    var dash = (Math.min(100, pct) / 100) * circ;
    return '<svg viewBox="0 0 56 56" width="56" height="56" style="flex-shrink:0" role="img" aria-label="' + Math.round(pct) + '%">' +
      '<circle cx="28" cy="28" r="' + r + '" fill="none" stroke="var(--color-surface-2,rgba(143,151,184,.18))" stroke-width="6"/>' +
      '<circle cx="28" cy="28" r="' + r + '" fill="none" stroke="var(--color-primary)" stroke-width="6"' +
        ' stroke-dasharray="' + dash.toFixed(1) + " " + circ.toFixed(1) + '"' +
        ' stroke-linecap="round" transform="rotate(-90 28 28)"/>' +
      '<text x="28" y="28" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="600" fill="var(--color-text)" font-family="inherit">' + Math.round(pct) + '%</text>' +
      '</svg>';
  }

  function utilizationBar(pct) {
    var color = pct >= 80 ? "var(--color-error)" : pct >= 40 ? "var(--color-warning)" : "var(--color-primary)";
    return '<div style="height:6px;background:var(--color-surface-2,rgba(143,151,184,.18));border-radius:999px;margin:6px 0 10px;overflow:hidden">' +
      '<div style="width:' + Math.min(100, pct) + '%;height:6px;background:' + color + ';border-radius:999px;transition:width .4s ease"></div></div>';
  }

  function balanceBar(val, maxVal, label) {
    var pct = maxVal > 0 ? Math.min(100, (Math.abs(val) / maxVal) * 100) : 0;
    return '<div style="margin-bottom:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span style="font-weight:600;font-size:.95rem">' + esc(label) + '</span>' +
        '<strong style="font-size:1rem;font-family:var(--font-mono);color:var(--color-primary)">' + money(val) + '</strong>' +
      '</div>' +
      '<div style="height:8px;background:var(--color-surface-2,rgba(143,151,184,.18));border-radius:999px;overflow:hidden">' +
      '<div style="width:' + pct.toFixed(1) + '%;height:8px;background:var(--color-primary);border-radius:999px;transition:width .4s ease"></div></div></div>';
  }

  // ── Render: Home ──────────────────────────────────────────────

  function renderHome(state) {
    var m = metrics(state);
    var cardStatus = m.transferGap >= 0 ? "ok" : "warn";
    var cardText = m.transferGap >= 0 ? t("cards_covered") : t("cards_short");
    var notes = (state.notes || []).filter(function(n) { return n.status !== "done"; }).slice(0, 4);
    var nextPlan = (state.paycheckPlan || []).slice(0, 6);
    return '<div class="workbook-hero"><div><div class="eyebrow">Workbook dashboard</div>' +
      "<h1>House Budgetper</h1><p>Live view of your finances — workbook is source of truth.</p></div></div>" +
      '<section class="kpi-grid">' +
        kpi(t("net_worth"), money(m.netWorth), m.netWorth >= 0 ? "good" : "bad") +
        kpi(t("bank_cash"), money(m.bank), "neutral") +
        kpi(t("vaults"), money(m.vaults), "neutral") +
        kpi(t("card_debt"), money(m.cards), m.cards > 0 ? "bad" : "good") +
      "</section>" +
      '<section class="status-card status-card--' + cardStatus + '">' +
        "<div><div class=\"status-title\">" + cardText + "</div>" +
        "<div class=\"status-sub\">Liquid cash vs total card balance</div></div>" +
        "<strong>" + money(Math.abs(m.transferGap)) + "</strong></section>" +
      '<section class="two-col">' +
        '<div class="card"><div class="card-head"><div>' +
          '<div class="card-title">' + t("next_paycheck") + "</div>" +
          '<div class="card-subtitle">' + esc(getNextPayday(state) || "No date set") + " &middot; " + money(state.settings.paycheckAmount) + "</div>" +
        "</div>" +
        '<button class="link-btn" data-action="go-paycheck">' + t("open") + "</button></div>" +
        '<div class="mini-list">' + (nextPlan.map(function(item) { return row(item.name, money(item.amount)); }).join("") || empty(t("no_plan"))) + "</div>" +
        '<div class="summary-line ' + (m.paycheckLeft >= 0 ? "text-green" : "text-red") + '">' +
          "<span>" + (m.paycheckLeft >= 0 ? t("left_after") : t("over_planned")) + "</span>" +
          "<strong>" + money(Math.abs(m.paycheckLeft)) + "</strong></div></div>" +
        '<div class="card"><div class="card-head"><div>' +
          '<div class="card-title">' + t("notes_changes") + "</div>" +
          '<div class="card-subtitle">' + m.openNotes + " open</div></div>" +
          '<button class="link-btn" data-action="add-note">' + t("add") + "</button></div>" +
          '<div class="mini-list">' + (notes.map(function(n) { return noteRow(n); }).join("") || empty(t("no_notes"))) + "</div></div>" +
      "</section>" +
      '<section class="two-col">' +
        '<div class="card"><div class="card-head"><div>' +
          '<div class="card-title">' + t("credit_cards") + "</div>" +
          '<div class="card-subtitle">' + (state.creditCards || []).length + " cards</div></div>" +
          '<button class="link-btn" data-action="go-cards">' + t("open") + "</button></div>" +
          '<div class="mini-list">' + row(t("total_owed"), money(m.cards)) + row(t("total_available"), money(m.cardAvailable)) + "</div></div>" +
        '<div class="card"><div class="card-title">' + t("nw_history") + "</div>" + sparkline(state.snapshots) + "</div>" +
      "</section>";
  }

  // ── Render: Cards ─────────────────────────────────────────────

  function renderCards(state) {
    var m = metrics(state);
    var totalUsed = m.cards;
    var totalAvail = m.cardAvailable;
    return '<div class="view-title"><div><div class="eyebrow">Read-only &middot; Updated from workbook</div>' +
      "<h2>" + t("cards_title") + "</h2></div></div>" +
      '<section class="kpi-grid">' +
        kpi(t("total_owed"), money(totalUsed), totalUsed > 0 ? "bad" : "good") +
        kpi(t("total_available"), money(totalAvail), "good") +
        kpi(t("cards_covered"), money(m.transferGap), m.transferGap >= 0 ? "good" : "bad") +
      "</section>" +
      '<div class="card" style="text-align:center;padding:24px 16px">' +
        '<div class="card-title" style="margin-bottom:16px">Overall utilization</div>' +
        svgDonut(totalUsed, totalUsed + totalAvail, "Card utilization", "used") +
        '<div style="margin-top:12px;display:flex;justify-content:center;gap:24px">' +
          '<div><div class="text-secondary text-sm">' + t("total_owed") + "</div><strong>" + money(totalUsed) + "</strong></div>" +
          '<div><div class="text-secondary text-sm">' + t("available") + "</div><strong>" + money(totalAvail) + "</strong></div></div></div>" +
      (state.creditCards || []).map(function(card) {
        var limit = Number(card.limit) || 0;
        var bal = Number(card.balance) || 0;
        var avail = card.available != null ? Number(card.available) : Math.max(0, limit - bal);
        var denominator = limit || (bal + avail);
        var pct = denominator > 0 ? Math.min(100, Math.round((bal / denominator) * 100)) : 0;
        return '<div class="card"><div class="card-head"><div>' +
          '<div class="card-title">' + esc(card.name) + "</div>" +
          '<div class="card-subtitle">' + t("limit") + " " + money(card.limit) + " &middot; " + pct + "% " + t("used") + "</div></div></div>" +
          utilizationBar(pct) +
          '<div class="mini-list">' + row(t("balance"), money(bal)) + row(t("available"), money(avail)) + "</div></div>";
      }).join("") || empty(t("no_cards"));
  }

  // ── Render: Accounts ──────────────────────────────────────────

  function renderAccounts(state) {
    var m = metrics(state);
    var bankAccounts = state.accounts || [];
    var maxBank = bankAccounts.length ? Math.max.apply(null, bankAccounts.map(function(a) { return Math.abs(Number(a.balance) || 0); })) : 1;
    var vaults = state.vaults || [];
    return '<div class="view-title"><div><div class="eyebrow">Read-only &middot; Updated from workbook</div>' +
      "<h2>" + t("accounts") + "</h2></div></div>" +
      '<section class="kpi-grid">' +
        kpi(t("bank_cash"), money(m.bank), "neutral") +
        kpi(t("vaults"), money(m.vaults), "neutral") +
        kpi(t("card_debt"), money(m.cards), m.cards > 0 ? "bad" : "good") +
        kpi("Net liquid", money(m.transferGap), m.transferGap >= 0 ? "good" : "bad") +
      "</section>" +
      '<div class="card"><div class="card-title" style="margin-bottom:16px">' + t("bank_accounts") + "</div>" +
        (bankAccounts.map(function(a) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--border) 40%,transparent)">' +
            '<span style="font-weight:600;font-size:.95rem">' + esc(a.name) + '</span>' +
            '<strong style="font-family:var(--font-mono);color:var(--color-primary);font-size:1rem">' + money(Number(a.balance) || 0) + '</strong>' +
          '</div>';
        }).join("") || empty(t("no_items"))) +
      "</div>" +
      '<div class="card"><div class="card-title" style="margin-bottom:16px">' + t("savings_vaults") + "</div>" +
        (vaults.map(function(v) {
          var bal = Number(v.balance) || 0;
          var target = Number(v.target) || 0;
          var pct = target > 0 ? Math.min(100, (bal / target) * 100) : 0;
          var pctLabel = pct > 0 ? pct.toFixed(0) + '%' : '0%';
          return '<div style="margin-bottom:18px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
              '<span style="font-weight:600;font-size:.95rem">' + esc(v.name) + '</span>' +
              '<strong style="font-family:var(--font-mono);color:var(--color-primary);font-size:1rem">' + money(bal) + '</strong>' +
            '</div>' +
            (target > 0
              ? '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
                  '<span style="font-size:.78rem;color:var(--text-secondary)">' + money(bal) + ' of ' + money(target) + '</span>' +
                  '<span style="font-size:.78rem;color:var(--color-primary);font-weight:600">' + pctLabel + '</span>' +
                '</div>' +
                '<div style="height:8px;background:var(--color-surface-2,rgba(143,151,184,.18));border-radius:999px;overflow:hidden">' +
                  '<div style="width:' + pct.toFixed(1) + '%;height:8px;background:var(--color-primary);border-radius:999px;transition:width .4s ease"></div>' +
                '</div>'
              : '') +
          '</div>';
        }).join("") || empty(t("no_items"))) +
      "</div>" +
      ((state.investments || []).length ? '<div class="card"><div class="card-title" style="margin-bottom:12px">' + t("investments") + "</div>" +
        '<div class="mini-list">' + (state.investments || []).map(function(inv) { return row(inv.name, money(inv.balance)); }).join("") + "</div></div>" : "");
  }

  // ── Render: Paycheck ──────────────────────────────────────────

  function renderPaycheck(state) {
    var m = metrics(state);
    var payAmt = Number(state.settings.paycheckAmount) || 0;
    var plan = state.paycheckPlan || [];
    var upcomingDays = getUpcomingPaydays(state, 8);
    return '<div class="view-title"><div><div class="eyebrow">Read-only &middot; Updated from workbook</div>' +
      "<h2>" + t("next_paycheck") + "</h2></div></div>" +
      '<div class="card" style="text-align:center;padding:24px 16px">' +
        '<div class="card-title" style="margin-bottom:16px">' + t("allocation_split") + "</div>" +
        svgDonut(m.paycheckTotal, payAmt, "Paycheck allocation", "of " + money(payAmt, false)) +
        '<div style="margin-top:12px;display:flex;justify-content:center;gap:24px">' +
          "<div><div class=\"text-secondary text-sm\">Allocated</div><strong>" + money(m.paycheckTotal) + "</strong></div>" +
          '<div><div class="text-secondary text-sm">' + (m.paycheckLeft >= 0 ? t("left_after") : t("over_planned")) + "</div>" +
          '<strong class="' + (m.paycheckLeft >= 0 ? "text-green" : "text-red") + '">' + money(Math.abs(m.paycheckLeft)) + "</strong></div></div></div>" +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Allocation breakdown</div>' +
        '<div class="mini-list">' + (plan.map(function(item) { return row(item.name, money(item.amount)); }).join("") || empty(t("no_plan"))) + "</div>" +
        '<div class="summary-line ' + (m.paycheckLeft >= 0 ? "text-green" : "text-red") + '">' +
          "<span>" + (m.paycheckLeft >= 0 ? t("left_after") : t("over_planned")) + "</span>" +
          "<strong>" + money(Math.abs(m.paycheckLeft)) + "</strong></div></div>" +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">' + t("upcoming_paydays") + "</div>" +
        '<div class="mini-list">' +
          (upcomingDays.length
            ? upcomingDays.map(function(d, i) {
                return '<div class="mini-row"><span>' + d +
                  (i === 0 ? ' <span style="color:var(--color-primary);font-size:11px;font-weight:600;margin-left:6px">NEXT</span>' : "") +
                  "</span><strong>" + money(payAmt) + "</strong></div>";
              }).join("")
            : empty("No payday date set in Settings.")) +
        "</div></div>";
  }

  // ── Render: Goals ─────────────────────────────────────────────

  function renderGoals(state) {
    var goals = state.goals || [];
    if (!goals.length) {
      return '<div class="view-title"><div><div class="eyebrow">Pushed from workbook</div>' +
        "<h2>" + t("goals_title") + "</h2></div></div>" +
        '<div class="card">' + empty(t("goals_none")) + "</div>";
    }
    var totalTarget = goals.reduce(function(s, g) { return s + (Number(g.target) || 0); }, 0);
    var totalSaved = goals.reduce(function(s, g) { return s + (Number(g.saved) || 0); }, 0);
    var biggestGap = goals.reduce(function(max, g) {
      var gap = (Number(g.target) || 0) - (Number(g.saved) || 0);
      return gap > max.gap ? { gap: gap, name: g.name } : max;
    }, { gap: 0, name: "" });
    var sorted = goals.slice().sort(function(a, b) { return (Number(b.pct) || 0) - (Number(a.pct) || 0); });

    function emoji(pct) { return pct >= 75 ? "💪" : pct >= 40 ? "📈" : "🚀"; }

    return '<div class="view-title"><div><div class="eyebrow">Pushed from workbook</div>' +
      "<h2>" + t("goals_title") + "</h2></div></div>" +
      '<div class="card" style="text-align:center;padding:24px 16px">' +
        '<div class="card-title" style="margin-bottom:16px">' + t("goals_overall") + "</div>" +
        svgDonut(totalSaved, totalTarget, "Overall savings", money(totalSaved, false) + " saved") +
        '<div style="margin-top:12px;display:flex;justify-content:center;gap:24px">' +
          "<div><div class=\"text-secondary text-sm\">Saved</div><strong>" + money(totalSaved) + "</strong></div>" +
          "<div><div class=\"text-secondary text-sm\">Target</div><strong>" + money(totalTarget) + "</strong></div></div>" +
        (biggestGap.name ? '<div style="margin-top:12px;padding:10px 14px;background:var(--color-surface-2,rgba(143,151,184,.1));border-radius:var(--radius-md,16px);text-align:left">' +
          '<span class="text-secondary text-sm">' + t("goals_needed") + ": </span>" +
          "<strong>" + esc(biggestGap.name) + " &mdash; " + money(biggestGap.gap) + "</strong></div>" : "") +
      "</div>" +
      '<div class="card">' +
        sorted.map(function(g) {
          var pct = Number(g.pct) || 0;
          var saved = Number(g.saved) || 0;
          var target = Number(g.target) || 0;
          var color = pct >= 75 ? "var(--color-primary)" : pct >= 40 ? "var(--color-warning)" : "var(--color-error)";
          return '<div style="margin-bottom:16px">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">' +
              "<span style=\"font-weight:600\">" + esc(g.name) + " " + emoji(pct) + "</span>" +
              '<span class="text-secondary text-sm">' + pct.toFixed(1) + "%</span></div>" +
            '<div class="text-secondary text-sm" style="margin-bottom:4px">' + money(saved) + " / " + money(target) + "</div>" +
            '<div style="height:8px;background:var(--color-surface-2,rgba(143,151,184,.18));border-radius:999px;overflow:hidden">' +
              '<div style="width:' + Math.min(100, pct).toFixed(1) + "%;height:8px;background:" + color + ";border-radius:999px;transition:width .4s ease\"></div></div></div>";
        }).join("") +
      "</div>";
  }

  // ── Render: Notes ─────────────────────────────────────────────

  function renderNotes(state) {
    var openNotes = (state.notes || []).filter(function(n) { return n.status !== "done"; });
    var doneNotes = (state.notes || []).filter(function(n) { return n.status === "done"; }).slice(0, 8);
    return '<div class="view-title"><div><div class="eyebrow">Reminders &amp; workbook flags</div>' +
      "<h2>" + t("notes_changes") + "</h2></div>" +
      button("+ Add note", "add-note", "btn--primary") + "</div>" +
      '<div class="card"><div class="card-title">' + t("open_notes") + "</div>" +
        '<div class="mini-list">' + (openNotes.map(function(n) { return noteRow(n, true); }).join("") || empty(t("no_notes"))) + "</div></div>" +
      '<div class="card"><div class="card-title">' + t("completed_notes") + "</div>" +
        '<div class="mini-list">' + (doneNotes.map(function(n) { return noteRow(n, false); }).join("") || empty(t("no_completed"))) + "</div></div>";
  }

  // ── Render: Settings ─────────────────────────────────────────

  function renderSettings(state) {
    return '<div class="view-title"><div><div class="eyebrow">App setup</div><h2>Settings</h2></div></div>' +
      '<div class="card"><div class="card-title mb-8">' + t("appearance") + "</div>" +
        '<div class="theme-toggle-row"><span class="text-secondary text-sm">' + t("theme") + "</span>" +
        '<div class="theme-segment">' +
          '<button class="theme-seg-btn' + ((state.settings.theme || "dark") === "dark" ? " active" : "") + '" data-action="set-theme-dark">' + t("dark") + "</button>" +
          '<button class="theme-seg-btn' + (state.settings.theme === "light" ? " active" : "") + '" data-action="set-theme-light">' + t("light") + "</button>" +
        "</div></div></div>" +
      '<div class="card"><div class="card-title mb-8">' + t("language") + "</div>" +
        '<div class="theme-toggle-row"><span class="text-secondary text-sm">' + t("language") + "</span>" +
        '<div class="theme-segment">' +
          '<button class="theme-seg-btn' + ((state.settings.lang || "en") === "en" ? " active" : "") + '" data-action="set-lang-en">English</button>' +
          '<button class="theme-seg-btn' + (state.settings.lang === "es" ? " active" : "") + '" data-action="set-lang-es">Español</button>' +
        "</div></div></div>" +
      '<div class="card"><div class="card-title">' + t("cloud") + "</div>" +
        '<p class="help-text" id="cloud-status-line"></p>' +
        '<div class="button-row">' +
          button("Sign in / account", "cloud-account", "btn--secondary") +
          button("Cloud Save", "cloud-save", "btn--primary") +
          button("Cloud Restore", "cloud-restore", "btn--secondary") +
        "</div></div>" +
      '<div class="card"><div class="card-title">' + t("source_workbook") + "</div>" +
        '<div class="path-box">' + esc((state.workbook && state.workbook.sourcePath) || "") + "</div></div>" +
      '<div class="card danger-zone"><div class="card-title">' + t("reset") + "</div>" +
        '<p class="help-text">Clears local data only. Your Excel workbook is not affected.</p>' +
        button("Reset dashboard", "reset-dashboard", "btn--danger") + "</div>";
  }

  // ── Sparkline ─────────────────────────────────────────────────

  function sparkline(snapshots) {
    var points = (snapshots || []).slice(-60);
    if (points.length < 2) return '<div class="empty-state">' + t("no_history") + "</div>";
    var values = points.map(function(p) { return Number(p.netWorth) || 0; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var coords = values.map(function(v, i) {
      var x = (i / (values.length - 1)) * 280 + 10;
      var y = 64 - ((v - min) / span) * 48;
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    var lastDelta = values[values.length - 1] - values[0];
    return '<svg viewBox="0 0 300 80" style="width:100%;height:64px" role="img" aria-label="' + t("nw_history") + '">' +
      '<polyline points="' + coords.join(" ") + '" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      '<div class="summary-line ' + (lastDelta >= 0 ? "text-green" : "text-red") + '">' +
        "<span>" + points[0].date + " → " + points[points.length - 1].date + "</span>" +
        "<strong>" + (lastDelta >= 0 ? "+" : "-") + money(Math.abs(lastDelta)) + "</strong></div>";
  }

  // ── Note modal ────────────────────────────────────────────────

  function openNoteModal(state, api) {
    openModal('<div class="modal-title">Add Note</div>' +
      "<label>Note<textarea id=\"note-text\" rows=\"4\" placeholder=\"Reminder or workbook flag...\"></textarea></label>" +
      "<label>Amount (optional)<input id=\"note-amount\" type=\"number\" step=\"0.01\" placeholder=\"0.00\"></label>" +
      '<div class="button-row">' +
        '<button class="btn btn--secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn--primary" id="save-note">Save</button>' +
      "</div>");
    document.getElementById("save-note").addEventListener("click", function() {
      var text = document.getElementById("note-text").value.trim();
      if (!text) return api.showToast("Enter the note first.", "error");
      var amount = Number(document.getElementById("note-amount").value) || null;
      var next = Storage().clone(state);
      next.notes.unshift({ id: Storage().id(), date: Storage().todayISO(), text: text, amount: amount, status: "open", source: "app" });
      api.save(next);
      closeModal();
      api.showToast("Note saved", "success");
    });
  }

  function openModal(html) {
    var backdrop = document.getElementById("modal-backdrop");
    var content = document.getElementById("modal-content");
    content.innerHTML = html;
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
    backdrop.onclick = function(event) {
      if (event.target === backdrop || event.target.closest("[data-modal-close]")) closeModal();
    };
  }

  function closeModal() {
    var backdrop = document.getElementById("modal-backdrop");
    var content = document.getElementById("modal-content");
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
    content.innerHTML = "";
  }

  // ── Event wiring ──────────────────────────────────────────────

  function wire(container, state, api) {
    container.querySelectorAll("[data-action]").forEach(function(buttonEl) {
      buttonEl.addEventListener("click", function() { handleAction(buttonEl, state, api); });
    });
  }

  function handleAction(el, state, api) {
    var action = el.dataset.action;
    if (action === "go-paycheck") return api.showView("paycheck");
    if (action === "go-cards") return api.showView("cards");
    if (action === "add-note") return openNoteModal(state, api);
    if (action === "done-note") {
      var next = Storage().clone(state);
      var note = (next.notes || []).find(function(item) { return item.id === el.dataset.id; });
      if (note) note.status = "done";
      api.save(next);
      return;
    }
    if (action === "set-lang-en" || action === "set-lang-es") {
      var next = Storage().clone(state);
      next.settings.lang = action === "set-lang-es" ? "es" : "en";
      api.save(next);
      return;
    }
    if (action === "set-theme-dark" || action === "set-theme-light") {
      var next = Storage().clone(state);
      next.settings.theme = action === "set-theme-light" ? "light" : "dark";
      api.save(next);
      return;
    }
    if (action === "cloud-account") return api.cloudAccount && api.cloudAccount();
    if (action === "cloud-save") return api.cloudSave && api.cloudSave();
    if (action === "cloud-restore") return api.cloudRestore && api.cloudRestore();
    if (action === "reset-dashboard") {
      if (!confirm("Reset this dashboard's local data? Your Excel workbook will not be changed.")) return;
      api.save(Storage().defaultState());
    }
  }

  // ── Public API ────────────────────────────────────────────────

  App.Dashboard = {
    render: function(state, api) {
      LANG = (state.settings && state.settings.lang) === "es" ? "es" : "en";
      applyChrome();
      var screens = {
        dashboard: [document.getElementById("tab-dashboard"), renderHome],
        accounts: [document.getElementById("tab-accounts"), renderAccounts],
        cards: [document.getElementById("tab-cards"), renderCards],
        paycheck: [document.getElementById("tab-paycheck"), renderPaycheck],
        goals: [document.getElementById("tab-goals"), renderGoals],
        notes: [document.getElementById("tab-notes"), renderNotes],
        settings: [document.getElementById("tab-settings"), renderSettings],
      };
      Object.entries(screens).forEach(function(_ref) {
        var key = _ref[0], pair = _ref[1];
        var el = pair[0], renderer = pair[1];
        if (!el || key !== api.activeView) return;
        el.innerHTML = renderer(state, api);
        wire(el, state, api);
      });
      var cloudLineEl = document.getElementById("cloud-status-line");
      if (cloudLineEl) {
        var cloud = (api && api.cloudStatus) || {};
        cloudLineEl.textContent = cloud.ready
          ? cloud.signedIn
            ? "Signed in as " + (cloud.email || "cloud account") + ". Last cloud save: " + (cloud.lastSaved || "not saved yet") + "."
            : "Not signed in. Sign in once to save and restore your data."
          : "Cloud backup loading…";
      }
    },
  };
})(window);
