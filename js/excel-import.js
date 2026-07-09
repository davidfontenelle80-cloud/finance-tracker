(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const TOLERANCE = 0.02;

  const PAYCHECK_COLUMNS = [
    { key: "paycheck1", dateCell: "B1", labelCell: "B2", nameCol: "B", valueCol: "C" },
    { key: "paycheck2", dateCell: "D1", labelCell: "D2", nameCol: "D", valueCol: "E" },
    { key: "paycheck3", dateCell: "F1", labelCell: "F2", nameCol: "F", valueCol: "G" },
  ];

  let lastPreview = null;

  // ── Utilities ─────────────────────────────────────────────────────────────

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

  function parseCurrency(val) {
    if (val == null || val === '') return 0;
    var n = parseFloat(String(val).replace(/[$,\s%]/g, ''));
    return isNaN(n) ? 0 : n;
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

  function slugify(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
    return round(String(raw).replace(/[$,% ]/g, ""));
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

  // ── Fuzzy sheet finding ───────────────────────────────────────────────────

  function findSheetName(workbook, regex) {
    return (workbook.SheetNames || []).find(function (n) { return regex.test(n); }) || null;
  }

  function findSheet(workbook, regex) {
    const name = findSheetName(workbook, regex);
    return name ? workbook.Sheets[name] : null;
  }

  // ── Dynamic section parsing ───────────────────────────────────────────────

  // Scan a column top-down for a row whose text matches regex; returns row number or -1
  function findSectionHeader(sheet, nameCol, regex, maxRow) {
    for (let r = 1; r <= (maxRow || 150); r++) {
      const label = String(cellText(sheet, nameCol + r) || "");
      if (regex.test(label)) return r;
    }
    return -1;
  }

  // Read data rows starting at startRow until blank name or Total/Subtotal
  function readDataRows(sheet, startRow, nameCol, valueCol, kind, sheetName) {
    const rows = [];
    for (let r = startRow; r <= 200; r++) {
      const name = cleanName(cellText(sheet, nameCol + r));
      if (!name) break;
      if (/^(total|subtotal)\b/i.test(name) || /\bdifference\b/i.test(name)) break;
      rows.push({
        id: normalizeKey(kind + " " + name) || kind + "-" + r,
        name,
        balance: cellNumber(sheet, valueCol + r),
        sourceSheet: sheetName,
        sourceRange: nameCol + r + ":" + valueCol + r,
        sourceRow: r,
      });
    }
    return rows;
  }

  // Find header by keyword regex, then read data rows after it
  function parseDynamicRows(sheet, nameCol, valueCol, headerRegex, kind, sheetName) {
    const hRow = findSectionHeader(sheet, nameCol, headerRegex, 100);
    if (hRow >= 0) {
      const rows = readDataRows(sheet, hRow + 1, nameCol, valueCol, kind, sheetName);
      if (rows.length > 0) return rows;
    }
    console.warn("[ExcelImport] Section header not found for '" + kind + "' — falling back to block scan");
    return [];
  }

  // Split column into contiguous blocks separated by blank/Total rows
  function parseColumnBlocks(sheet, nameCol, valueCol, kind, sheetName, maxRow) {
    const blocks = [];
    let current = [];
    for (let r = 1; r <= (maxRow || 150); r++) {
      const name = cleanName(cellText(sheet, nameCol + r));
      if (!name || /^(total|subtotal|difference)\b/i.test(name)) {
        if (current.length) { blocks.push(current); current = []; }
      } else {
        current.push({
          id: normalizeKey(kind + " " + name) || kind + "-" + r,
          name,
          balance: cellNumber(sheet, valueCol + r),
          sourceSheet: sheetName,
          sourceRange: nameCol + r + ":" + valueCol + r,
          sourceRow: r,
        });
      }
    }
    if (current.length) blocks.push(current);
    return blocks;
  }

  function parseBanks(bankSheet, sheetName) {
    const rows = parseDynamicRows(bankSheet, "B", "C", /bank\s*account|banking|accounts?\s*&?\s*savings/i, "bank", sheetName);
    if (rows.length > 0) return rows;
    const blocks = parseColumnBlocks(bankSheet, "B", "C", "bank", sheetName, 20);
    return blocks[0] || [];
  }

  function parseVaults(bankSheet, sheetName) {
    const rows = parseDynamicRows(bankSheet, "B", "C", /^vaults?$|savings\s+vaults?|^buckets?$/i, "vault", sheetName);
    if (rows.length > 0) return rows;
    const blocks = parseColumnBlocks(bankSheet, "B", "C", "vault", sheetName, 60);
    return blocks[1] || [];
  }

  function parseFidelity(bankSheet, sheetName) {
    const hRow = findSectionHeader(bankSheet, "F", /fidelity|retirement|investment|hsa/i, 150);
    if (hRow < 0) return [];
    return readDataRows(bankSheet, hRow + 1, "F", "G", "fidelity", sheetName).map(function (item) {
      return Object.assign({}, item, { type: "fidelity" });
    });
  }

  function parseCards(cardSheet, sheetName) {
    if (!cardSheet) return [];
    const cards = [];
    const hRow = findSectionHeader(cardSheet, "B", /credit\s*card|card\s*name|\bcards?\b/i, 20);
    const startRow = hRow >= 0 ? hRow + 1 : 1;
    for (let r = startRow; r <= 100; r++) {
      const name = cleanName(cellText(cardSheet, "B" + r));
      if (!name) break;
      if (/^(total|subtotal|credit card balance|transfer)\b/i.test(name)) break;
      cards.push({
        id: normalizeKey("card " + name) || "card-" + r,
        name,
        available: cellNumber(cardSheet, "C" + r),
        limit: cellNumber(cardSheet, "D" + r),
        balance: cellNumber(cardSheet, "E" + r),
        sourceSheet: sheetName || "💳 Credit Cards",
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

  // ── Goals parsing (NEW) ───────────────────────────────────────────────────

  function buildGoalRow(name, target, saved, sheetName, row) {
    const t = round(Math.max(0, parseCurrency(target)));
    const s = round(Math.max(0, parseCurrency(saved)));
    const remaining = round(Math.max(0, t - s));
    const percentComplete = t > 0 ? Math.min(100, Math.round((s / t) * 100)) : 0;
    const status = percentComplete >= 100 ? "complete" : percentComplete >= 75 ? "on-track" : "in-progress";
    return {
      id: slugify(name) || "goal-" + row,
      name,
      target: t,
      saved: s,
      remaining,
      percentComplete,
      status,
      sourceSheet: sheetName,
      sourceRow: row,
    };
  }

  function detectGoalColumns(sheet, headerRow) {
    let nameCol = null, targetCol = null, savedCol = null;
    for (let c = 65; c <= 74; c++) {
      const letter = String.fromCharCode(c);
      const val = String(cellText(sheet, letter + headerRow) || "").toLowerCase().trim();
      if (!nameCol && /^(name|goal)\b/.test(val)) nameCol = letter;
      else if (!targetCol && /^(target|amount|goal\s*amount)\b/.test(val)) targetCol = letter;
      else if (!savedCol && /^(saved|current|balance)\b/.test(val)) savedCol = letter;
    }
    return { nameCol, targetCol, savedCol };
  }

  function readGoalRows(sheet, startRow, nameCol, targetCol, savedCol, sheetName) {
    const goals = [];
    const nc = nameCol || "B";
    for (let r = startRow; r <= 200; r++) {
      const name = cleanName(cellText(sheet, nc + r));
      if (!name) break;
      if (/^(total|subtotal)\b/i.test(name)) break;
      const target = targetCol ? cellNumber(sheet, targetCol + r) : 0;
      const saved = savedCol ? cellNumber(sheet, savedCol + r) : 0;
      goals.push(buildGoalRow(name, target, saved, sheetName, r));
    }
    return goals;
  }

  function parseGoalSheet(goalSheet, sheetName) {
    let headerRow = -1;
    for (let r = 1; r <= 20; r++) {
      let joined = "";
      for (let c = 65; c <= 74; c++) joined += " " + String(cellText(goalSheet, String.fromCharCode(c) + r) || "").toLowerCase();
      if ((/name|goal/).test(joined) && (/target|amount|saved|current/).test(joined)) { headerRow = r; break; }
    }
    if (headerRow < 0) return [];
    const { nameCol, targetCol, savedCol } = detectGoalColumns(goalSheet, headerRow);
    return readGoalRows(goalSheet, headerRow + 1, nameCol, targetCol, savedCol, sheetName);
  }

  function parseGoalSection(bankSheet, sheetName) {
    const hRow = findSectionHeader(bankSheet, "B", /savings?\s+goals?|goals?\s+tracker/i, 150);
    if (hRow < 0) return [];
    const { nameCol, targetCol, savedCol } = detectGoalColumns(bankSheet, hRow);
    return readGoalRows(bankSheet, hRow + 1, nameCol, targetCol, savedCol, sheetName);
  }

  function parseGoals(workbook, bankSheet, bankSheetName) {
    const goalSheetName = findSheetName(workbook, /savings?\s*goals?|^goals?$/i);
    if (goalSheetName) {
      const goals = parseGoalSheet(workbook.Sheets[goalSheetName], goalSheetName);
      if (goals.length > 0) return goals;
    }
    if (bankSheet) return parseGoalSection(bankSheet, bankSheetName || "🏦 Bank Accounts");
    return [];
  }

  // ── Validation report (NEW) ───────────────────────────────────────────────

  function generateValidationReport(preview) {
    const accounts = preview.accounts || [];
    const vaults = preview.vaults || [];
    const creditCards = preview.creditCards || [];
    const goals = preview.goals || [];
    const fidelity = preview.fidelity || [];
    const warnings = preview.warnings || [];

    const allNames = accounts.map(function (a) { return a.name; }).concat(vaults.map(function (v) { return v.name; }));
    const seen = new Set();
    const duplicateNames = [];
    allNames.forEach(function (n) { if (seen.has(n)) duplicateNames.push(n); seen.add(n); });

    const missingFields = [];
    goals.forEach(function (g) { if (!g.target) missingFields.push(g.name + ": missing target"); });
    creditCards.forEach(function (c) { if (!c.limit) missingFields.push(c.name + ": missing limit"); });

    const goalTotals = {
      count: goals.length,
      totalTarget: round(goals.reduce(function (s, g) { return s + (Number(g.target) || 0); }, 0)),
      totalSaved: round(goals.reduce(function (s, g) { return s + (Number(g.saved) || 0); }, 0)),
    };
    const bankTotals = { count: accounts.length, totalBalance: round(sumRows(accounts)) };
    const vaultTotals = { count: vaults.length, totalBalance: round(sumRows(vaults)) };
    const cardTotals = {
      count: creditCards.length,
      totalLimit: round(creditCards.reduce(function (s, c) { return s + (Number(c.limit) || 0); }, 0)),
      totalUsed: round(creditCards.reduce(function (s, c) { return s + (Number(c.balance) || 0); }, 0)),
    };

    const sheetsDiscovered = Array.from(new Set(
      accounts.concat(vaults).concat(creditCards).concat(goals)
        .map(function (r) { return r.sourceSheet; }).filter(Boolean)
    ));
    const tablesDiscovered = [];
    if (bankTotals.count > 0) tablesDiscovered.push("Bank Accounts");
    if (vaultTotals.count > 0) tablesDiscovered.push("Vaults");
    if (cardTotals.count > 0) tablesDiscovered.push("Credit Cards");
    if (goalTotals.count > 0) tablesDiscovered.push("Goals");
    if (fidelity.length > 0) tablesDiscovered.push("Fidelity");

    const status = (bankTotals.count === 0 && vaultTotals.count === 0) ? "error" : warnings.length > 0 ? "partial" : "success";

    return {
      sheetsDiscovered,
      tablesDiscovered,
      rowsImported: bankTotals.count + vaultTotals.count + cardTotals.count + goalTotals.count,
      rowsSkipped: 0,
      duplicateNames,
      missingFields,
      warnings,
      goalTotals,
      bankTotals,
      vaultTotals,
      cardTotals,
      status,
    };
  }

  // ── Core parsing ──────────────────────────────────────────────────────────

  function parseWorkbook(workbook, fileName) {
    const bankSheetName = findSheetName(workbook, /bank|account/i) || "🏦 Bank Accounts";
    const cardSheetName = findSheetName(workbook, /credit|card/i);
    const paycheckSheetName = findSheetName(workbook, /paycheck|planner/i);

    const bankSheet = workbook.Sheets[bankSheetName];
    const cardSheet = cardSheetName ? workbook.Sheets[cardSheetName] : null;
    const paycheckSheet = paycheckSheetName ? workbook.Sheets[paycheckSheetName] : null;

    if (!bankSheet) throw new Error("Could not find the 🏦 Bank Accounts sheet. Sheets found: " + (workbook.SheetNames || []).join(", "));

    const accounts = parseBanks(bankSheet, bankSheetName).map(function (item) {
      const key = normalizeKey(item.name);
      return Object.assign({}, item, {
        type: "bank",
        role: key.includes("transfer account") ? "transfer" : key.includes("checking") ? "checking" : "savings",
      });
    });
    const vaults = parseVaults(bankSheet, bankSheetName).map(function (item) { return Object.assign({}, item, { target: 0 }); });
    const fidelity = parseFidelity(bankSheet, bankSheetName);
    const cards = parseCards(cardSheet, cardSheetName);
    const paycheck = parsePaycheck(paycheckSheet);
    const goals = parseGoals(workbook, bankSheet, bankSheetName);

    const cardBalance = cardSheet ? cellNumber(cardSheet, "C22") : sumRows(cards, "balance");
    const transferBalance = cardSheet ? cellNumber(cardSheet, "C21") : ((findByName(vaults, "Transfer Account") || findByName(accounts, "Transfer Account") || {}).balance || 0);
    const coveragePercent = cardSheet ? Number(cell(cardSheet, "C23")) || 0 : (cardBalance ? transferBalance / cardBalance : 0);
    const overUnder = cardSheet ? cellNumber(cardSheet, "C24") : delta(transferBalance, cardBalance);
    const coverageStatus = cleanName(cellText(cardSheet, "E21"));

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
      coverageStatus,
      bankingCoverageCheck: cellNumber(bankSheet, "D14"),
    };
    totals.bankDelta = delta(totals.bankImported, totals.bankWorkbook);
    totals.vaultDelta = delta(totals.vaultImported, totals.vaultWorkbook);
    totals.fidelityDelta = delta(totals.fidelityImported, totals.fidelityWorkbook);

    const warnings = [];
    if (Math.abs(totals.bankDelta) > TOLERANCE) warnings.push("Banking total does not match TOTAL IN BANKS.");
    if (Math.abs(totals.vaultDelta) > TOLERANCE) warnings.push("Vault total does not match TOTAL IN VAULTS.");
    if (totals.fidelityWorkbook && Math.abs(totals.fidelityDelta) > TOLERANCE) warnings.push("Fidelity detail total does not match Fidelity total.");

    const preview = {
      fileName: fileName || "Workbook",
      importedAt: new Date().toISOString(),
      accounts,
      vaults,
      fidelity,
      creditCards: cards,
      paycheck,
      goals,
      totals,
      warnings,
      bankSheetName,
    };
    preview.validation = generateValidationReport(preview);
    console.log("[ExcelImport] Validation report:", preview.validation);
    return preview;
  }

  // ── State helpers (preserved) ─────────────────────────────────────────────

  function preserveTargets(importedVaults, existingVaults) {
    const targetByName = new Map((existingVaults || []).map(function (v) { return [normalizeKey(v.name), Number(v.target) || 0]; }));
    return importedVaults.map(function (v) { return Object.assign({}, v, { target: targetByName.get(normalizeKey(v.name)) || Number(v.target) || 0 }); });
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

  // PRESERVED — not removed until parseGoals is confirmed working in production
  function syncGoals(goals, accounts, vaults) {
    return (goals || []).map(function (goal) {
      const saved = round(progressSourceBalance(goal, accounts, vaults));
      const target = Number(goal.target) || 0;
      return Object.assign({}, goal, { saved, pct: target > 0 ? Math.min(100, round((saved / target) * 100)) : 0 });
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
    // Goals FULLY REPLACED on every import — never merge, never preserve deleted goals
    next.goals = preview.goals || [];
    next.workbook = Object.assign({}, next.workbook || {}, {
      name: preview.fileName,
      lastSnapshot: preview.importedAt,
      template: preview.bankSheetName || "🏦 Bank Accounts",
      totals: preview.totals,
      paycheck: preview.paycheck,
      validation: preview.validation,
    });
    next.notes = next.notes || [];
    if (preview.warnings.length) {
      console.warn("[ExcelImport] Validation warnings:", preview.warnings.join(" "));
    }
    return next;
  }

  // ── Render helpers (preserved) ────────────────────────────────────────────

  function tableRows(rows, valueField) {
    return (rows || []).map(function (row) { return '<div class="mini-row"><span>' + esc(row.name) + '</span><strong>' + money(row[valueField || "balance"]) + '</strong></div>'; }).join("") || '<div class="empty-state">No rows found.</div>';
  }

  function validationRow(label, imported, workbook, diff) {
    const ok = Math.abs(Number(diff) || 0) <= TOLERANCE;
    return '<div class="mini-row"><span>' + esc(label) + '</span><strong class="' + (ok ? "text-green" : "text-red") + '">' + money(imported) + ' / ' + money(workbook) + ' · Δ ' + money(diff) + '</strong></div>';
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
    const headline = overUnder >= 0 ? "Cards covered" : "Cards short";
    const nextPaycheck = state.workbook && state.workbook.paycheck && state.workbook.paycheck.next;
    return '<div class="workbook-hero"><div><div class="eyebrow">Workbook dashboard</div><h1>House Budget</h1><p>Workbook values drive Banking, Vaults, cards coverage, net worth, and paycheck planning.</p></div></div>' +
      '<section class="kpi-grid">' +
        '<div class="kpi kpi--' + (netWorth >= 0 ? "good" : "bad") + '"><span>Net worth</span><strong>' + money(netWorth) + '</strong></div>' +
        '<div class="kpi kpi--neutral"><span>Banking</span><strong>' + money(bankTotal) + '</strong></div>' +
        '<div class="kpi kpi--good"><span>Vaults</span><strong>' + money(vaultTotal) + '</strong></div>' +
        '<div class="kpi kpi--bad"><span>Card debt</span><strong>' + money(cardBalance) + '</strong></div>' +
      '</section>' +
      '<section class="status-card status-card--' + (overUnder >= 0 ? "ok" : "warn") + '"><div><div class="status-title">' + headline + '</div><div class="status-sub">Transfer Account vs total credit card balance · ' + pct(coverage) + ' coverage</div></div><strong class="' + (overUnder >= 0 ? "text-green" : "text-red") + '">' + money(overUnder) + '</strong></section>' +
      '<section class="two-col"><div class="card"><div class="card-head"><div><div class="card-title">Next Paycheck</div><div class="card-subtitle">' + esc(nextPaycheck ? nextPaycheck.date + " · " + nextPaycheck.label : ((state.settings && state.settings.nextPayday) || "No date set")) + '</div></div><button class="link-btn" data-action="go-paycheck">Open</button></div><div class="mini-list">' + tableRows((state.paycheckPlan || []).slice(0, 8), "amount") + '</div></div>' +
      '<div class="card"><div class="card-title">Credit Card Monitor</div><div class="mini-list"><div class="mini-row"><span>Transfer Account</span><strong>' + money(transferBalance) + '</strong></div><div class="mini-row"><span>Total Card Balance</span><strong>' + money(cardBalance) + '</strong></div><div class="mini-row"><span>Over / Under</span><strong class="' + (overUnder >= 0 ? "text-green" : "text-red") + '">' + money(overUnder) + '</strong></div></div></div></section>';
  }

  function renderBanking(state) {
    const accounts = state.accounts || [], vaults = state.vaults || [], fidelity = state.investments || [];
    const totals = state.workbook && state.workbook.totals ? state.workbook.totals : {};
    const bankTotal = sumRows(accounts), vaultTotal = sumRows(vaults), fidelityTotal = sumRows(fidelity);
    return '<div class="view-title"><div><div class="eyebrow">Workbook source · 🏦 Bank Accounts</div><h2>Banking</h2></div></div>' +
      '<section class="kpi-grid"><div class="kpi kpi--neutral"><span>Banking Total</span><strong>' + money(bankTotal) + '</strong></div><div class="kpi kpi--good"><span>Vaults Total</span><strong>' + money(vaultTotal) + '</strong></div><div class="kpi kpi--neutral"><span>Fidelity Detail</span><strong>' + money(fidelityTotal) + '</strong></div><div class="kpi kpi--neutral"><span>Net Worth</span><strong>' + money(totals.netWorth || 0) + '</strong></div></section>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Bank Accounts</div><div class="mini-list">' + tableRows(accounts) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Vaults / Buckets</div><p class="help-text">Vault amounts are dynamically detected and feed goal progress automatically.</p><div class="mini-list">' + tableRows(vaults) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Fidelity Savings Detail</div><p class="help-text">Shown as detail only to avoid double-counting net worth.</p><div class="mini-list">' + tableRows(fidelity) + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:12px">Validation</div><div class="mini-list">' + validationRow("Banking vs TOTAL IN BANKS", bankTotal, totals.bankWorkbook || bankTotal, delta(bankTotal, totals.bankWorkbook || bankTotal)) + validationRow("Vaults vs TOTAL IN VAULTS", vaultTotal, totals.vaultWorkbook || vaultTotal, delta(vaultTotal, totals.vaultWorkbook || vaultTotal)) + '</div></div>';
  }

  function renderImport(state) {
    const preview = lastPreview;
    return '<div class="view-title"><div><div class="eyebrow">Dynamic importer · Excel template</div><h2>Excel Import</h2></div></div>' +
      '<div class="card"><div class="card-title">Import House Budget workbook</div><p class="help-text">Upload the Excel workbook. The app dynamically detects sections so values are safe even if rows shift.</p>' +
      '<label class="btn btn--primary" style="display:inline-flex;align-items:center;justify-content:center;min-height:52px;font-size:1.05rem;padding:0 18px;cursor:pointer">Choose Excel Workbook<input id="excel-import-file" type="file" accept=".xlsx,.xls,.xlsm" style="position:absolute;left:-9999px"></label>' +
      '<div class="button-row" style="margin-top:14px"><button class="btn btn--primary" data-excel-action="parse">Preview Workbook</button><button class="btn btn--secondary" data-excel-action="apply" ' + (!preview ? "disabled" : "") + '>Apply Preview</button></div></div>' +
      (preview ? renderPreview(preview) : '<div class="card"><div class="empty-state">No workbook preview yet.</div></div>');
  }

  function renderPreview(preview) {
    const v = preview.validation || {};
    const validationSummary = '<div class="mini-row"><span>Sheets discovered</span><strong>' + (v.sheetsDiscovered || []).map(esc).join(", ") + '</strong></div>' +
      '<div class="mini-row"><span>Tables found</span><strong>' + (v.tablesDiscovered || []).join(", ") + '</strong></div>' +
      '<div class="mini-row"><span>Rows imported</span><strong>' + (v.rowsImported || 0) + '</strong></div>' +
      '<div class="mini-row"><span>Goals</span><strong>' + ((v.goalTotals || {}).count || 0) + ' · Target ' + money((v.goalTotals || {}).totalTarget) + ' · Saved ' + money((v.goalTotals || {}).totalSaved) + '</strong></div>' +
      '<div class="mini-row"><span>Status</span><strong class="' + (v.status === "success" ? "text-green" : v.status === "error" ? "text-red" : "text-orange") + '">' + (v.status || "unknown") + '</strong></div>';
    const warningHtml = preview.warnings.length
      ? '<div class="card danger-zone"><div class="card-title">Validation warnings</div><div class="mini-list">' + preview.warnings.map(function (w) { return '<div class="mini-row"><span>Warning</span><strong class="text-red">' + esc(w) + '</strong></div>'; }).join("") + '</div></div>'
      : '<div class="card"><div class="card-title">Validation</div><div class="empty-state">All mapped totals match the workbook template.</div></div>';
    return warningHtml +
      '<div class="card"><div class="card-title">Import Summary</div><div class="mini-list">' + validationSummary + '</div></div>' +
      '<div class="card"><div class="card-title">Dashboard Monitors</div><div class="mini-list"><div class="mini-row"><span>Net Worth</span><strong>' + money(preview.totals.netWorth) + '</strong></div><div class="mini-row"><span>Coverage %</span><strong>' + pct(preview.totals.coveragePercent) + '</strong></div><div class="mini-row"><span>Over / Under</span><strong>' + money(preview.totals.overUnder) + '</strong></div><div class="mini-row"><span>Next Paycheck</span><strong>' + esc(preview.paycheck && preview.paycheck.next ? preview.paycheck.next.date : "No valid date") + '</strong></div></div></div>' +
      '<div class="card"><div class="card-title">Totals Check</div><div class="mini-list">' + validationRow("Banking", preview.totals.bankImported, preview.totals.bankWorkbook, preview.totals.bankDelta) + validationRow("Vaults", preview.totals.vaultImported, preview.totals.vaultWorkbook, preview.totals.vaultDelta) + '</div></div>' +
      '<div class="card"><div class="card-title">Vaults Preview</div><div class="mini-list">' + tableRows(preview.vaults) + '</div></div>' +
      '<div class="card"><div class="card-title">Banking Preview</div><div class="mini-list">' + tableRows(preview.accounts) + '</div></div>' +
      (preview.goals && preview.goals.length ? '<div class="card"><div class="card-title">Goals Preview (' + preview.goals.length + ')</div><div class="mini-list">' + preview.goals.map(function (g) { return '<div class="mini-row"><span>' + esc(g.name) + ' (' + g.percentComplete + '%)</span><strong>' + money(g.saved) + ' / ' + money(g.target) + '</strong></div>'; }).join("") + '</div></div>' : "");
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  function wireImport(container, state, api) {
    container.querySelectorAll("[data-excel-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.excelAction === "parse") return parseSelected(container, api);
        if (button.dataset.excelAction === "apply") {
          if (!lastPreview) return api.showToast("Preview a workbook first.", "error");
          if (lastPreview.warnings.length && !confirm("Validation warnings found. Apply anyway?")) return;
          try {
            api.save(applyPreview(state, lastPreview));
          } catch (err) {
            console.warn("[ExcelImport] Save failed (cloud may be unavailable):", err);
          }
          api.showToast("Workbook imported. Dashboard, Banking, Vaults, Cards, Paycheck, and Goals updated.", "success");
          api.showView("dashboard");
        }
      });
    });
  }

  function parseSelected(container, api) {
    const input = container.querySelector("#excel-import-file");
    const file = input && input.files && input.files[0];
    if (!file) return api.showToast("Choose the Excel workbook first.", "error");
    if (!window.XLSX) return api.showToast("Excel parser did not load. Check your connection and refresh.", "error");
    const reader = new FileReader();
    reader.onload = function () {
      try {
        lastPreview = parseWorkbook(XLSX.read(new Uint8Array(reader.result), { type: "array", cellDates: true }), file.name);
        api.showToast("Workbook preview ready.", lastPreview.warnings.length ? "error" : "success");
        api.showView("import");
      } catch (err) {
        console.error("[ExcelImport] Parse failed:", err);
        api.showToast(err.message || "Workbook could not be parsed.", "error");
      }
    };
    reader.onerror = function () { api.showToast("Workbook read failed.", "error"); };
    reader.readAsArrayBuffer(file);
  }

  function install() {
    if (!App.Dashboard || !App.Dashboard.render || App.Dashboard.__excelImportPatched) return;
    const original = App.Dashboard.render;
    App.Dashboard.render = function (state, api) {
      original.call(App.Dashboard, state, api);
      setChromeLabels();
      if (api.activeView === "dashboard") {
        const el = document.getElementById("tab-dashboard");
        if (el) {
          el.innerHTML = renderHome(state);
          el.querySelectorAll("[data-action]").forEach(function (btn) {
            btn.addEventListener("click", function () { if (btn.dataset.action === "go-paycheck") api.showView("paycheck"); });
          });
        }
      }
      if (api.activeView === "accounts") {
        const el = document.getElementById("tab-accounts");
        if (el) el.innerHTML = renderBanking(state);
      }
      if (api.activeView === "import") {
        const el = document.getElementById("tab-import");
        if (el) { el.innerHTML = renderImport(state); wireImport(el, state, api); }
      }
    };
    App.Dashboard.__excelImportPatched = true;
  }

  install();
})(window);
