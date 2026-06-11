(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const Storage = () => App.Storage;

  // ── EN/ES strings ──────────────────────────────────────────
  const STR = {
    en: {
      tab_dashboard: "Home", tab_accounts: "Accounts", tab_cards: "Cards", tab_paycheck: "Paycheck",
      tab_changes: "Changes", tab_settings: "Settings", subtitle: "Home base for the House Budget",
      net_worth: "Net worth", bank_cash: "Bank cash", vaults: "Vaults", card_debt: "Card debt",
      cards_covered: "Cards covered", cards_short: "Cards short", vs_cards: "Transfer account vs total card balance",
      next_paycheck: "Next Paycheck", open: "Open", no_plan: "No paycheck plan yet.",
      left_after: "Left after plan", over_planned: "Over planned", notes_changes: "Notes & Changes",
      add: "Add", no_notes: "No open notes.", credit_cards: "Credit Cards", total_owed: "Total owed",
      total_available: "Total available", nw_history: "Net worth history", no_history: "History builds as you save changes.",
      banking: "Banking", bank_accounts: "Bank Accounts", savings_vaults: "Savings Vaults", investments: "Investments",
      add_item: "+ Add item", add_card: "+ Add card", add_investment: "+ Add investment", add_bill: "+ Add bill",
      quick_edit: "Quick edit", accounts: "Accounts", balance: "Balance", available: "Available",
      limit: "Limit", change_limit: "Change limit", limit_locked: "Tap to unlock", used: "used",
      enter_either: "Type the new balance OR the available credit. The other fills in from the limit.",
      save: "Save", delete: "Delete", cards_title: "Cards", cards_eyebrow: "Balance or available, either works",
      register: "Register", register_sub: "Every balance change, newest first", no_register: "No changes logged yet.",
      bills: "Recurring Bills", due_day: "Due day", bills_total: "Monthly bills total",
      paycheck_amount: "Paycheck amount", next_payday: "Next payday", allocation: "Allocation Checklist",
      add_line: "+ Add line", cloud: "Cloud Backup", import_title: "Import From Workbook or Backup",
      import_help: "Import a dashboard snapshot or workbook-generated JSON to refresh this dashboard.",
      choose_json: "Choose JSON file", export_title: "Export For Workbook",
      export_help: "Export pending changes for spreadsheet updates, or a full snapshot as a backup.",
      export_changes: "Export pending changes", export_snapshot: "Export full snapshot",
      source_workbook: "Source Workbook", language: "Language", theme: "Theme", dark: "Dark", light: "Light",
      appearance: "Appearance", reset: "Reset", open_notes: "Open", pending_json: "Pending JSON Changes",
      completed_notes: "Completed Notes", clear_pending: "Clear pending after workbook update",
      no_pending: "No pending changes.", no_completed: "No completed notes.", no_items: "No items yet.", no_cards: "No cards yet.",
    },
    es: {
      tab_dashboard: "Inicio", tab_accounts: "Cuentas", tab_cards: "Tarjetas", tab_paycheck: "Cheque",
      tab_changes: "Cambios", tab_settings: "Ajustes", subtitle: "Base del presupuesto de la casa",
      net_worth: "Patrimonio neto", bank_cash: "Efectivo en bancos", vaults: "Apartados", card_debt: "Deuda de tarjetas",
      cards_covered: "Tarjetas cubiertas", cards_short: "Tarjetas al descubierto", vs_cards: "Cuenta de transferencia vs saldo total de tarjetas",
      next_paycheck: "Próximo cheque", open: "Abrir", no_plan: "Aún no hay plan de cheque.",
      left_after: "Sobra tras el plan", over_planned: "Plan excedido", notes_changes: "Notas y cambios",
      add: "Agregar", no_notes: "Sin notas abiertas.", credit_cards: "Tarjetas de crédito", total_owed: "Total adeudado",
      total_available: "Total disponible", nw_history: "Historial de patrimonio", no_history: "El historial crece al guardar cambios.",
      banking: "Bancos", bank_accounts: "Cuentas bancarias", savings_vaults: "Apartados de ahorro", investments: "Inversiones",
      add_item: "+ Agregar", add_card: "+ Agregar tarjeta", add_investment: "+ Agregar inversión", add_bill: "+ Agregar factura",
      quick_edit: "Edición rápida", accounts: "Cuentas", balance: "Saldo", available: "Disponible",
      limit: "Límite", change_limit: "Cambiar límite", limit_locked: "Toca para desbloquear", used: "usado",
      enter_either: "Escribe el saldo nuevo O el crédito disponible. El otro se calcula con el límite.",
      save: "Guardar", delete: "Eliminar", cards_title: "Tarjetas", cards_eyebrow: "Saldo o disponible, cualquiera sirve",
      register: "Registro", register_sub: "Cada cambio de saldo, lo más reciente primero", no_register: "Sin cambios registrados.",
      bills: "Facturas recurrentes", due_day: "Día de pago", bills_total: "Total mensual de facturas",
      paycheck_amount: "Monto del cheque", next_payday: "Próximo día de pago", allocation: "Lista de asignación",
      add_line: "+ Agregar línea", cloud: "Respaldo en la nube", import_title: "Importar del workbook o respaldo",
      import_help: "Importa un respaldo JSON del dashboard o generado desde el workbook.",
      choose_json: "Elegir archivo JSON", export_title: "Exportar para el workbook",
      export_help: "Exporta cambios pendientes para actualizar la hoja, o un respaldo completo.",
      export_changes: "Exportar cambios pendientes", export_snapshot: "Exportar respaldo completo",
      source_workbook: "Workbook de origen", language: "Idioma", theme: "Tema", dark: "Oscuro", light: "Claro",
      appearance: "Apariencia", reset: "Restablecer", open_notes: "Abiertas", pending_json: "Cambios JSON pendientes",
      completed_notes: "Notas completadas", clear_pending: "Limpiar pendientes tras actualizar workbook",
      no_pending: "Sin cambios pendientes.", no_completed: "Sin notas completadas.", no_items: "Sin elementos.", no_cards: "Sin tarjetas.",
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
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function money(value, cents) {
    return Storage().formatCurrency(value, cents);
  }

  function total(list, field) {
    return (list || []).reduce((sum, item) => sum + (Number(item[field || "balance"]) || 0), 0);
  }

  function metrics(state) {
    const bank = total(state.accounts, "balance");
    const vaults = total(state.vaults, "balance");
    const cards = total(state.creditCards, "balance");
    const invest = total(state.investments, "balance");
    const cardAvailable = total(state.creditCards, "available");
    const billsTotal = total(state.bills, "amount");
    const transfer = (state.accounts || []).find((item) => item.role === "transfer");
    const paycheckTotal = total(state.paycheckPlan, "amount");
    return {
      bank,
      vaults,
      cards,
      transferBalance: transfer ? Number(transfer.balance) || 0 : 0,
      transferName: transfer ? transfer.name : "Transfer account",
      invest,
      cardAvailable,
      billsTotal,
      netWorth: bank + vaults + invest - cards,
      transferGap: (transfer ? Number(transfer.balance) || 0 : 0) - cards,
      paycheckTotal,
      paycheckLeft: (Number(state.settings.paycheckAmount) || 0) - paycheckTotal,
      openNotes: (state.notes || []).filter((note) => note.status !== "done").length,
      pending: (state.pendingChanges || []).length,
    };
  }

  function button(label, action, cls) {
    return `<button class="btn ${cls || "btn--secondary"}" data-action="${action}">${label}</button>`;
  }

  function renderHome(state) {
    const m = metrics(state);
    const cardStatus = m.transferGap >= 0 ? "ok" : "warn";
    const cardText = m.transferGap >= 0 ? "Cards covered" : "Cards short";
    const notes = (state.notes || []).filter((note) => note.status !== "done").slice(0, 4);
    const nextPlan = (state.paycheckPlan || []).slice(0, 6);

    return `
      <div class="workbook-hero">
        <div>
          <div class="eyebrow">Workbook dashboard</div>
          <h1>House Budgetper</h1>
          <p>Quick view, quick edits, then export changes for the spreadsheet.</p>
        </div>
        <div class="hero-actions">
          ${button("Import JSON", "open-import", "btn--secondary")}
          ${button("Export changes", "export-changes", "btn--primary")}
        </div>
      </div>

      <section class="kpi-grid">
        ${kpi("Net worth", money(m.netWorth), m.netWorth >= 0 ? "good" : "bad")}
        ${kpi("Bank cash", money(m.bank), "neutral")}
        ${kpi("Vaults", money(m.vaults), "neutral")}
        ${kpi("Card debt", money(m.cards), m.cards > 0 ? "bad" : "good")}
      </section>

      <section class="status-card status-card--${cardStatus}">
        <div>
          <div class="status-title">${cardText}</div>
          <div class="status-sub">${esc(m.transferName)} vs total card balance</div>
        </div>
        <strong>${money(Math.abs(m.transferGap))}</strong>
      </section>

      <section class="two-col">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Next Paycheck</div>
              <div class="card-subtitle">${esc(state.settings.nextPayday || "No date set")} - ${money(state.settings.paycheckAmount)}</div>
            </div>
            <button class="link-btn" data-action="go-paycheck">Open</button>
          </div>
          <div class="mini-list">
            ${nextPlan.map((item) => row(item.name, money(item.amount))).join("") || empty("No paycheck plan yet.")}
          </div>
          <div class="summary-line ${m.paycheckLeft >= 0 ? "text-green" : "text-red"}">
            <span>${m.paycheckLeft >= 0 ? "Left after plan" : "Over planned"}</span>
            <strong>${money(Math.abs(m.paycheckLeft))}</strong>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${t("notes_changes")}</div>
              <div class="card-subtitle">${m.openNotes} open notes - ${m.pending} pending workbook changes</div>
            </div>
            <button class="link-btn" data-action="add-note">Add</button>
          </div>
          <div class="mini-list">
            ${notes.map((note) => noteRow(note)).join("") || empty("No open notes.")}
          </div>
        </div>
      </section>

      <section class="two-col">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${t("credit_cards")}</div>
              <div class="card-subtitle">${(state.creditCards || []).length} cards</div>
            </div>
            <button class="link-btn" data-action="go-cards">${t("open")}</button>
          </div>
          <div class="mini-list">
            ${row(t("total_owed"), money(m.cards))}
            ${row(t("total_available"), money(m.cardAvailable))}
          </div>
        </div>

        <div class="card">
          <div class="card-title">${t("nw_history")}</div>
          ${sparkline(state.snapshots)}
        </div>
      </section>
    `;
  }

  function sparkline(snapshots) {
    const points = (snapshots || []).slice(-60);
    if (points.length < 2) return `<div class="empty-state">${t("no_history")}</div>`;
    const values = points.map((p) => Number(p.netWorth) || 0);
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const coords = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 280 + 10;
      const y = 64 - ((v - min) / span) * 48;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastDelta = values[values.length - 1] - values[0];
    return `
      <svg viewBox="0 0 300 80" style="width:100%;height:64px" role="img" aria-label="${t("nw_history")}">
        <polyline points="${coords.join(" ")}" fill="none" stroke="var(--color-primary)" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div class="summary-line ${lastDelta >= 0 ? "text-green" : "text-red"}">
        <span>${points[0].date} → ${points[points.length - 1].date}</span>
        <strong>${lastDelta >= 0 ? "+" : "-"}${money(Math.abs(lastDelta))}</strong>
      </div>
    `;
  }

  function renderPaycheck(state) {
    const m = metrics(state);
    return `
      <div class="view-title">
        <div>
          <div class="eyebrow">SoFi setup preview</div>
          <h2>Next Paycheck</h2>
        </div>
        ${button("+ Add line", "add-paycheck-line", "btn--primary")}
      </div>

      <div class="card">
        <div class="form-grid">
          <label>Paycheck amount
            <input type="number" step="0.01" value="${esc(state.settings.paycheckAmount)}" data-field="paycheckAmount">
          </label>
          <label>Next payday
            <input type="date" value="${esc(state.settings.nextPayday)}" data-field="nextPayday">
          </label>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Allocation Checklist</div>
        <div class="editor-list">
          ${(state.paycheckPlan || []).map((item) => editRow("paycheck", item, item.destination)).join("")}
        </div>
        <div class="summary-line ${m.paycheckLeft >= 0 ? "text-green" : "text-red"}">
          <span>${m.paycheckLeft >= 0 ? "Remaining after allocation" : "Allocation over paycheck"}</span>
          <strong>${money(Math.abs(m.paycheckLeft))}</strong>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${t("bills")}</div>
            <div class="card-subtitle">${t("due_day")} 1-31</div>
          </div>
          <button class="link-btn" data-action="add-bill">${t("add_bill")}</button>
        </div>
        <div class="editor-list">
          ${(state.bills || []).map((bill) => `
            <div class="edit-row" data-type="bill" data-id="${esc(bill.id)}">
              <input type="text" value="${esc(bill.name)}" data-edit="name" aria-label="Bill name">
              <input type="number" step="0.01" value="${esc(bill.amount)}" data-edit="amount" aria-label="Amount">
              <input type="number" step="1" min="1" max="31" value="${esc(bill.dueDay || 1)}" data-edit="dueDay" aria-label="${t("due_day")}">
              <button class="btn btn--secondary btn--sm" data-action="delete-row" data-type="bill" data-id="${esc(bill.id)}">${t("delete")}</button>
            </div>
          `).join("") || empty(t("no_items"))}
        </div>
        <div class="summary-line">
          <span>${t("bills_total")}</span>
          <strong>${money(m.billsTotal)}</strong>
        </div>
      </div>
    `;
  }

  function renderAccounts(state) {
    const m = metrics(state);
    return `
      <div class="view-title">
        <div>
          <div class="eyebrow">Quick edit</div>
          <h2>Accounts</h2>
        </div>
        ${button("+ Add item", "add-account-item", "btn--primary")}
      </div>

      <section class="kpi-grid">
        ${kpi("Bank", money(m.bank), "neutral")}
        ${kpi("Vaults", money(m.vaults), "neutral")}
        ${kpi("Cards owed", money(m.cards), m.cards > 0 ? "bad" : "good")}
        ${kpi("Transfer gap", money(m.transferGap), m.transferGap >= 0 ? "good" : "bad")}
      </section>

      ${accountGroup(t("bank_accounts"), "account", state.accounts || [])}
      ${accountGroup(t("savings_vaults"), "vault", state.vaults || [])}
      ${accountGroup(t("investments"), "investment", state.investments || [])}
    `;
  }

  function renderChanges(state) {
    const openNotes = (state.notes || []).filter((note) => note.status !== "done");
    const doneNotes = (state.notes || []).filter((note) => note.status === "done").slice(0, 8);
    return `
      <div class="view-title">
        <div>
          <div class="eyebrow">Workbook instructions</div>
          <h2>Notes & Changes</h2>
        </div>
        ${button("+ Add note", "add-note", "btn--primary")}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${t("register")}</div>
            <div class="card-subtitle">${t("register_sub")}</div>
          </div>
        </div>
        <div class="mini-list">
          ${(state.transactions || []).slice(0, 30).map((tx) => `
            <div class="note-row">
              <div>
                <strong>${esc(tx.target)}</strong>
                <span>${esc(tx.date)} · ${money(tx.from)} → ${money(tx.to)} (${tx.to - tx.from >= 0 ? "+" : "-"}${money(Math.abs((Number(tx.to) || 0) - (Number(tx.from) || 0)))})</span>
              </div>
            </div>
          `).join("") || empty(t("no_register"))}
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("open_notes")}</div>
        <div class="mini-list">
          ${openNotes.map((note) => noteRow(note, true)).join("") || empty(t("no_notes"))}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Pending JSON Changes</div>
        <div class="mini-list">
          ${(state.pendingChanges || []).map(changeRow).join("") || empty("No pending changes.")}
        </div>
        <div class="button-row">
          ${button("Export pending changes", "export-changes", "btn--primary")}
          ${button("Clear pending after workbook update", "clear-pending", "btn--secondary")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Completed Notes</div>
        <div class="mini-list">
          ${doneNotes.map((note) => noteRow(note, false)).join("") || empty("No completed notes.")}
        </div>
      </div>
    `;
  }

  function renderSettings(state) {
    return `
      <div class="view-title">
        <div>
          <div class="eyebrow">App setup</div>
          <h2>Settings</h2>
        </div>
      </div>

      <div class="card">
        <div class="form-grid">
          <label>Workbook name
            <input type="text" value="${esc(state.workbook.name)}" data-field="workbookName">
          </label>
          <label>Paychecks per year
            <input type="number" step="1" value="${esc(state.settings.paychecksPerYear)}" data-field="paychecksPerYear">
          </label>
        </div>
        <label>Workbook path
          <input type="text" value="${esc(state.workbook.sourcePath)}" data-field="workbookPath">
        </label>
      </div>

      <div class="card">
        <div class="card-title mb-8">Appearance</div>
        <div class="theme-toggle-row">
          <span class="text-secondary text-sm">Theme</span>
          <div class="theme-segment">
            <button class="theme-seg-btn${(state.settings.theme || "dark") === "dark" ? " active" : ""}" data-action="set-theme-dark">Dark</button>
            <button class="theme-seg-btn${state.settings.theme === "light" ? " active" : ""}" data-action="set-theme-light">Light</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-8">${t("language")}</div>
        <div class="theme-toggle-row">
          <span class="text-secondary text-sm">${t("language")}</span>
          <div class="theme-segment">
            <button class="theme-seg-btn${(state.settings.lang || "en") === "en" ? " active" : ""}" data-action="set-lang-en">English</button>
            <button class="theme-seg-btn${state.settings.lang === "es" ? " active" : ""}" data-action="set-lang-es">Español</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("cloud")}</div>
        <p class="help-text" id="cloud-status-line"></p>
        <div class="button-row">
          ${button("Sign in / account", "cloud-account", "btn--secondary")}
          ${button("Cloud Save", "cloud-save", "btn--primary")}
          ${button("Cloud Restore", "cloud-restore", "btn--secondary")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("import_title")}</div>
        <p class="help-text">${t("import_help")}</p>
        <div class="button-row">
          ${button(t("choose_json"), "open-import", "btn--primary")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("export_title")}</div>
        <p class="help-text">${t("export_help")}</p>
        <div class="button-row">
          ${button(t("export_changes"), "export-changes", "btn--primary")}
          ${button(t("export_snapshot"), "export-snapshot", "btn--secondary")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("source_workbook")}</div>
        <div class="path-box">${esc(state.workbook.sourcePath)}</div>
      </div>

      <div class="card danger-zone">
        <div class="card-title">${t("reset")}</div>
        <p class="help-text">This clears this dashboard's local data only. It does not touch your Excel workbook.</p>
        ${button("Reset dashboard", "reset-dashboard", "btn--danger")}
      </div>
    `;
  }

  function kpi(label, value, tone) {
    return `<div class="kpi kpi--${tone || "neutral"}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function row(label, value) {
    return `<div class="mini-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function empty(text) {
    return `<div class="empty-state">${esc(text)}</div>`;
  }

  function noteRow(note, editable) {
    return `
      <div class="note-row">
        <div>
          <strong>${esc(note.text)}</strong>
          <span>${esc(note.date || "")}${note.amount ? " - " + money(note.amount) : ""}</span>
        </div>
        ${editable ? `<button class="link-btn" data-action="done-note" data-id="${esc(note.id)}">Done</button>` : ""}
      </div>
    `;
  }

  function changeRow(change) {
    return `
      <div class="note-row">
        <div>
          <strong>${esc(change.label || change.type)}</strong>
          <span>${esc(change.date)} - ${esc(change.target || "")}${change.amount != null ? " - " + money(change.amount) : ""}</span>
        </div>
      </div>
    `;
  }

  function editRow(type, item, detail) {
    return `
      <div class="edit-row" data-type="${type}" data-id="${esc(item.id)}">
        <input type="text" value="${esc(item.name)}" data-edit="name" aria-label="Name">
        <input type="number" step="0.01" value="${esc(item.amount != null ? item.amount : item.balance)}" data-edit="amount" aria-label="Amount">
        ${detail != null ? `<input type="text" value="${esc(detail)}" data-edit="destination" aria-label="Destination">` : ""}
        <button class="btn btn--secondary btn--sm" data-action="delete-row" data-type="${type}" data-id="${esc(item.id)}">Delete</button>
      </div>
    `;
  }

  function accountGroup(title, type, items) {
    return `
      <div class="card">
        <div class="card-title">${esc(title)}</div>
        <div class="editor-list">
          ${items.map((item) => editRow(type, { ...item, amount: item.balance }, item.role || "")).join("") || empty("No items yet.")}
        </div>
      </div>
    `;
  }

  function renderCards(state) {
    const m = metrics(state);
    return `
      <div class="view-title">
        <div>
          <div class="eyebrow">${t("cards_eyebrow")}</div>
          <h2>${t("cards_title")}</h2>
        </div>
        ${button(t("add_card"), "add-card", "btn--primary")}
      </div>

      <section class="kpi-grid">
        ${kpi(t("total_owed"), money(m.cards), m.cards > 0 ? "bad" : "good")}
        ${kpi(t("total_available"), money(m.cardAvailable), "good")}
        ${kpi(t("cards_covered"), money(m.transferGap), m.transferGap >= 0 ? "good" : "bad")}
      </section>

      <p class="help-text">${t("enter_either")}</p>

      ${(state.creditCards || []).map((card) => {
        const limit = Number(card.limit) || 0;
        const pct = limit > 0 ? Math.min(100, Math.round(((Number(card.balance) || 0) / limit) * 100)) : 0;
        return `
        <div class="card" data-type="card" data-id="${esc(card.id)}">
          <div class="card-head">
            <div>
              <div class="card-title">${esc(card.name)}</div>
              <div class="card-subtitle">
                ${t("limit")} ${money(card.limit)} · ${pct}% ${t("used")} ·
                <button class="link-btn" data-action="reveal-limit" data-id="${esc(card.id)}" title="${t("limit_locked")}">${t("change_limit")} \uD83D\uDD12</button>
              </div>
            </div>
          </div>
          <div class="limit-bar" style="height:6px;background:var(--color-surface-2,rgba(143,151,184,.18));border-radius:999px;margin:6px 0 10px;overflow:hidden">
            <div style="width:${pct}%;height:6px;background:${pct >= 80 ? "var(--color-error)" : pct >= 40 ? "var(--color-warning)" : "var(--color-primary)"};border-radius:999px"></div>
          </div>
          <div class="edit-row edit-row--card" data-type="card" data-id="${esc(card.id)}">
            <label class="card-input-label">${t("balance")}
              <input type="number" step="0.01" inputmode="decimal" style="font-size:16px" value="${esc(card.balance)}" data-edit="balance" aria-label="${esc(card.name)} ${t("balance")}">
            </label>
            <label class="card-input-label">${t("available")}
              <input type="number" step="0.01" inputmode="decimal" style="font-size:16px" value="${esc(card.available != null ? card.available : Math.max(0, limit - (Number(card.balance) || 0)))}" data-edit="available" aria-label="${esc(card.name)} ${t("available")}">
            </label>
            <label class="card-input-label limit-input hidden" data-limit-for="${esc(card.id)}">${t("limit")}
              <input type="number" step="0.01" inputmode="decimal" style="font-size:16px" value="${esc(card.limit)}" data-edit="limit" aria-label="${esc(card.name)} ${t("limit")}">
            </label>
            <button class="btn btn--secondary btn--sm" data-action="delete-row" data-type="card" data-id="${esc(card.id)}">${t("delete")}</button>
          </div>
        </div>
      `;
      }).join("") || empty(t("no_cards"))}
    `;
  }

  function openNoteModal(state, api) {
    openModal(`
      <div class="modal-title">Add Note / Workbook Change</div>
      <label>Note
        <textarea id="note-text" rows="4" placeholder="Example: Rent changes next month, update Paycheck Planner..."></textarea>
      </label>
      <label>Amount optional
        <input id="note-amount" type="number" step="0.01" placeholder="0.00">
      </label>
      <div class="button-row">
        <button class="btn btn--secondary" data-modal-close>Cancel</button>
        <button class="btn btn--primary" id="save-note">Save note</button>
      </div>
    `);
    document.getElementById("save-note").addEventListener("click", () => {
      const text = document.getElementById("note-text").value.trim();
      if (!text) return api.showToast("Enter the note first.", "error");
      const amount = Number(document.getElementById("note-amount").value) || null;
      let next = Storage().clone(state);
      const note = { id: Storage().id(), date: Storage().todayISO(), text, amount, status: "open", source: "app" };
      next.notes.unshift(note);
      next = Storage().addChange(next, {
        type: "note",
        label: "Note",
        target: "Workbook notes",
        text,
        amount,
      });
      api.save(next);
      closeModal();
      api.showToast("Note saved", "success");
    });
  }

  function openModal(html) {
    const backdrop = document.getElementById("modal-backdrop");
    const content = document.getElementById("modal-content");
    content.innerHTML = html;
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
    backdrop.onclick = (event) => {
      if (event.target === backdrop || event.target.closest("[data-modal-close]")) closeModal();
    };
  }

  function closeModal() {
    const backdrop = document.getElementById("modal-backdrop");
    const content = document.getElementById("modal-content");
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
    content.innerHTML = "";
  }

  function wire(container, state, api) {
    container.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const next = Storage().clone(state);
        const value = input.type === "number" ? Number(input.value) || 0 : input.value;
        if (input.dataset.field === "paycheckAmount") next.settings.paycheckAmount = value;
        if (input.dataset.field === "nextPayday") next.settings.nextPayday = value;
        if (input.dataset.field === "paychecksPerYear") next.settings.paychecksPerYear = value;
        if (input.dataset.field === "workbookName") next.workbook.name = value;
        if (input.dataset.field === "workbookPath") next.workbook.sourcePath = value;
        api.save(Storage().addChange(next, { type: "setting", label: "Setting updated", target: input.dataset.field, value }));
      });
    });

    container.querySelectorAll(".edit-row").forEach((rowEl) => {
      rowEl.querySelectorAll("[data-edit]").forEach((input) => {
        input.addEventListener("change", () => {
          const next = Storage().clone(state);
          const type = rowEl.dataset.type;
          const item = findItem(next, type, rowEl.dataset.id);
          if (!item) return;
          const key = input.dataset.edit;
          const value = input.type === "number" ? Number(input.value) || 0 : input.value;
          const balanceKeys = { account: "balance", vault: "balance", card: "balance", investment: "balance", paycheck: "amount", bill: "amount" };
          const balanceKey = balanceKeys[type] || "balance";
          const oldBalance = Number(item[balanceKey]) || 0;
          if (key === "amount") item[balanceKey] = value;
          else if (key === "destination") item[type === "account" ? "role" : "destination"] = value;
          else if (key === "available" && type === "card") {
            // Dual entry: typing available credit derives the balance from the limit
            item.available = value;
            item.balance = Math.max(0, (Number(item.limit) || 0) - value);
          } else item[key] = value;
          if (type === "card" && key !== "available") {
            item.available = Math.max(0, (Number(item.limit) || 0) - (Number(item.balance) || 0));
          }
          const newBalance = Number(item[balanceKey]) || 0;
          if (newBalance !== oldBalance && (key === "amount" || key === "balance" || key === "available" || key === "limit")) {
            next.transactions = next.transactions || [];
            next.transactions.unshift({
              id: Storage().id(), date: Storage().todayISO(), kind: type,
              target: item.name, from: oldBalance, to: newBalance,
            });
            if (next.transactions.length > 400) next.transactions = next.transactions.slice(0, 400);
          }
          api.save(Storage().addChange(next, { type: "edit", label: `${type} edited`, target: item.name, amount: value }));
        });
      });
    });

    container.querySelectorAll("[data-action]").forEach((buttonEl) => {
      buttonEl.addEventListener("click", () => handleAction(buttonEl, state, api));
    });
  }

  function findItem(state, type, id) {
    const map = {
      paycheck: state.paycheckPlan,
      account: state.accounts,
      vault: state.vaults,
      card: state.creditCards,
      investment: state.investments,
      bill: state.bills,
    };
    return (map[type] || []).find((item) => item.id === id);
  }

  function removeItem(state, type, id) {
    const key = { paycheck: "paycheckPlan", account: "accounts", vault: "vaults", card: "creditCards", investment: "investments", bill: "bills" }[type];
    if (!key) return state;
    state[key] = (state[key] || []).filter((item) => item.id !== id);
    return state;
  }

  function handleAction(el, state, api) {
    const action = el.dataset.action;
    if (action === "go-paycheck") return api.showView("paycheck");
    if (action === "go-cards") return api.showView("cards");
    if (action === "reveal-limit") {
      const limitLabel = document.querySelector(`[data-limit-for="${el.dataset.id}"]`);
      if (limitLabel) limitLabel.classList.toggle("hidden");
      return;
    }
    if (action === "add-card") {
      const next = Storage().clone(state);
      next.creditCards.push({ id: Storage().id(), name: "New card", limit: 0, balance: 0, available: 0 });
      api.save(Storage().addChange(next, { type: "add", label: "Card added", target: "Credit Cards" }));
      return;
    }
    if (action === "add-investment") {
      const next = Storage().clone(state);
      next.investments = next.investments || [];
      next.investments.push({ id: Storage().id(), name: "New investment", balance: 0 });
      api.save(Storage().addChange(next, { type: "add", label: "Investment added", target: "Investments" }));
      return;
    }
    if (action === "add-bill") {
      const next = Storage().clone(state);
      next.bills = next.bills || [];
      next.bills.push({ id: Storage().id(), name: "New bill", amount: 0, dueDay: 1 });
      api.save(Storage().addChange(next, { type: "add", label: "Bill added", target: "Bills" }));
      return;
    }
    if (action === "set-lang-en" || action === "set-lang-es") {
      const next = Storage().clone(state);
      next.settings.lang = action === "set-lang-es" ? "es" : "en";
      api.save(next);
      return;
    }
    if (action === "open-import") return document.getElementById("json-import").click();
    if (action === "export-changes") return Storage().exportJSON(state, "changes");
    if (action === "export-snapshot") return Storage().exportJSON(state, "snapshot");
    if (action === "cloud-account") return api.cloudAccount && api.cloudAccount();
    if (action === "cloud-save") return api.cloudSave && api.cloudSave();
    if (action === "cloud-restore") return api.cloudRestore && api.cloudRestore();
    if (action === "add-note") return openNoteModal(state, api);

    if (action === "done-note") {
      const next = Storage().clone(state);
      const note = (next.notes || []).find((item) => item.id === el.dataset.id);
      if (note) note.status = "done";
      api.save(Storage().addChange(next, { type: "note_done", label: "Note completed", target: note ? note.text : "" }));
      return;
    }

    if (action === "clear-pending") {
      const next = Storage().clone(state);
      next.pendingChanges = [];
      api.save(next);
      api.showToast("Pending changes cleared", "success");
      return;
    }

    if (action === "delete-row") {
      const next = removeItem(Storage().clone(state), el.dataset.type, el.dataset.id);
      api.save(Storage().addChange(next, { type: "delete", label: `${el.dataset.type} deleted`, target: el.dataset.id }));
      return;
    }

    if (action === "add-paycheck-line") {
      const next = Storage().clone(state);
      next.paycheckPlan.push({ id: Storage().id(), name: "New allocation", amount: 0, destination: "" });
      api.save(Storage().addChange(next, { type: "add", label: "Paycheck line added", target: "Paycheck Planner" }));
      return;
    }

    if (action === "add-account-item") {
      const next = Storage().clone(state);
      next.vaults.push({ id: Storage().id(), name: "New vault", balance: 0, target: 0 });
      api.save(Storage().addChange(next, { type: "add", label: "Vault added", target: "Bank Accounts" }));
      return;
    }

    if (action === "set-theme-dark" || action === "set-theme-light") {
      const next = Storage().clone(state);
      next.settings.theme = action === "set-theme-light" ? "light" : "dark";
      api.save(next);
      return;
    }

    if (action === "reset-dashboard") {
      if (!confirm("Reset this dashboard's local data? Your Excel workbook will not be changed.")) return;
      api.save(Storage().defaultState());
    }
  }

  App.Dashboard = {
    render(state, api) {
      LANG = (state.settings && state.settings.lang) === "es" ? "es" : "en";
      applyChrome();
      const screens = {
        dashboard: [document.getElementById("tab-dashboard"), renderHome],
        accounts: [document.getElementById("tab-accounts"), renderAccounts],
        paycheck: [document.getElementById("tab-paycheck"), renderPaycheck],
        changes: [document.getElementById("tab-changes"), renderChanges],
        cards: [document.getElementById("tab-cards"), renderCards],
        settings: [document.getElementById("tab-settings"), renderSettings],
      };

      Object.entries(screens).forEach(([key, [el, renderer]]) => {
        if (!el || key !== api.activeView) return;
        el.innerHTML = renderer(state, api);
        wire(el, state, api);
      });
      const cloudLineEl = document.getElementById("cloud-status-line");
      if (cloudLineEl) {
        const cloud = (api && api.cloudStatus) || {};
        cloudLineEl.textContent = cloud.ready
          ? cloud.signedIn
            ? `Signed in as ${cloud.email || "cloud account"}. Last cloud save on this device: ${cloud.lastSaved || "not saved yet"}.`
            : "Not signed in. Sign in once, then this device can save and restore your Finance dashboard."
          : "Cloud backup is still loading. If this stays here, Firebase scripts did not load.";
      }
    },
  };
})(window);
