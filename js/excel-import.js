(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const SHEET_BANK = "🏦 Bank Accounts";
  const TOLERANCE = 0.02;

  const BANK_RANGE = { start: 7, end: 12, nameCol: "B", valueCol: "C" };
  const VAULT_RANGE = { start: 17, end: 36, nameCol: "B", valueCol: "C" };
  const FIDELITY_RANGE = { start: 42, end: 43, nameCol: "F", valueCol: "G" };
  const TOTAL_CELLS = {
    banks: "C13",
    vaults: "C37",
    bankOnline: "C38",
    bankDifference: "C39",
    fidelity: "G46",
  };

  let lastPreview = null;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function money(value) {
    if (App.Storage && App.Storage.formatCurrency) return App.Storage.formatCurrency(value);
    return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function round(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function cleanName(value) {
    return String(value || "")
      .replace(/[🔑🏦💰💳📊📈🎯✅❌⚠️]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value) {
    return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function cell(sheet, address) {
    const c = sheet[address];
    return c ? c.v : null;
  }

  function cellText(sheet, address) {
    const c = sheet[address];
    return c ? (c.w || c.v || "") : "";
  }

  function cellNumber(sheet, address) {
    const raw = cell(sheet, address);
    if (raw == null || raw === "") return 0;
    if (typeof raw === "number") return round(raw);
    return round(String(raw).replace(/[$,]/g, ""));
  }

  function parseFixedRows(sheet, range, kind) {
    const rows = [];
    for (let r = range.start; r <= range.end; r += 1) {
      const rawName = cellText(sheet, range.nameCol + r);
      const name = cleanName(rawName);
      if (!name || /^total\b/i.test(name) || /difference/i.test(name)) continue;
      rows.push({
        id: normalizeKey(kind + " " + name) || kind + "-" + r,
        name,
        balance: cellNumber(sheet, range.valueCol + r),
        sourceSheet: SHEET_BANK,
        sourceRange: range.nameCol + r + ":" + range.valueCol + r,
        sourceRow: r,
      });
    }
    return rows;
  }

  function sumRows(rows) {
    return round((rows || []).reduce(function (sum, row) { return sum + (Number(row.balance) || 0); }, 0));
  }

  function delta(a, b) {
    return round((Number(a) || 0) - (Number(b) || 0));
  }

  function parseWorkbook(workbook, fileName) {
    const sheet = workbook.Sheets[SHEET_BANK] || workbook.Sheets["Bank Accounts"];
    if (!sheet) throw new Error("Could not find the 🏦 Bank Accounts sheet.");

    const accounts = parseFixedRows(sheet, BANK_RANGE, "bank").map(function (item) {
      const key = normalizeKey(item.name);
      return {
        ...item,
        type: "bank",
        role: key.includes("transfer account") ? "transfer" : key.includes("checking") ? "checking" : key.includes("savings") || key.includes("fidelity") ? "savings" : "bank",
      };
    });
    const vaults = parseFixedRows(sheet, VAULT_RANGE, "vault").map(function (item) {
      return { ...item, target: 0 };
    });
    const fidelity = parseFixedRows(sheet, FIDELITY_RANGE, "fidelity").map(function (item) {
      return { ...item, type: "fidelity" };
    });

    const totals = {
      bankImported: sumRows(accounts),
      bankWorkbook: cellNumber(sheet, TOTAL_CELLS.banks),
      vaultImported: sumRows(vaults),
      vaultWorkbook: cellNumber(sheet, TOTAL_CELLS.vaults),
      bankOnline: cellNumber(sheet, TOTAL_CELLS.bankOnline),
      bankDifference: cellNumber(sheet, TOTAL_CELLS.bankDifference),
      fidelityImported: sumRows(fidelity),
      fidelityWorkbook: cellNumber(sheet, TOTAL_CELLS.fidelity),
    };
    totals.bankDelta = delta(totals.bankImported, totals.bankWorkbook);
    totals.vaultDelta = delta(totals.vaultImported, totals.vaultWorkbook);
    totals.fidelityDelta = delta(totals.fidelityImported, totals.fidelityWorkbook);

    const warnings = [];
    if (Math.abs(totals.bankDelta) > TOLERANCE) warnings.push("Banking total does not match TOTAL IN BANKS.");
    if (Math.abs(totals.vaultDelta) > TOLERANCE) warnings.push("Vault total does not match TOTAL IN VAULTS.");
    if (totals.fidelityWorkbook && Math.abs(totals.fidelityDelta) > TOLERANCE) warnings.push("Fidelity detail total does not match Fidelity total.");

    return {
      fileName: fileName || "Workbook",
      importedAt: new Date().toISOString(),
      accounts,
      vaults,
      fidelity,
      totals,
      warnings,
    };
  }

  function preserveTargets(importedVaults, existingVaults) {
    const targetByName = new Map((existingVaults || []).map(function (v) { return [normalizeKey(v.name), Number(v.target) || 0]; }));
    return importedVaults.map(function (v) {
      return { ...v, target: targetByName.get(normalizeKey(v.name)) || Number(v.target) || 0 };
    });
  }

  function progressSourceBalance(goal, accounts, vaults) {
    const key = normalizeKey(goal.name);
    const all = [].concat(vaults || [], accounts || []);
    const exact = all.find(function (item) { return normalizeKey(item.name) === key; });
    if (exact) return Number(exact.balance) || 0;

    if (key.includes("car")) {
      return all.filter(function (item) { return normalizeKey(item.name).includes("car savings"); })
        .reduce(function (sum, item) { return sum + (Number(item.balance) || 0); }, 0);
    }
    if (key.includes("emergency")) {
      return all.filter(function (item) { return normalizeKey(item.name).includes("emergency"); })
        .reduce(function (sum, item) { return sum + (Number(item.balance) || 0); }, 0);
    }
    if (key.includes("vacation")) {
      const item = all.find(function (x) { return normalizeKey(x.name).includes("vacation"); });
      return item ? Number(item.balance) || 0 : Number(goal.saved) || 0;
    }
    const contains = all.find(function (item) {
      const name = normalizeKey(item.name);
      return name && key && (name.includes(key) || key.includes(name));
    });
    return contains ? Number(contains.balance) || 0 : Number(goal.saved) || 0;
  }

  function syncGoals(goals, accounts, vaults) {
    return (goals || []).map(function (goal) {
      const saved = round(progressSourceBalance(goal, accounts, vaults));
      const target = Number(goal.target) || 0;
      return { ...goal, saved, pct: target > 0 ? Math.min(100, round((saved / target) * 100)) : 0 };
    });
  }

  function applyPreview(currentState, preview) {
    const next = App.Storage.clone(currentState);
    const vaults = preserveTargets(preview.vaults, next.vaults);
    next.accounts = preview.accounts;
    next.vaults = vaults;
    next.investments = preview.fidelity;
    next.goals = syncGoals(next.goals, next.accounts, next.vaults);
    next.workbook = {
      ...(next.workbook || {}),
      name: preview.fileName,
      lastSnapshot: preview.importedAt,
      template: SHEET_BANK,
      totals: preview.totals,
    };
    next.notes = next.notes || [];
    if (preview.warnings.length) {
      next.notes.unshift({
        id: App.Storage.id(),
        date: App.Storage.todayISO(),
        text: "Excel import warnings: " + preview.warnings.join(" "),
        status: "open",
        source: "excel-import",
      });
    }
    return next;
  }

  function tableRows(rows) {
    return (rows || []).map(function (row) {
      return '<div class="mini-row"><span>' + esc(row.name) + '</span><strong>' + money(row.balance) + '</strong></div>';
    }).join("") || '<div class="empty-state">No rows found.</div>';
  }

  function validationRow(label, imported, workbook, diff) {
    const ok = Math.abs(Number(diff) || 0) <= TOLERANCE;
    return '<div class="mini-row"><span>' + esc(label) + '</span><strong class="' + (ok ? 'text-green' : 'text-red') + '">' +
      money(imported) + ' / ' + money(workbook) + ' · Δ ' + money(diff) + '</strong></div>';
  }

  function renderBanking(state) {
    const accounts = state.accounts || [];
    const vaults = state.vaults || [];
    const fidelity = state.investments || [];
    const totals = state.workbook && state.workbook.totals ? state.workbook.totals : {};
    const bankTotal = sumRows(accounts);
    const vaultTotal = sumRows(vaults);
    const fidelityTotal = sumRows(fidelity);

    return '<div class="view-title"><div><div class="eyebrow">Workbook source · 🏦 Bank Accounts</div><h2>Banking</h2></div></div>' +
      '<section class="kpi-grid">' +
        '<div class="kpi kpi--neutral"><span>Banking Total</span><strong>' + money(bankTotal) + '</strong></div>' +
        '<div class="kpi kpi--good"><span>Vaults Total</span><strong>' + money(vaultTotal) + '</strong></div>' +
        '<div class="kpi kpi--neutral"><span>Fidelity Savings</span><strong>' + money(fidelityTotal) + '</strong></div>' +
        '<div class="kpi kpi--neutral"><span>Workbook Difference</span><strong>' + money(totals.bankDifference || 0) + '</strong></div>' +
      '</section>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Bank Accounts</div><div class="mini-list">' + tableRows(accounts) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Vaults / Buckets</div><p class="help-text">These vault amounts are imported from rows 17–36 of the workbook and feed goal progress automatically.</p><div class="mini-list">' + tableRows(vaults) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Fidelity Savings Detail</div><p class="help-text">Shown as supporting detail only. These values are already included in Bank Accounts when they appear in the main banking section.</p><div class="mini-list">' + tableRows(fidelity) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Import Validation</div><div class="mini-list">' +
        validationRow('Banking vs TOTAL IN BANKS', bankTotal, totals.bankWorkbook || bankTotal, delta(bankTotal, totals.bankWorkbook || bankTotal)) +
        validationRow('Vaults vs TOTAL IN VAULTS', vaultTotal, totals.vaultWorkbook || vaultTotal, delta(vaultTotal, totals.vaultWorkbook || vaultTotal)) +
      '</div></div>';
  }

  function renderImport(state) {
    const preview = lastPreview;
    return '<div class="view-title"><div><div class="eyebrow">Merged bridge · Excel template import</div><h2>Excel Import</h2></div></div>' +
      '<div class="card"><div class="card-title">Import House Budget workbook</div>' +
        '<p class="help-text">Upload the Excel workbook. The app reads fixed ranges from 🏦 Bank Accounts so Banking and Vault values stay aligned with the template.</p>' +
        '<input id="excel-import-file" type="file" accept=".xlsx,.xls,.xlsm" />' +
        '<div class="button-row" style="margin-top:12px"><button class="btn btn--primary" data-excel-action="parse">Preview Workbook</button>' +
        '<button class="btn btn--secondary" data-excel-action="apply" ' + (!preview ? 'disabled' : '') + '>Apply Preview</button></div>' +
      '</div>' +
      (preview ? renderPreview(preview) : '<div class="card"><div class="empty-state">No workbook preview yet.</div></div>');
  }

  function renderPreview(preview) {
    const warningHtml = preview.warnings.length
      ? '<div class="card danger-zone"><div class="card-title">Validation warnings</div><div class="mini-list">' + preview.warnings.map(function (w) { return '<div class="mini-row"><span>Warning</span><strong class="text-red">' + esc(w) + '</strong></div>'; }).join('') + '</div></div>'
      : '<div class="card"><div class="card-title">Validation</div><div class="empty-state">All mapped totals match the workbook template.</div></div>';
    return warningHtml +
      '<div class="card"><div class="card-title">Totals Check</div><div class="mini-list">' +
        validationRow('Banking', preview.totals.bankImported, preview.totals.bankWorkbook, preview.totals.bankDelta) +
        validationRow('Vaults', preview.totals.vaultImported, preview.totals.vaultWorkbook, preview.totals.vaultDelta) +
        validationRow('Fidelity detail', preview.totals.fidelityImported, preview.totals.fidelityWorkbook || preview.totals.fidelityImported, preview.totals.fidelityDelta) +
      '</div></div>' +
      '<div class="card"><div class="card-title">Vaults Preview</div><div class="mini-list">' + tableRows(preview.vaults) + '</div></div>' +
      '<div class="card"><div class="card-title">Banking Preview</div><div class="mini-list">' + tableRows(preview.accounts) + '</div></div>';
  }

  function wireImport(container, state, api) {
    container.querySelectorAll('[data-excel-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.excelAction === 'parse') return parseSelected(container, api);
        if (button.dataset.excelAction === 'apply') {
          if (!lastPreview) return api.showToast('Preview a workbook first.', 'error');
          if (lastPreview.warnings.length && !confirm('Validation warnings found. Apply anyway?')) return;
          api.save(applyPreview(state, lastPreview));
          api.showToast('Workbook imported. Banking, vaults, and goal progress updated.', 'success');
          api.showView('accounts');
        }
      });
    });
  }

  function parseSelected(container, api) {
    const input = container.querySelector('#excel-import-file');
    const file = input && input.files && input.files[0];
    if (!file) return api.showToast('Choose the Excel workbook first.', 'error');
    if (!window.XLSX) return api.showToast('Excel parser did not load. Check your connection and refresh.', 'error');
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const workbook = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: false });
        lastPreview = parseWorkbook(workbook, file.name);
        api.showToast('Workbook preview ready.', lastPreview.warnings.length ? 'error' : 'success');
        api.showView('import');
      } catch (err) {
        console.error('[Finance Dashboard] Excel import failed:', err);
        api.showToast(err.message || 'Workbook could not be parsed.', 'error');
      }
    };
    reader.onerror = function () { api.showToast('Workbook read failed.', 'error'); };
    reader.readAsArrayBuffer(file);
  }

  function install() {
    if (!App.Dashboard || !App.Dashboard.render || App.Dashboard.__excelImportPatched) return;
    const original = App.Dashboard.render;
    App.Dashboard.render = function (state, api) {
      original.call(App.Dashboard, state, api);
      if (api.activeView === 'accounts') {
        const el = document.getElementById('tab-accounts');
        if (el) el.innerHTML = renderBanking(state);
      }
      if (api.activeView === 'import') {
        const el = document.getElementById('tab-import');
        if (el) {
          el.innerHTML = renderImport(state);
          wireImport(el, state, api);
        }
      }
    };
    App.Dashboard.__excelImportPatched = true;
  }

  install();
})(window);
