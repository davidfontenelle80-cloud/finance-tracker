(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const Storage = () => App.Storage;

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
    const transfer = (state.accounts || []).find((item) => item.role === "transfer");
    const paycheckTotal = total(state.paycheckPlan, "amount");
    return {
      bank,
      vaults,
      cards,
      transferBalance: transfer ? Number(transfer.balance) || 0 : 0,
      transferName: transfer ? transfer.name : "Transfer account",
      netWorth: bank + vaults - cards,
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
              <div class="card-title">Notes & Changes</div>
              <div class="card-subtitle">${m.openNotes} open notes - ${m.pending} pending workbook changes</div>
            </div>
            <button class="link-btn" data-action="add-note">Add</button>
          </div>
          <div class="mini-list">
            ${notes.map((note) => noteRow(note)).join("") || empty("No open notes.")}
          </div>
        </div>
      </section>
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

      ${accountGroup("Bank Accounts", "account", state.accounts || [])}
      ${accountGroup("Savings Vaults", "vault", state.vaults || [])}
      ${cardGroup(state.creditCards || [])}
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
        <div class="card-title">Open</div>
        <div class="mini-list">
          ${openNotes.map((note) => noteRow(note, true)).join("") || empty("No open notes.")}
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

  function renderSync(state) {
    return `
      <div class="view-title">
        <div>
          <div class="eyebrow">JSON bridge</div>
          <h2>Workbook Sync</h2>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Import From Workbook or Backup</div>
        <p class="help-text">Import a dashboard snapshot or old finance backup JSON to refresh this dashboard.</p>
        <div class="button-row">
          ${button("Choose JSON file", "open-import", "btn--primary")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Export For Workbook</div>
        <p class="help-text">Export pending changes when you want the spreadsheet updated. Export a full snapshot when you want a complete backup.</p>
        <div class="button-row">
          ${button("Export pending changes", "export-changes", "btn--primary")}
          ${button("Export full snapshot", "export-snapshot", "btn--secondary")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Source Workbook</div>
        <div class="path-box">${esc(state.workbook.sourcePath)}</div>
        <p class="help-text">The app does not silently edit this file. It exports structured JSON so the workbook can be updated deliberately.</p>
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

      <div class="card danger-zone">
        <div class="card-title">Reset</div>
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

  function cardGroup(cards) {
    return `
      <div class="card">
        <div class="card-title">Credit Cards</div>
        <div class="editor-list">
          ${cards.map((card) => `
            <div class="edit-row edit-row--card" data-type="card" data-id="${esc(card.id)}">
              <input type="text" value="${esc(card.name)}" data-edit="name" aria-label="Name">
              <input type="number" step="0.01" value="${esc(card.balance)}" data-edit="balance" aria-label="Balance">
              <input type="number" step="0.01" value="${esc(card.limit)}" data-edit="limit" aria-label="Limit">
              <button class="btn btn--secondary btn--sm" data-action="delete-row" data-type="card" data-id="${esc(card.id)}">Delete</button>
            </div>
          `).join("") || empty("No cards yet.")}
        </div>
      </div>
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
          if (key === "amount") item[type === "paycheck" ? "amount" : "balance"] = value;
          else if (key === "destination") item[type === "account" ? "role" : "destination"] = value;
          else item[key] = value;
          if (type === "card") item.available = Math.max(0, (Number(item.limit) || 0) - (Number(item.balance) || 0));
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
    };
    return (map[type] || []).find((item) => item.id === id);
  }

  function removeItem(state, type, id) {
    const key = { paycheck: "paycheckPlan", account: "accounts", vault: "vaults", card: "creditCards" }[type];
    if (!key) return state;
    state[key] = (state[key] || []).filter((item) => item.id !== id);
    return state;
  }

  function handleAction(el, state, api) {
    const action = el.dataset.action;
    if (action === "go-paycheck") return api.showView("paycheck");
    if (action === "open-import") return document.getElementById("json-import").click();
    if (action === "export-changes") return Storage().exportJSON(state, "changes");
    if (action === "export-snapshot") return Storage().exportJSON(state, "snapshot");
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

    if (action === "reset-dashboard") {
      if (!confirm("Reset this dashboard's local data? Your Excel workbook will not be changed.")) return;
      api.save(Storage().defaultState());
    }
  }

  App.Dashboard = {
    render(state, api) {
      const screens = {
        dashboard: [document.getElementById("tab-dashboard"), renderHome],
        paycheck: [document.getElementById("tab-paycheck"), renderPaycheck],
        accounts: [document.getElementById("tab-accounts"), renderAccounts],
        changes: [document.getElementById("tab-changes"), renderChanges],
        sync: [document.getElementById("tab-sync"), renderSync],
        settings: [document.getElementById("tab-settings"), renderSettings],
      };

      Object.entries(screens).forEach(([key, [el, renderer]]) => {
        if (!el || key !== api.activeView) return;
        el.innerHTML = renderer(state);
        wire(el, state, api);
      });
    },
  };
})(window);
