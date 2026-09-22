(function (window) {
  "use strict";
  const App = (window.App = window.App || {});
  const Engine = () => App.PortfolioEngine;
  let selectedAccountId = "";
  let plannedDeposit = 500;
  let lastPlan = null;
  let pendingPortfolioPreview = null;
  let pendingPortfolioFileName = "";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function money(value) {
    return App.Storage && App.Storage.formatCurrency
      ? App.Storage.formatCurrency(value)
      : (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function typeLabel(type) {
    return ({ roth: "Roth IRA", retirement: "Retirement", taxable: "Taxable", savings: "Savings", cash: "Cash" })[type] || "Investment";
  }

  function driftTone(drift) {
    const n = Math.abs(Number(drift) || 0);
    return n <= 1 ? "text-green" : n <= 3 ? "text-orange" : "text-red";
  }

  function renderPlan(plan) {
    if (!plan) return '<div class="empty-state">Enter a deposit and calculate where it should go.</div>';
    const rows = plan.rows.filter(function (row) { return row.recommendedDollars > 0.005; });
    return '<div class="portfolio-plan-summary"><div><span>Deposit</span><strong>' + money(plan.deposit) + '</strong></div><div><span>Projected account</span><strong>' + money(plan.afterTotal) + '</strong></div></div>' +
      '<div class="mini-list">' + rows.map(function (row) {
        const shares = row.estimatedShares == null ? "—" : row.estimatedShares.toLocaleString(undefined, { maximumFractionDigits: 6 });
        return '<div class="mini-row"><span><strong>' + esc(row.ticker) + '</strong><small>' + esc(row.reason) + ' · est. ' + shares + ' shares</small></span><strong>' + money(row.recommendedDollars) + '</strong></div>';
      }).join("") + '</div><p class="help-text" style="margin-top:10px">Contribution-only plan: no selling. Recommendations use workbook targets and saved prices.</p>';
  }

  function positionRow(row) {
    const drift = Number(row.driftPercent) || 0;
    return '<div class="portfolio-position"><div class="portfolio-position__main"><div><strong>' + esc(row.ticker) + '</strong><span>' +
      esc(row.assetType === "cash" ? "Cash" : (Number(row.shares) || 0).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " shares") +
      '</span></div><strong>' + money(row.currentValue) + '</strong></div><div class="portfolio-position__alloc"><span>Current ' + row.currentPercent.toFixed(1) + '%</span><span>Target ' + row.targetPercent.toFixed(1) + '%</span><span class="' + driftTone(drift) + '">' + (drift >= 0 ? "+" : "") + drift.toFixed(1) + '% drift</span></div></div>';
  }

  function renderPortfolio(state) {
    const portfolio = Engine().normalizePortfolio(state);
    if (!portfolio.accounts.length || !portfolio.positions.length) {
      return '<div class="view-title"><div><div class="eyebrow">My Financial Umbrella</div><h2>Investments</h2></div><button class="btn btn--secondary" data-portfolio-action="back">Back</button></div><div class="card"><div class="empty-state">No portfolio holdings imported yet. Open Excel Import and load the House Budget workbook.</div></div>';
    }
    if (!selectedAccountId || !portfolio.accounts.some(function (account) { return account.id === selectedAccountId; })) {
      selectedAccountId = (portfolio.accounts.find(function (account) { return account.type === "roth" || account.type === "taxable"; }) || portfolio.accounts[0]).id;
      lastPlan = null;
    }
    const summary = Engine().portfolioSummary(portfolio);
    const selected = portfolio.accounts.find(function (account) { return account.id === selectedAccountId; }) || portfolio.accounts[0];
    const rows = Engine().allocationRows(portfolio, selected.id);
    const avgDrift = rows.length ? rows.reduce(function (sum, row) { return sum + Math.abs(row.driftPercent); }, 0) / rows.length : 0;

    return '<div class="view-title"><div><div class="eyebrow">My Financial Umbrella · Umbriq engine</div><h2>Investments</h2></div><button class="btn btn--secondary" data-portfolio-action="back">Back</button></div>' +
      '<section class="kpi-grid"><div class="kpi kpi--good"><span>Portfolio</span><strong>' + money(summary.total) + '</strong></div><div class="kpi kpi--neutral"><span>Retirement</span><strong>' + money(summary.retirement) + '</strong></div><div class="kpi kpi--neutral"><span>Taxable</span><strong>' + money(summary.taxable) + '</strong></div><div class="kpi kpi--neutral"><span>Cash / savings</span><strong>' + money(summary.cashSavings) + '</strong></div></section>' +
      '<div class="card"><div class="card-head"><div><div class="card-title">Portfolio Accounts</div><div class="card-subtitle">Imported from ' + esc(portfolio.sourceSheet || "Investment Tracker") + '</div></div></div><div class="portfolio-account-grid">' +
      portfolio.accounts.map(function (account) {
        const active = account.id === selected.id ? " active" : "";
        return '<button class="portfolio-account' + active + '" data-portfolio-action="select" data-account-id="' + esc(account.id) + '"><span>' + esc(account.name) + '</span><small>' + esc(typeLabel(account.type)) + '</small><strong>' + money(Engine().accountValue(portfolio, account.id)) + '</strong></button>';
      }).join("") + '</div></div>' +
      '<div class="card"><div class="card-head"><div><div class="card-title">' + esc(selected.name) + '</div><div class="card-subtitle">' + rows.length + ' positions · average absolute drift ' + avgDrift.toFixed(1) + '%</div></div><strong>' + money(Engine().accountValue(portfolio, selected.id)) + '</strong></div><div class="portfolio-position-list">' + rows.map(positionRow).join("") + '</div></div>' +
      '<div class="card card--glow-cyan"><div class="card-title">Plan a Deposit</div><p class="help-text">Enter new money. The planner routes it to the most underweight holdings while keeping your workbook targets and never selling.</p><div class="portfolio-planner-controls"><label>Account<select id="portfolio-plan-account">' +
      portfolio.accounts.filter(function (account) { return Engine().positionsFor(portfolio, account.id).some(function (position) { return Number(position.targetPercent) > 0; }); }).map(function (account) { return '<option value="' + esc(account.id) + '"' + (account.id === selected.id ? ' selected' : '') + '>' + esc(account.name) + '</option>'; }).join("") +
      '</select></label><label>Deposit<input id="portfolio-plan-amount" type="number" min="0.01" step="0.01" value="' + esc(plannedDeposit) + '"></label></div><button class="btn btn--primary" data-portfolio-action="plan">Calculate Deposit Plan</button><div id="portfolio-plan-result" style="margin-top:14px">' + renderPlan(lastPlan && lastPlan.accountId === selected.id ? lastPlan : null) + '</div></div>';
  }

  function wirePortfolio(container, state, api) {
    const portfolio = Engine().normalizePortfolio(state);
    container.querySelectorAll("[data-portfolio-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        const action = button.dataset.portfolioAction;
        if (action === "back") return api.showView("accounts");
        if (action === "open") return api.showView("portfolio");
        if (action === "select") {
          selectedAccountId = button.dataset.accountId || "";
          lastPlan = null;
          return api.showView("portfolio");
        }
        if (action === "plan") {
          const accountInput = container.querySelector("#portfolio-plan-account");
          const amountInput = container.querySelector("#portfolio-plan-amount");
          selectedAccountId = accountInput && accountInput.value ? accountInput.value : selectedAccountId;
          plannedDeposit = Number(amountInput && amountInput.value) || 0;
          try {
            lastPlan = Engine().planDeposit(portfolio, selectedAccountId, plannedDeposit);
            api.showToast("Deposit plan calculated.", "success");
          } catch (err) {
            lastPlan = null;
            api.showToast(err.message || "Deposit plan could not be calculated.", "error");
          }
          return api.showView("portfolio");
        }
      });
    });
  }

  function entryCard(state) {
    const portfolio = Engine().normalizePortfolio(state);
    if (!portfolio.accounts.length) return '<div class="card"><div class="card-head"><div><div class="card-title">Investments</div><div class="card-subtitle">Umbriq portfolio engine</div></div><button class="link-btn" data-portfolio-action="open">Open</button></div><div class="empty-state">Import the workbook to load account-level holdings and targets.</div></div>';
    const summary = Engine().portfolioSummary(portfolio);
    return '<div class="card card--glow-cyan"><div class="card-head"><div><div class="card-title">Investments</div><div class="card-subtitle">Umbriq portfolio engine · ' + portfolio.accounts.length + ' accounts</div></div><button class="link-btn" data-portfolio-action="open">Open Portfolio</button></div><div class="mini-list"><div class="mini-row"><span>Total portfolio</span><strong>' + money(summary.total) + '</strong></div><div class="mini-row"><span>Retirement</span><strong>' + money(summary.retirement) + '</strong></div><div class="mini-row"><span>Taxable</span><strong>' + money(summary.taxable) + '</strong></div></div></div>';
  }

  function importStatus(preview, error) {
    if (error) return '<div class="card danger-zone" id="portfolio-import-status"><div class="card-title">Portfolio Import</div><p class="help-text text-red">' + esc(error) + '</p></div>';
    if (!preview) return '<div class="card" id="portfolio-import-status"><div class="card-title">Portfolio Import</div><p class="help-text">The same workbook will also load account-level holdings, shares, prices, targets, and the deposit planner.</p></div>';
    return '<div class="card card--glow-cyan" id="portfolio-import-status"><div class="card-title">Portfolio Import Ready</div><div class="mini-list"><div class="mini-row"><span>Source</span><strong>' + esc(preview.sourceSheet) + '</strong></div><div class="mini-row"><span>Accounts</span><strong>' + preview.accounts.length + '</strong></div><div class="mini-row"><span>Positions</span><strong>' + preview.positions.length + '</strong></div><div class="mini-row"><span>Warnings</span><strong class="' + (preview.warnings.length ? 'text-orange' : 'text-green') + '">' + preview.warnings.length + '</strong></div></div></div>';
  }

  function updateImportStatus(container, preview, error) {
    const old = container.querySelector("#portfolio-import-status");
    if (old) old.outerHTML = importStatus(preview, error);
    else container.insertAdjacentHTML("beforeend", importStatus(preview, error));
  }

  function parsePortfolioFile(file, container) {
    if (!file || !window.XLSX) return;
    pendingPortfolioPreview = null;
    pendingPortfolioFileName = file.name || "";
    updateImportStatus(container, null, null);
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const workbook = window.XLSX.read(new Uint8Array(reader.result), { type: "array", cellDates: true });
        pendingPortfolioPreview = Engine().parsePortfolioWorkbook(workbook, file.name);
        pendingPortfolioFileName = file.name;
        updateImportStatus(container, pendingPortfolioPreview, null);
      } catch (err) {
        pendingPortfolioPreview = null;
        updateImportStatus(container, null, err.message || "Portfolio holdings could not be parsed.");
        console.warn("[Portfolio] Workbook portfolio parse failed:", err);
      }
    };
    reader.onerror = function () {
      pendingPortfolioPreview = null;
      updateImportStatus(container, null, "Portfolio workbook read failed.");
    };
    reader.readAsArrayBuffer(file);
  }

  function wireImport(container) {
    if (!container) return;
    container.insertAdjacentHTML("beforeend", importStatus(pendingPortfolioPreview, null));
    const input = container.querySelector("#excel-import-file");
    if (input) input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (file) parsePortfolioFile(file, container);
    });
    const previewButton = container.querySelector('[data-excel-action="parse"]');
    if (previewButton) previewButton.addEventListener("click", function () {
      const file = input && input.files && input.files[0];
      if (file && (pendingPortfolioFileName !== file.name || !pendingPortfolioPreview)) parsePortfolioFile(file, container);
    });
    const applyButton = container.querySelector('[data-excel-action="apply"]');
    if (applyButton) applyButton.addEventListener("click", function () {
      const file = input && input.files && input.files[0];
      if (!pendingPortfolioPreview || (file && pendingPortfolioFileName !== file.name)) return;
      const current = App.getState && App.getState();
      if (!current) return;
      App.setState(Engine().mergePortfolioIntoState(current, pendingPortfolioPreview));
      if (App.showToast) App.showToast("Workbook + portfolio imported.", pendingPortfolioPreview.warnings.length ? "error" : "success");
    });
  }

  function install() {
    if (!Engine() || !App.Dashboard || !App.Dashboard.render || App.Dashboard.__portfolioPatched) return;
    const original = App.Dashboard.render;
    App.Dashboard.render = function (state, api) {
      original.call(App.Dashboard, state, api);
      if (api.activeView === "accounts") {
        const el = document.getElementById("tab-accounts");
        if (el) {
          el.insertAdjacentHTML("beforeend", entryCard(state));
          wirePortfolio(el, state, api);
        }
      }
      if (api.activeView === "import") {
        const el = document.getElementById("tab-import");
        if (el) wireImport(el);
      }
      if (api.activeView === "portfolio") {
        const el = document.getElementById("tab-portfolio");
        if (el) {
          el.innerHTML = renderPortfolio(state);
          wirePortfolio(el, state, api);
        }
      }
    };
    App.Dashboard.__portfolioPatched = true;
  }

  install();
})(window);
