(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const SHEET_BANK = "🏦 Bank Accounts";
  const SHEET_CARDS = "💳 Credit Cards";
  const SHEET_PAYCHECK = " 🗓️ Paycheck Planner";
  const TOLERANCE = 0.02;

  const BANK_RANGE = { start: 7, end: 12, nameCol: "B", valueCol: "C" };
  const VAULT_RANGE = { start: 17, end: 36, nameCol: "B", valueCol: "C" };
  const FIDELITY_RANGE = { start: 42, end: 43, nameCol: "F", valueCol: "G" };
  const CARD_RANGE = { start: 7, end: 16, nameCol: "B", availableCol: "C", limitCol: "D", balanceCol: "E" };
  const PAYCHECK_COLUMNS = [
    { key: "paycheck1", dateCell: "B1", labelCell: "B2", nameCol: "B", valueCol: "C" },
    { key: "paycheck2", dateCell: "D1", labelCell: "D2", nameCol: "D", valueCol: "E" },
    { key: "paycheck3", dateCell: "F1", labelCell: "F2", nameCol: "F", valueCol: "G" },
  ];

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

  function pct(value) {
    const n = Number(value) || 0;
    return (n * 100).toFixed(1) + "%";
  }

  function round(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function cleanName(value) {
    return String(value || "")
      .replace(/[🔑🏦💰💳📊📈🎯✅❌⚠️🔄]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value) {
    return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function excelDateToJS(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number") return new Date(Math.round((value - 25569) * 86400 * 1000));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isoDate(value) {
    const d = excelDateToJS(value);
    if (!d) return "";
    return d.toISOString().slice(0, 10);
  }

  function cell(sheet, address) {
    const c = sheet && sheet[address];
    return c ? c.v : null;
  }

  function cellText(sheet, address) {
    const c = sheet && sheet[address];
    return c ? (c.w || c.v || "") : "";
  }

  function cellNumber(sheet, address) {
    const raw = cell(sheet, address);
    if (raw == null || raw === "") return 0;
    if (typeof raw === "number") return round(raw);
    return round(String(raw).replace(/[$,% ,]/g, ""));
  }

  function parseFixedRows(sheet, range, kind) {
    const rows = [];
    for (let r = range.start; r <= range.end; r += 1) {
      const name = cleanName(cellText(sheet, range.nameCol + r));
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

  function parseCards(sheet) {
    const cards = [];
    if (!sheet) return cards;
    for (let r = CARD_RANGE.start; r <= CARD_RANGE.end; r += 1) {
      const name = cleanName(cellText(sheet, CARD_RANGE.nameCol + r));
      if (!name || /credit card balance/i.test(name)) continue;
      cards.push({
        id: normalizeKey("card " + name) || "card-" + r,
        name,
        available: cellNumber(sheet, CARD_RANGE.availableCol + r),
        limit: cellNumber(sheet, CARD_RANGE.limitCol + r),
        balance: cellNumber(sheet, CARD_RANGE.balanceCol + r),
        sourceSheet: SHEET_CARDS,
        sourceRow: r,
      });
    }
    return cards;
  }

  function parsePaycheck(sheet) {
    if (!sheet) return null;
    const today = todayStart();
    const candidates = PAYCHECK_COLUMNS.map(function (col) {
      const date = excelDateToJS(cell(sheet, col.dateCell));
      if (!date) return null;
      date.setHours(0, 0, 0, 0);
      const items = [];
      for (let r = 4; r <= 34; r += 1) {
        const name = cleanName(cellText(sheet, col.nameCol + r));
        const amount = cellNumber(sheet, col.valueCol + r);
        if (!name || /^total expenses/i.test(name) || /^deficit/i.test(name)) continue;
        if (amount || name) items.push({ id: normalizeKey(col.key + " " + name) || col.key + "-" + r, name, amount });
      }
      return { key: col.key, label: cleanName(cellText(sheet, col.labelCell)) || col.key, date: isoDate(cell(sheet, col.dateCell)), dateObj: date, items };
    }).filter(Boolean).sort(function (a, b) { return a.dateObj - b.dateObj; });
    const next = candidates.find(function (p) { return p.dateObj >= today; }) || candidates[candidates.length - 1] || null;
    return { next, all: candidates };
  }

  function sumRows(rows, field) {
    return round((rows || []).reduce(function (sum, row) { return sum + (Number(row[field || "balance"]) || 0); }, 0));
  }

  function delta(a, b) {
    return round((Number(a) || 0) - (Number(b) || 0));
  }

  function findByName(rows, match) {
    const needle = normalizeKey(match);
    return (rows || []).find(function (row) { return normalizeKey(row.name).includes(needle); }) || null;
  }

  function parseWorkbook(workbook, fileName) {
    const bankSheet = workbook.Sheets[SHEET_BANK] || workbook.Sheets["Bank Accounts"];
    const cardSheet = workbook.Sheets[SHEET_CARDS] || workbook.Sheets["Credit Cards"];
    const paycheckSheet = workbook.Sheets[SHEET_PAYCHECK] || workbook.Sheets["Paycheck Planner"];
    if (!bankSheet) throw new Error("Could not find the 🏦 Bank Accounts sheet.");

    const accounts = parseFixedRows(bankSheet, BANK_RANGE, "bank").map(function (item) {
      const key = normalizeKey(item.name);
      return { ...item, type: "bank", role: key.includes("transfer account") ? "transfer" : key.includes("checking") ? "checking" : "savings" };
    });
    const vaults = parseFixedRows(bankSheet, VAULT_RANGE, "vault").map(function (item) { return { ...item, target: 0 }; });
    const fidelity = parseFixedRows(bankSheet, FIDELITY_RANGE, "fidelity").map(function (item) { return { ...item, type: "fidelity" }; });
    const cards = parseCards(cardSheet);
    const paycheck = parsePaycheck(paycheckSheet);

    const cardBalance = cardSheet ? cellNumber(cardSheet, "C22") : sumRows(cards, "balance");
    const transferBalance = cardSheet ? cellNumber(cardSheet, "C21") : ((findByName(vaults, "Transfer Account") || findByName(accounts, "Transfer Account") || {}).balance || 0);
    const coveragePercent = cardSheet ? Number(cell(cardSheet, "C23")) || 0 : (cardBalance ? transferBalance / cardBalance : 0);
    const overUnder = cardSheet ? cellNumber(cardSheet, "C24") : delta(transferBalance, cardBalance);
    const status = cleanName(cellText(cardSheet, "E21"));

    const totals = {
      bankImported: sumRows(accounts),
      bankWorkbook: cellNumber(bankSheet, "C13"),
      vaultImported: sumRows(vaults),
      vaultWorkbook: cellNumber(bankSheet, "C37"),
      bankOnline: cellNumber(bankSheet, "C38"),
      bankDifference: cellNumber(bankSheet, "C39"),
      fidelityImported: sumRows(fidelity),
      fidelityWorkbook: cellNumber(bankSheet, "G46"),
      netWorth: cellNumber(bankSheet, "G2"),
      cardBalance,
      transferBalance,
      coveragePercent,
      overUnder,
      coverageStatus: status,
      bankingCoverageCheck: cellNumber(bankSheet, "D14"),
    };
    totals.bankDelta = delta(totals.bankImported, totals.bankWorkbook);
    totals.vaultDelta = delta(totals.vaultImported, totals.vaultWorkbook);
    totals.fidelityDelta = delta(totals.fidelityImported, totals.fidelityWorkbook);

    const warnings = [];
    if (Math.abs(totals.bankDelta) > TOLERANCE) warnings.push("Banking total does not match TOTAL IN BANKS.");
    if (Math.abs(totals.vaultDelta) > TOLERANCE) warnings.push("Vault total does not match TOTAL IN VAULTS.");
    if (totals.fidelityWorkbook && Math.abs(totals.fidelityDelta) > TOLERANCE) warnings.push("Fidelity detail total does not match Fidelity total.");

    return { fileName: fileName || "Workbook", importedAt: new Date().toISOString(), accounts, vaults, fidelity, creditCards: cards, paycheck, totals, warnings };
  }

  function preserveTargets(importedVaults, existingVaults) {
    const targetByName = new Map((existingVaults || []).map(function (v) { return [normalizeKey(v.name), Number(v.target) || 0]; }));
    return importedVaults.map(function (v) { return { ...v, target: targetByName.get(normalizeKey(v.name)) || Number(v.target) || 0 }; });
  }

  function progressSourceBalance(goal, accounts, vaults) {
    const key = normalizeKey(goal.name);
    const all = [].concat(vaults || [], accounts || []);
    const exact = all.find(function (item) { return normalizeKey(item.name) === key; });
    if (exact) return Number(exact.balance) || 0;
    if (key.includes("car")) return all.filter(function (item) { return normalizeKey(item.name).includes("car savings"); }).reduce(function (s, i) { return s + (Number(i.balance) || 0); }, 0);
    if (key.includes("emergency")) return all.filter(function (item) { return normalizeKey(item.name).includes("emergency"); }).reduce(function (s, i) { return s + (Number(i.balance) || 0); }, 0);
    const contains = all.find(function (item) { const name = normalizeKey(item.name); return name && key && (name.includes(key) || key.includes(name)); });
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
    next.accounts = preview.accounts;
    next.vaults = preserveTargets(preview.vaults, next.vaults);
    next.investments = preview.fidelity;
    next.creditCards = preview.creditCards.length ? preview.creditCards : next.creditCards;
    if (preview.paycheck && preview.paycheck.next) {
      next.settings.nextPayday = preview.paycheck.next.date;
      next.paycheckPlan = preview.paycheck.next.items;
    }
    next.goals = syncGoals(next.goals, next.accounts, next.vaults);
    next.workbook = { ...(next.workbook || {}), name: preview.fileName, lastSnapshot: preview.importedAt, template: SHEET_BANK, totals: preview.totals, paycheck: preview.paycheck };
    next.notes = next.notes || [];
    if (preview.warnings.length) next.notes.unshift({ id: App.Storage.id(), date: App.Storage.todayISO(), text: "Excel import warnings: " + preview.warnings.join(" "), status: "open", source: "excel-import" });
    return next;
  }

  function tableRows(rows, valueField) {
    return (rows || []).map(function (row) { return '<div class="mini-row"><span>' + esc(row.name) + '</span><strong>' + money(row[valueField || "balance"]) + '</strong></div>'; }).join("") || '<div class="empty-state">No rows found.</div>';
  }

  function validationRow(label, imported, workbook, diff) {
    const ok = Math.abs(Number(diff) || 0) <= TOLERANCE;
    return '<div class="mini-row"><span>' + esc(label) + '</span><strong class="' + (ok ? 'text-green' : 'text-red') + '">' + money(imported) + ' / ' + money(workbook) + ' · Δ ' + money(diff) + '</strong></div>';
  }

  function setChromeLabels() {
    const accountLabel = document.querySelector('.tab-btn[data-tab="accounts"] .tab-label');
    const importLabel = document.querySelector('.tab-btn[data-tab="import"] .tab-label');
    if (accountLabel) accountLabel.textContent = "Banking";
    if (importLabel) importLabel.textContent = "Excel Import";
  }

  function renderHome(state) {
    const totals = (state.workbook && state.workbook.totals) || {};
    const netWorth = Number(totals.netWorth) || delta(sumRows(state.accounts), sumRows(state.creditCards));
    const cardBalance = Number(totals.cardBalance) || sumRows(state.creditCards, "balance");
    const transferBalance = Number(totals.transferBalance) || ((findByName(state.vaults, "Transfer Account") || findByName(state.accounts, "Transfer Account") || {}).balance || 0);
    const overUnder = totals.overUnder != null ? Number(totals.overUnder) || 0 : delta(transferBalance, cardBalance);
    const coverage = totals.coveragePercent != null ? Number(totals.coveragePercent) || 0 : (cardBalance ? transferBalance / cardBalance : 0);
    const bankTotal = sumRows(state.accounts);
    const vaultTotal = sumRows(state.vaults);
    const tone = overUnder >= 0 ? "good" : "bad";
    const headline = overUnder >= 0 ? "Cards covered" : "Cards short";
    const nextPaycheck = state.workbook && state.workbook.paycheck && state.workbook.paycheck.next;
    return '<div class="workbook-hero"><div><div class="eyebrow">Workbook dashboard</div><h1>House Budget</h1><p>Workbook values drive Banking, Vaults, cards coverage, net worth, and paycheck planning.</p></div></div>' +
      '<section class="kpi-grid">' +
        '<div class="kpi kpi--' + (netWorth >= 0 ? 'good' : 'bad') + '"><span>Net worth</span><strong>' + money(netWorth) + '</strong></div>' +
        '<div class="kpi kpi--neutral"><span>Banking</span><strong>' + money(bankTotal) + '</strong></div>' +
        '<div class="kpi kpi--good"><span>Vaults</span><strong>' + money(vaultTotal) + '</strong></div>' +
        '<div class="kpi kpi--bad"><span>Card debt</span><strong>' + money(cardBalance) + '</strong></div>' +
      '</section>' +
      '<section class="status-card status-card--' + (overUnder >= 0 ? 'ok' : 'warn') + '"><div><div class="status-title">' + headline + '</div><div class="status-sub">Transfer Account vs total credit card balance · ' + pct(coverage) + ' coverage</div></div><strong class="' + (overUnder >= 0 ? 'text-green' : 'text-red') + '">' + money(overUnder) + '</strong></section>' +
      '<section class="two-col"><div class="card"><div class="card-head"><div><div class="card-title">Next Paycheck</div><div class="card-subtitle">' + esc(nextPaycheck ? nextPaycheck.date + ' · ' + nextPaycheck.label : ((state.settings && state.settings.nextPayday) || 'No date set')) + '</div></div><button class="link-btn" data-action="go-paycheck">Open</button></div><div class="mini-list">' + tableRows((state.paycheckPlan || []).slice(0, 8), "amount") + '</div></div>' +
      '<div class="card"><div class="card-title">Credit Card Monitor</div><div class="mini-list"><div class="mini-row"><span>Transfer Account</span><strong>' + money(transferBalance) + '</strong></div><div class="mini-row"><span>Total Card Balance</span><strong>' + money(cardBalance) + '</strong></div><div class="mini-row"><span>Over / Under</span><strong class="' + (overUnder >= 0 ? 'text-green' : 'text-red') + '">' + money(overUnder) + '</strong></div></div></div></section>';
  }

  function renderBanking(state) {
    const accounts = state.accounts || [], vaults = state.vaults || [], fidelity = state.investments || [];
    const totals = state.workbook && state.workbook.totals ? state.workbook.totals : {};
    const bankTotal = sumRows(accounts), vaultTotal = sumRows(vaults), fidelityTotal = sumRows(fidelity);
    return '<div class="view-title"><div><div class="eyebrow">Workbook source · 🏦 Bank Accounts</div><h2>Banking</h2></div></div>' +
      '<section class="kpi-grid"><div class="kpi kpi--neutral"><span>Banking Total</span><strong>' + money(bankTotal) + '</strong></div><div class="kpi kpi--good"><span>Vaults Total</span><strong>' + money(vaultTotal) + '</strong></div><div class="kpi kpi--neutral"><span>Fidelity Detail</span><strong>' + money(fidelityTotal) + '</strong></div><div class="kpi kpi--neutral"><span>Net Worth</span><strong>' + money(totals.netWorth || 0) + '</strong></div></section>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Bank Accounts</div><div class="mini-list">' + tableRows(accounts) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Vaults / Buckets</div><p class="help-text">These vault amounts are imported from rows 17–36 and feed goal progress automatically.</p><div class="mini-list">' + tableRows(vaults) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Fidelity Savings Detail</div><p class="help-text">Shown as detail only to avoid double-counting net worth.</p><div class="mini-list">' + tableRows(fidelity) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Validation</div><div class="mini-list">' + validationRow('Banking vs TOTAL IN BANKS', bankTotal, totals.bankWorkbook || bankTotal, delta(bankTotal, totals.bankWorkbook || bankTotal)) + validationRow('Vaults vs TOTAL IN VAULTS', vaultTotal, totals.vaultWorkbook || vaultTotal, delta(vaultTotal, totals.vaultWorkbook || vaultTotal)) + '</div></div>';
  }

  function renderImport(state) {
    const preview = lastPreview;
    return '<div class="view-title"><div><div class="eyebrow">Merged bridge · Excel template import</div><h2>Excel Import</h2></div></div>' +
      '<div class="card"><div class="card-title">Import House Budget workbook</div><p class="help-text">Upload the Excel workbook. The app reads fixed ranges so values cannot slide into the wrong rows.</p>' +
      '<label class="btn btn--primary" style="display:inline-flex;align-items:center;justify-content:center;min-height:52px;font-size:1.05rem;padding:0 18px;cursor:pointer">Choose Excel Workbook<input id="excel-import-file" type="file" accept=".xlsx,.xls,.xlsm" style="position:absolute;left:-9999px"></label>' +
      '<div class="button-row" style="margin-top:14px"><button class="btn btn--primary" data-excel-action="parse">Preview Workbook</button><button class="btn btn--secondary" data-excel-action="apply" ' + (!preview ? 'disabled' : '') + '>Apply Preview</button></div></div>' +
      (preview ? renderPreview(preview) : '<div class="card"><div class="empty-state">No workbook preview yet.</div></div>');
  }

  function renderPreview(preview) {
    const warningHtml = preview.warnings.length ? '<div class="card danger-zone"><div class="card-title">Validation warnings</div><div class="mini-list">' + preview.warnings.map(function (w) { return '<div class="mini-row"><span>Warning</span><strong class="text-red">' + esc(w) + '</strong></div>'; }).join('') + '</div></div>' : '<div class="card"><div class="card-title">Validation</div><div class="empty-state">All mapped totals match the workbook template.</div></div>';
    return warningHtml + '<div class="card"><div class="card-title">Dashboard Monitors</div><div class="mini-list"><div class="mini-row"><span>Net Worth</span><strong>' + money(preview.totals.netWorth) + '</strong></div><div class="mini-row"><span>Coverage %</span><strong>' + pct(preview.totals.coveragePercent) + '</strong></div><div class="mini-row"><span>Over / Under</span><strong>' + money(preview.totals.overUnder) + '</strong></div><div class="mini-row"><span>Next Paycheck</span><strong>' + esc(preview.paycheck && preview.paycheck.next ? preview.paycheck.next.date : 'No valid date') + '</strong></div></div></div>' +
      '<div class="card"><div class="card-title">Totals Check</div><div class="mini-list">' + validationRow('Banking', preview.totals.bankImported, preview.totals.bankWorkbook, preview.totals.bankDelta) + validationRow('Vaults', preview.totals.vaultImported, preview.totals.vaultWorkbook, preview.totals.vaultDelta) + '</div></div>' +
      '<div class="card"><div class="card-title">Vaults Preview</div><div class="mini-list">' + tableRows(preview.vaults) + '</div></div><div class="card"><div class="card-title">Banking Preview</div><div class="mini-list">' + tableRows(preview.accounts) + '</div></div>';
  }

  function wireImport(container, state, api) {
    container.querySelectorAll('[data-excel-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.excelAction === 'parse') return parseSelected(container, api);
        if (button.dataset.excelAction === 'apply') {
          if (!lastPreview) return api.showToast('Preview a workbook first.', 'error');
          if (lastPreview.warnings.length && !confirm('Validation warnings found. Apply anyway?')) return;
          api.save(applyPreview(state, lastPreview));
          api.showToast('Workbook imported. Dashboard, Banking, Vaults, Cards, Paycheck, and Goals updated.', 'success');
          api.showView('dashboard');
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
        lastPreview = parseWorkbook(XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true }), file.name);
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
      setChromeLabels();
      if (api.activeView === 'dashboard') {
        const el = document.getElementById('tab-dashboard');
        if (el) {
          el.innerHTML = renderHome(state);
          el.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () { if (btn.dataset.action === 'go-paycheck') api.showView('paycheck'); });
          });
        }
      }
      if (api.activeView === 'accounts') {
        const el = document.getElementById('tab-accounts');
        if (el) el.innerHTML = renderBanking(state);
      }
      if (api.activeView === 'import') {
        const el = document.getElementById('tab-import');
        if (el) { el.innerHTML = renderImport(state); wireImport(el, state, api); }
      }
    };
    App.Dashboard.__excelImportPatched = true;
  }

  install();
})(window);
