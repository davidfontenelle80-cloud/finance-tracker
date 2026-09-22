(function (window) {
  "use strict";
  const App = (window.App = window.App || {});

  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function cleanHeader(value) {
    return String(value == null ? "" : value)
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "portfolio";
  }

  function accountType(name) {
    const value = cleanHeader(name);
    if (value.includes("roth")) return "roth";
    if (value.includes("401") || value.includes("403") || value.includes("457") || value.includes("ira") || value.includes("retirement")) return "retirement";
    if (value.includes("taxable") || value.includes("brokerage")) return "taxable";
    if (value.includes("emergency") || value === "cash") return "cash";
    if (value.includes("saving") || value.includes("sgov")) return "savings";
    return "investment";
  }

  function parsePortfolioWorkbook(workbook, fileName) {
    if (!workbook || !window.XLSX) throw new Error("Excel parser is not available.");
    const sheetName = (workbook.SheetNames || []).find(function (name) {
      return /investment.*tracker|portfolio/i.test(String(name));
    });
    if (!sheetName) throw new Error("No Investment Tracker / Portfolio sheet was found.");
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
    let headerRow = -1;
    let cols = null;

    for (let r = 0; r < Math.min(rows.length, 60); r++) {
      const headers = (rows[r] || []).map(cleanHeader);
      const account = headers.indexOf("account");
      if (account < 0) continue;
      const ticker = headers.findIndex(function (value, index) { return index > account && value === "ticker"; });
      const shares = headers.findIndex(function (value, index) { return index > account && value === "shares"; });
      const target = headers.findIndex(function (value, index) { return index > account && value.startsWith("target"); });
      if (ticker >= 0 && shares >= 0 && target >= 0) {
        const priceTicker = headers.findIndex(function (value, index) { return index < account && value === "ticker"; });
        const price = headers.findIndex(function (value, index) { return index > priceTicker && index < account && value === "price"; });
        headerRow = r;
        cols = { account, ticker, shares, target, priceTicker, price };
        break;
      }
    }
    if (headerRow < 0 || !cols) throw new Error("The holdings header (Account / Ticker / Shares / Target %) was not found.");

    const prices = new Map();
    if (cols.priceTicker >= 0 && cols.price >= 0) {
      let blanks = 0;
      for (let r = headerRow + 1; r < Math.min(rows.length, headerRow + 120); r++) {
        const ticker = String((rows[r] || [])[cols.priceTicker] || "").trim().toUpperCase();
        const price = Number((rows[r] || [])[cols.price]);
        if (!ticker) {
          blanks++;
          if (blanks >= 8) break;
          continue;
        }
        blanks = 0;
        if (Number.isFinite(price) && price >= 0) prices.set(ticker, price);
      }
    }

    const accountsById = new Map();
    const positions = [];
    const warnings = [];
    let blankRows = 0;
    for (let r = headerRow + 1; r < Math.min(rows.length, headerRow + 220); r++) {
      const row = rows[r] || [];
      const accountName = String(row[cols.account] || "").trim();
      const tickerRaw = String(row[cols.ticker] || "").trim();
      if (!accountName && !tickerRaw) {
        blankRows++;
        if (blankRows >= 8) break;
        continue;
      }
      blankRows = 0;
      if (!accountName || !tickerRaw) continue;
      if (/^total$/i.test(tickerRaw) || /^total$/i.test(accountName)) continue;

      const ticker = tickerRaw.toUpperCase() === "CASH" ? "CASH" : tickerRaw.toUpperCase();
      const shares = Number(row[cols.shares]);
      let target = Number(row[cols.target]);
      if (!Number.isFinite(shares) || shares < 0) {
        warnings.push(accountName + " / " + ticker + ": invalid shares; skipped.");
        continue;
      }
      if (!Number.isFinite(target) || target < 0) {
        warnings.push(accountName + " / " + ticker + ": invalid target; skipped.");
        continue;
      }
      if (target <= 1.000001) target *= 100;
      const assetType = ticker === "CASH" ? "cash" : "security";
      const price = assetType === "cash" ? 1 : Number(prices.get(ticker) || 0);
      if (assetType !== "cash" && !(price > 0)) warnings.push(accountName + " / " + ticker + ": no saved price found; value will show as $0 until a price is available.");

      const accountId = "workbook-" + slugify(accountName);
      if (!accountsById.has(accountId)) {
        accountsById.set(accountId, { id: accountId, name: accountName, type: accountType(accountName), source: "workbook" });
      }
      positions.push({
        id: accountId + "-" + slugify(ticker),
        accountId: accountId,
        ticker: ticker,
        shares: shares,
        price: price,
        targetPercent: target,
        assetType: assetType,
        isActive: true,
        excludedFromContributions: false,
        sourceRow: r + 1,
      });
    }

    const accounts = Array.from(accountsById.values()).map(function (account) {
      const accountPositions = positions.filter(function (position) { return position.accountId === account.id; });
      const targetTotal = accountPositions.reduce(function (sum, position) { return sum + Number(position.targetPercent || 0); }, 0);
      const balance = accountPositions.reduce(function (sum, position) {
        return sum + (position.assetType === "cash" ? Number(position.shares || 0) : Number(position.shares || 0) * Number(position.price || 0));
      }, 0);
      if (accountPositions.length && Math.abs(targetTotal - 100) > 0.05) warnings.push(account.name + ": targets total " + targetTotal.toFixed(2) + "%, not 100%.");
      return Object.assign({}, account, { balance: round2(balance), positionsCount: accountPositions.length, targetTotal: round2(targetTotal) });
    });

    if (!accounts.length || !positions.length) throw new Error("No portfolio holdings were found in the investment sheet.");
    return {
      version: "portfolio-1.0",
      fileName: fileName || "Workbook",
      sourceSheet: sheetName,
      importedAt: new Date().toISOString(),
      accounts: accounts,
      positions: positions,
      warnings: warnings,
    };
  }

  function normalizePortfolio(state) {
    const portfolio = state && state.portfolio && typeof state.portfolio === "object" ? state.portfolio : {};
    return {
      accounts: Array.isArray(portfolio.accounts) ? portfolio.accounts : [],
      positions: Array.isArray(portfolio.positions) ? portfolio.positions : [],
      importedAt: portfolio.importedAt || null,
      sourceSheet: portfolio.sourceSheet || "",
    };
  }

  function positionValue(position) {
    if (position.assetType === "cash") return Number(position.shares) || 0;
    return (Number(position.shares) || 0) * (Number(position.price) || 0);
  }

  function positionsFor(portfolio, accountId) {
    return portfolio.positions.filter(function (position) { return position.accountId === accountId; });
  }

  function accountValue(portfolio, accountId) {
    return round2(positionsFor(portfolio, accountId).reduce(function (sum, position) { return sum + positionValue(position); }, 0));
  }

  function portfolioSummary(portfolio) {
    return portfolio.accounts.reduce(function (summary, account) {
      const value = accountValue(portfolio, account.id);
      summary.total += value;
      if (account.type === "roth" || account.type === "retirement") summary.retirement += value;
      else if (account.type === "taxable") summary.taxable += value;
      else summary.cashSavings += value;
      return summary;
    }, { total: 0, retirement: 0, taxable: 0, cashSavings: 0 });
  }

  function allocationRows(portfolio, accountId) {
    const positions = positionsFor(portfolio, accountId);
    const total = positions.reduce(function (sum, position) { return sum + positionValue(position); }, 0);
    return positions.map(function (position) {
      const value = positionValue(position);
      const currentPercent = total > 0 ? value / total * 100 : 0;
      const targetPercent = Number(position.targetPercent) || 0;
      return Object.assign({}, position, {
        currentValue: round2(value),
        currentPercent: currentPercent,
        targetPercent: targetPercent,
        driftPercent: currentPercent - targetPercent,
      });
    });
  }

  // Contribution-only water-filling. Overweight holdings get $0; the deposit
  // raises underweight holdings toward a common target-adjusted level.
  function planDeposit(portfolio, accountId, deposit) {
    deposit = Number(deposit);
    if (!Number.isFinite(deposit) || deposit <= 0) throw new Error("Enter a deposit greater than $0.");
    const rows = allocationRows(portfolio, accountId).filter(function (row) {
      return row.isActive !== false && row.excludedFromContributions !== true && Number(row.targetPercent) > 0;
    });
    if (!rows.length) throw new Error("This account has no active target allocations.");
    const targetTotal = rows.reduce(function (sum, row) { return sum + Number(row.targetPercent); }, 0);
    if (Math.abs(targetTotal - 100) > 0.05) throw new Error("Targets for this account must total 100% before planning a deposit.");

    let active = rows.slice();
    let level = 0;
    while (active.length) {
      const weight = active.reduce(function (sum, row) { return sum + row.targetPercent / 100; }, 0);
      const current = active.reduce(function (sum, row) { return sum + row.currentValue; }, 0);
      level = (deposit + current) / weight;
      const next = active.filter(function (row) {
        const w = row.targetPercent / 100;
        return w > 0 && row.currentValue / w < level - 0.000001;
      });
      if (next.length === active.length) break;
      active = next;
    }
    if (!active.length) throw new Error("No position can receive this deposit under the current targets.");

    const activeIds = new Set(active.map(function (row) { return row.id; }));
    let allocations = rows.map(function (row) {
      return Object.assign({}, row, {
        recommendedDollars: activeIds.has(row.id) ? Math.max(0, level * (row.targetPercent / 100) - row.currentValue) : 0,
      });
    });
    const rawSum = allocations.reduce(function (sum, row) { return sum + row.recommendedDollars; }, 0);
    if (rawSum <= 0) throw new Error("No contribution plan could be calculated.");
    const scale = deposit / rawSum;
    allocations = allocations.map(function (row) { return Object.assign({}, row, { recommendedDollars: round2(row.recommendedDollars * scale) }); });
    const roundedSum = allocations.reduce(function (sum, row) { return sum + row.recommendedDollars; }, 0);
    const residue = round2(deposit - roundedSum);
    if (Math.abs(residue) >= 0.01) {
      const receiver = allocations.slice().sort(function (a, b) { return b.recommendedDollars - a.recommendedDollars || String(a.ticker).localeCompare(String(b.ticker)); })[0];
      if (receiver) receiver.recommendedDollars = round2(receiver.recommendedDollars + residue);
    }

    const accountTotal = rows.reduce(function (sum, row) { return sum + row.currentValue; }, 0);
    const finalTotal = accountTotal + deposit;
    allocations = allocations.map(function (row) {
      const projectedValue = row.currentValue + row.recommendedDollars;
      const price = Number(row.price) || 0;
      return Object.assign({}, row, {
        projectedValue: round2(projectedValue),
        projectedPercent: finalTotal > 0 ? projectedValue / finalTotal * 100 : 0,
        estimatedShares: price > 0 ? row.recommendedDollars / price : null,
        reason: row.recommendedDollars > 0.005 ? "Under target" : "At/above target",
      });
    });
    return { accountId: accountId, deposit: round2(deposit), beforeTotal: round2(accountTotal), afterTotal: round2(finalTotal), rows: allocations };
  }

  function mergePortfolioIntoState(state, portfolio) {
    const next = App.Storage.clone(state);
    next.portfolio = portfolio;
    next.investments = (portfolio.accounts || [])
      .filter(function (account) { return ["roth", "retirement", "taxable", "investment"].includes(account.type); })
      .map(function (account) { return { id: account.id, name: account.name, balance: Number(account.balance) || 0 }; });
    next.workbook = Object.assign({}, next.workbook || {}, {
      portfolio: {
        sourceSheet: portfolio.sourceSheet,
        importedAt: portfolio.importedAt,
        accounts: portfolio.accounts.length,
        positions: portfolio.positions.length,
        warnings: portfolio.warnings || [],
      },
    });
    return next;
  }

  App.PortfolioEngine = {
    round2,
    parsePortfolioWorkbook,
    normalizePortfolio,
    positionsFor,
    accountValue,
    portfolioSummary,
    allocationRows,
    planDeposit,
    mergePortfolioIntoState,
  };
})(window);
