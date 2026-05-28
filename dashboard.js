/* ══════════════════════════════════════════════════════════════
   DASHBOARD.JS — Net Worth + Charts
   Tab 7: Financial overview with 4 Chart.js charts.
   Chart.js loaded from CDN on first open (cached by service worker).
   Net worth snapshot logged once per month on open.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const fmt  = (n) => App.Storage.formatCurrency(n);
  const fmt0 = (n) => App.Storage.formatCurrency(n, false);

  // Chart instances — kept so they can be destroyed before re-render
  let _charts = [];

  // Year being viewed (default current)
  let _viewYear = new Date().getFullYear();

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    // Log net worth snapshot for this month if not already done
    logMonthlySnapshot(state);

    container.innerHTML = buildHtml(state);

    // Charts need Chart.js — load from CDN then draw
    loadChartJs(() => drawCharts(state));
  }

  // ── Log monthly snapshot ──────────────────────────────────
  // Called once per month when the dashboard opens.
  // Records net worth breakdown for the 12-month chart.
  function logMonthlySnapshot(state) {
    const today    = App.Storage.toISODate(new Date());
    const monthKey = today.slice(0, 7); // "YYYY-MM"
    const history  = state.netWorthHistory || [];

    // Skip if we already have an entry for this month
    if (history.some(h => h.date.startsWith(monthKey))) return;

    const { investments, cash, debt } = calcNetWorthComponents(state);
    const netWorth = investments + cash - debt;

    // Write directly to storage without firing the event bus
    // (avoids re-render loop: Dashboard open → setState → state:changed → Dashboard re-render)
    const ns = App.Storage.cloneState(state);
    if (!ns.netWorthHistory) ns.netWorthHistory = [];
    ns.netWorthHistory.push({ date: today, netWorth, investments, cash, debt });
    if (ns.netWorthHistory.length > 36) ns.netWorthHistory.shift();
    App.Storage.saveState(ns);
    // Patch the live state reference without emitting events
    state.netWorthHistory = ns.netWorthHistory;
  }

  // ── Net worth calculation ─────────────────────────────────
  function calcNetWorthComponents(state) {
    const accts = state.accounts || {};
    const bank  = accts.bank || [];

    // Liquidity tiers for bank accounts
    const liquid    = bank.filter(a => a.liquidityTier === 'immediate' || !a.liquidityTier);
    const shortTerm = bank.filter(a => a.liquidityTier === 'short');
    const locked    = bank.filter(a => a.liquidityTier === 'locked');

    const liquidCash    = liquid.reduce(   (s, a) => s + (Number(a.balance) || 0), 0);
    const shortCash     = shortTerm.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const cash          = bank.reduce(     (s, a) => s + (Number(a.balance) || 0), 0);

    // Debt = all credit card balances
    const debt = (accts.cards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);

    // Investments = all holdings × price + locked bank (Roth etc)
    const holdingsValue = ((state.investments || {}).accounts || []).reduce((acctSum, a) => {
      return acctSum + (a.holdings || []).reduce((s, h) =>
        s + ((h.shares || 0) * (h.price || 0)), 0);
    }, 0);
    const lockedCash   = locked.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const investments  = holdingsValue + lockedCash;

    return { investments, cash, debt, liquidCash, shortCash, holdingsValue, lockedCash };
  }
  // ── Safe to Spend calculation ─────────────────────────────
  // "How much can I actually spend today without breaking anything?"
  // Cash on hand - upcoming fixed bills (14 days) - vault balances
  function calcSafeToSpend(state) {
    const accts  = state.accounts || {};
    const today  = new Date(); today.setHours(0,0,0,0);

    // Liquid cash = all bank accounts tagged 'immediate'
    // Fall back to all bank accounts if no tiers assigned yet
    const bank = accts.bank || [];
    const liquidAccts = bank.filter(a => a.liquidityTier === 'immediate');
    const cashOnHand  = (liquidAccts.length ? liquidAccts : bank)
      .reduce((s, a) => s + (Number(a.balance) || 0), 0);

    // Upcoming fixed bills due in next 14 days
    // Uses effectiveDate if present, otherwise treats as always-due
    const fixed = state.fixedMonthlyExpenses || [];
    const upcomingFixed = fixed.reduce((s, f) => {
      if (!f.effectiveDate) return s + (Number(f.amount) || 0);
      const eff = new Date(f.effectiveDate + 'T12:00:00');
      const diff = (eff - today) / 86400000;
      if (diff >= 0 && diff <= 14) return s + (Number(f.amount) || 0);
      return s;
    }, 0);

    // Total vault balances = money already allocated to goals
    const vaultTotal = (accts.vaults || [])
      .reduce((s, v) => s + (Number(v.balance) || 0), 0);

    const discretionary = cashOnHand - upcomingFixed - vaultTotal;

    return {
      cashOnHand,
      upcomingFixed,
      vaultTotal,
      discretionary
    };
  }



  // ── Safe to Spend card HTML ───────────────────────────────
  function buildSafeToSpendCard(state) {
    const { cashOnHand, upcomingFixed, vaultTotal, discretionary } = calcSafeToSpend(state);
    const cls    = discretionary >= 0 ? 'sts-positive' : 'sts-negative';
    const arrow  = discretionary >= 0 ? '✓' : '⚠';
    return `
      <div class="card sts-card ${cls}">
        <div class="sts-label">SAFE TO SPEND TODAY</div>
        <div class="sts-amount">${fmt(discretionary)}</div>
        <div class="sts-breakdown">
          <div class="sts-row">
            <span>💵 Cash on hand</span>
            <span class="sts-val">${fmt(cashOnHand)}</span>
          </div>
          <div class="sts-row sts-minus">
            <span>📋 Upcoming fixed bills</span>
            <span class="sts-val">− ${fmt(upcomingFixed)}</span>
          </div>
          <div class="sts-row sts-minus">
            <span>🏺 Allocated to vaults</span>
            <span class="sts-val">− ${fmt(vaultTotal)}</span>
          </div>
          <div class="sts-row sts-result">
            <span>\${arrow} Discretionary</span>
            <span class="sts-val">${fmt(discretionary)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Net Worth card with liquidity tiers (Step 8) ────────
  function buildNetWorthCard(state, investments, cash, debt, netWorth, nwClass) {
    const { liquidCash, shortCash, holdingsValue } = calcNetWorthComponents(state);
    const cardAlert = buildCardHealthAlert(state);
    return `
      <div class="card card--glow-cyan nw-card">
        <div class="nw-title">TOTAL NET WORTH</div>
        <div class="nw-total ${nwClass}">${fmt(netWorth)}</div>
        <div class="nw-tiers">
          <div class="nw-tier">
            <span class="nw-tier-icon">💵</span>
            <span class="nw-tier-label">Liquid (checking)</span>
            <span class="nw-tier-val">${fmt(liquidCash)}</span>
          </div>
          <div class="nw-tier">
            <span class="nw-tier-icon">🏦</span>
            <span class="nw-tier-label">Available (savings)</span>
            <span class="nw-tier-val">${fmt(shortCash)}</span>
          </div>
          <div class="nw-tier">
            <span class="nw-tier-icon">📈</span>
            <span class="nw-tier-label">Invested</span>
            <span class="nw-tier-val">${fmt(holdingsValue)}</span>
          </div>
          <div class="nw-tier nw-tier--debt">
            <span class="nw-tier-icon">💳</span>
            <span class="nw-tier-label">Less: card debt</span>
            <span class="nw-tier-val text-red">− ${fmt(debt)}</span>
          </div>
          <div class="nw-tier nw-tier--net">
            <span></span>
            <span class="nw-tier-label font-bold">Net Worth</span>
            <span class="nw-tier-val font-bold ${nwClass}">${fmt(netWorth)}</span>
          </div>
        </div>
        ${cardAlert}
      </div>
    `;
  }

  // ── Per-card health alert (Step 9) ────────────────────────
  // Surface on Dashboard if any card is at warning or danger utilization.
  function buildCardHealthAlert(state) {
    const cards = (state.accounts && state.accounts.cards) || [];
    const problem = cards.filter(c => {
      if (!c.limit || c.balance <= 0) return false;
      return (c.balance / c.limit) >= 0.30;
    });
    if (!problem.length) return '';
    const rows = problem.map(c => {
      const pct = (c.balance / c.limit) * 100;
      const icon = pct >= 50 ? '🚨' : '⚠️';
      return `<div class="ca-row"><span>${icon} ${c.name}</span><span class="font-mono">${pct.toFixed(0)}% used</span></div>`;
    }).join('');
    return `<div class="card-alert"><div class="ca-title">Credit Card Alerts</div>${rows}</div>`;
  }

  // ── Upcoming expense changes (Step 10) ──────────────────
  function buildUpcomingChanges(state) {
    const fixed = state.fixedMonthlyExpenses || [];
    const today = new Date(); today.setHours(0,0,0,0);
    const in30  = new Date(today); in30.setDate(in30.getDate() + 30);

    const upcoming = fixed.filter(f => {
      if (!f.effectiveDate) return false;
      const eff = new Date(f.effectiveDate + 'T12:00:00');
      return eff > today && eff <= in30;
    }).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

    if (!upcoming.length) return '';

    const rows = upcoming.map(f => {
      const d = new Date(f.effectiveDate + 'T12:00:00');
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="uc-row"><span>${label}: ${f.name}</span><span class="font-mono text-amber">${fmt(f.amount)}</span></div>`;
    }).join('');

    return `
      <div class="card">
        <div class="card-title">📅 Upcoming Changes</div>
        <div class="uc-list">${rows}</div>
      </div>
    `;
  }

  // ── HTML ──────────────────────────────────────────────────
  function buildHtml(state) {
    const { investments, cash, debt, liquidCash, shortCash, holdingsValue } = calcNetWorthComponents(state);
    const netWorth = investments + cash - debt;
    const nwClass  = netWorth >= 0 ? 'text-cyan' : 'text-red';

    // This month's spending
    const today      = App.Storage.toISODate(new Date());
    const monthKey   = today.slice(0, 7);
    const thisMonthTx = (state.transactions || []).filter(tx => tx.date.startsWith(monthKey));
    const monthSpend  = thisMonthTx.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

    // Last month spending
    const lm      = getPrevMonth(today);
    const lmKey   = lm.slice(0, 7);
    const lastMonthTx  = (state.transactions || []).filter(tx => tx.date.startsWith(lmKey));
    const lastMonthSpend = lastMonthTx.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
    const spendDelta = monthSpend - lastMonthSpend;
    const deltaClass = spendDelta <= 0 ? 'text-green' : 'text-red';

    // Month income = sum of paycheck amounts in this month
    const paydatesThisMonth = App.Storage.getPaydaysInMonth(state.income?.paydayDates || [], new Date().getFullYear(), new Date().getMonth() + 1);
    const savedPlan = (state.paychecks || {})[monthKey] || {};
    const monthIncome = paydatesThisMonth.reduce((s, _, i) => {
      const check = savedPlan[i + 1];
      return s + (check ? (Number(check.amount) || 0) : (state.income?.defaultPaycheckAmount || 0));
    }, 0);

    const yearOptions = buildYearOptions(state);

    return `
      <!-- Net worth hero card with liquidity tiers -->
      ${buildNetWorthCard(state, investments, cash, debt, netWorth, nwClass)}


      <!-- Safe to Spend card -->
      ${buildSafeToSpendCard(state)}

      <!-- Monthly summary -->
      <div class="card">
        <div class="section-title">This Month</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="stat-block">
            <div class="stat-block__label">Income</div>
            <div class="stat-block__value stat-block__value--cyan">${fmt0(monthIncome)}</div>
          </div>
          <div class="stat-block">
            <div class="stat-block__label">Spent</div>
            <div class="stat-block__value">${fmt0(monthSpend)}</div>
          </div>
          <div class="stat-block">
            <div class="stat-block__label">Net Savings</div>
            <div class="stat-block__value ${monthIncome - monthSpend >= 0 ? 'stat-block__value--green' : 'stat-block__value--red'}">
              ${fmt0(monthIncome - monthSpend)}
            </div>
          </div>
          <div class="stat-block">
            <div class="stat-block__label">vs Last Month</div>
            <div class="stat-block__value ${deltaClass}">
              ${spendDelta >= 0 ? '+' : ''}${fmt0(spendDelta)}
            </div>
          </div>
        </div>
      </div>


      <!-- Upcoming expense changes (Step 10) -->
      ${buildUpcomingChanges(state)}

      <!-- Year selector -->
      <div class="flex-between mb-8" style="margin-top:8px">
        <div class="section-title" style="margin:0">Charts</div>
        <select id="dash-year" style="width:100px;padding:6px 10px;min-height:36px">
          ${yearOptions}
        </select>
      </div>

      <!-- Chart containers -->
      <div class="card">
        <div class="card-title mb-12">Net Worth — 12 Months</div>
        <canvas id="chart-networth" height="180"></canvas>
      </div>

      <div class="card">
        <div class="card-title mb-12">Monthly Spending by Category</div>
        <canvas id="chart-spending" height="200"></canvas>
      </div>

      <div class="card">
        <div class="card-title mb-12">Investment Growth</div>
        <canvas id="chart-investments" height="180"></canvas>
      </div>

      <div class="card">
        <div class="card-title mb-12">Paycheck Performance</div>
        <canvas id="chart-perf" height="180"></canvas>
      </div>
    `;
  }

  // ── Load Chart.js from CDN ─────────────────────────────────
  function loadChartJs(callback) {
    if (window.Chart) { callback(); return; }
    const script = document.createElement('script');
    script.src   = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    script.onload  = callback;
    script.onerror = () => {
      document.querySelectorAll('canvas').forEach(c => {
        const p = c.parentElement;
        if (p) p.innerHTML += '<p class="text-secondary text-xs mt-8">Chart unavailable offline. Connect to internet once to cache.</p>';
      });
    };
    document.head.appendChild(script);
  }

  // ── Draw all charts ────────────────────────────────────────
  function drawCharts(state) {
    // Destroy any existing chart instances first
    _charts.forEach(c => { try { c.destroy(); } catch (_) {} });
    _charts = [];

    const nwCanvas   = document.getElementById('chart-networth');
    const spCanvas   = document.getElementById('chart-spending');
    const invCanvas  = document.getElementById('chart-investments');
    const perfCanvas = document.getElementById('chart-perf');

    const defaults = {
      responsive: true,
      plugins: { legend: { labels: { color: '#8b95a8', font: { size: 11 } } } }
    };

    const gridColor = 'rgba(42,51,70,0.8)';
    const tickColor = '#5a6478';

    const axisDefaults = {
      grid:  { color: gridColor },
      ticks: { color: tickColor, font: { size: 10 } }
    };

    // ── Chart 1: Net Worth History ─────────────────────────
    if (nwCanvas) {
      const history = (state.netWorthHistory || []).slice(-13);
      const labels  = history.map(h => h.date.slice(0, 7));
      const nwData  = history.map(h => h.netWorth);
      _charts.push(new window.Chart(nwCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Net Worth',
            data:  nwData,
            borderColor:     '#00f0ff',
            backgroundColor: 'rgba(0,240,255,0.08)',
            pointBackgroundColor: '#00f0ff',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          ...defaults,
          scales: { x: axisDefaults, y: { ...axisDefaults, ticks: { ...axisDefaults.ticks, callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } } }
        }
      }));
    }

    // ── Chart 2: Monthly Spending by Category ──────────────
    if (spCanvas) {
      const txs   = (state.transactions || []).filter(tx => tx.date.startsWith(String(_viewYear)));
      const cats  = state.yearlyCategories || [];
      const labels = cats.map(c => c.name);
      const data   = cats.map(c =>
        txs.filter(tx => tx.categoryId === c.id).reduce((s, tx) => s + (Number(tx.amount) || 0), 0)
      );
      // Only show categories with spend > 0 to avoid clutter
      const filtered = labels.map((l, i) => ({ label: l, value: data[i] })).filter(x => x.value > 0);
      const neonColors = ['#00f0ff','#ff00ea','#00ff88','#ffb000','#ff3860','#a78bfa','#38bdf8','#fb923c','#4ade80','#f472b6'];

      _charts.push(new window.Chart(spCanvas, {
        type: 'bar',
        data: {
          labels:   filtered.map(x => x.label),
          datasets: [{
            label: `${_viewYear} Spending`,
            data:  filtered.map(x => x.value),
            backgroundColor: filtered.map((_, i) => neonColors[i % neonColors.length] + '99'),
            borderColor:     filtered.map((_, i) => neonColors[i % neonColors.length]),
            borderWidth: 1
          }]
        },
        options: {
          ...defaults,
          indexAxis: 'y',
          scales: { x: { ...axisDefaults, ticks: { ...axisDefaults.ticks, callback: v => '$' + v } }, y: axisDefaults },
          plugins: { ...defaults.plugins, legend: { display: false } }
        }
      }));
    }

    // ── Chart 3: Investment Growth ─────────────────────────
    if (invCanvas) {
      const history  = (state.netWorthHistory || []).slice(-13);
      const labels   = history.map(h => h.date.slice(0, 7));
      const invData  = history.map(h => h.investments || 0);
      _charts.push(new window.Chart(invCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Investments',
            data:  invData,
            borderColor:     '#ff00ea',
            backgroundColor: 'rgba(255,0,234,0.08)',
            pointBackgroundColor: '#ff00ea',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          ...defaults,
          scales: { x: axisDefaults, y: { ...axisDefaults, ticks: { ...axisDefaults.ticks, callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } } }
        }
      }));
    }

    // ── Chart 4: Paycheck Performance (planned vs actual) ──
    if (perfCanvas) {
      const paydates = state.income?.paydayDates || [];
      const ppy      = paydates.length;
      // Build period data (reuse tracker logic)
      const periods  = paydates.slice(0, 26).map((startDate, idx) => {
        const endDate  = paydates[idx + 1] ? offsetDate(paydates[idx + 1], -1) : '9999-12-31';
        const actual   = (state.transactions || [])
          .filter(tx => tx.date >= startDate && tx.date <= endDate)
          .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
        const ppy2 = state.income?.paychecksPerYear || 26;
        const planned = (state.yearlyCategories || []).reduce((s, c) => s + (c.annualGoal / ppy2), 0);
        return { label: `P${idx + 1}`, planned: Math.round(planned), actual: Math.round(actual) };
      }).filter(p => p.actual > 0); // only periods with data

      _charts.push(new window.Chart(perfCanvas, {
        type: 'bar',
        data: {
          labels: periods.map(p => p.label),
          datasets: [
            { label: 'Planned', data: periods.map(p => p.planned), backgroundColor: 'rgba(0,240,255,0.3)', borderColor: '#00f0ff', borderWidth: 1 },
            { label: 'Actual',  data: periods.map(p => p.actual),  backgroundColor: 'rgba(255,0,234,0.3)', borderColor: '#ff00ea', borderWidth: 1 }
          ]
        },
        options: {
          ...defaults,
          scales: { x: axisDefaults, y: { ...axisDefaults, ticks: { ...axisDefaults.ticks, callback: v => '$' + v } } }
        }
      }));
    }

    // Year select wiring
    const yearSel = document.getElementById('dash-year');
    if (yearSel) {
      yearSel.value = String(_viewYear);
      yearSel.addEventListener('change', () => {
        _viewYear = parseInt(yearSel.value, 10);
        App.refreshCurrentTab();
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  function getPrevMonth(isoDate) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setMonth(d.getMonth() - 1);
    return App.Storage.toISODate(d);
  }

  function buildYearOptions(state) {
    const txYears = [...new Set((state.transactions || []).map(tx => tx.date.slice(0, 4)).filter(Boolean))];
    const years   = [...new Set([...txYears, String(new Date().getFullYear())])].sort().reverse();
    return years.map(y => `<option value="${y}" ${y === String(_viewYear) ? 'selected' : ''}>${y}</option>`).join('');
  }

  function offsetDate(isoStr, days) {
    const parts = isoStr.split('-').map(Number);
    const d     = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + days);
    return App.Storage.toISODate(d);
  }

  App.Dashboard = { render };

})(window.App = window.App || {});
