/* ══════════════════════════════════════════════════════════════
   TRACKER.JS — 26-Period Paycheck Tracker
   Tab 3: Full-year view of all 26 bi-weekly pay periods.
   Shows planned vs actual spending per period.
   Ranks periods by performance (lowest over-budget = rank 1).
   Bottom section: YTD by category.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const fmt  = (n) => App.Storage.formatCurrency(n);
  const fmt0 = (n) => App.Storage.formatCurrency(n, false); // no cents

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
  }

  // ── HTML builder ──────────────────────────────────────────
  function buildHtml(state) {
    const dates = state.income?.paydayDates || [];
    if (!dates.length) {
      return `<div class="stub-container">
        <div class="stub-icon">📅</div>
        <h2>No Payday Dates</h2>
        <p>Set your first payday in the <strong>Setup</strong> tab to populate the tracker.</p>
      </div>`;
    }

    const periods  = buildPeriods(state, dates);
    const ranked   = rankPeriods(periods);
    const today    = App.Storage.toISODate(new Date());

    // Table rows
    const rows = ranked.map(p => {
      const isFuture  = p.startDate > today;
      const isCurrent = !isFuture && (p.endDate >= today || !p.endDate);
      const rowClass  = isCurrent ? 'style="background:rgba(0,240,255,0.04)"' : '';
      const overClass = p.overUnder >= 0 ? 'text-green' : 'text-red';
      const pctStr    = p.planned > 0
        ? `${((p.actual / p.planned) * 100).toFixed(0)}%`
        : '—';
      const rankColor = p.rank <= 5 ? 'green' : p.rank >= 22 ? 'red' : '';
      const rankClass = rankColor ? `text-${rankColor}` : 'text-secondary';

      return `
        <tr ${rowClass}>
          <td class="text-center font-bold text-secondary">${p.period}</td>
          <td class="text-sm">${p.startDate}${isCurrent ? ' <span class="badge badge--cyan" style="font-size:0.58rem">now</span>' : ''}</td>
          <td class="font-mono text-right">${isFuture ? '<span class="text-dim">—</span>' : fmt0(p.planned)}</td>
          <td class="font-mono text-right">${isFuture ? '<span class="text-dim">—</span>' : fmt0(p.actual)}</td>
          <td class="font-mono text-right ${overClass}">
            ${isFuture ? '<span class="text-dim">—</span>' : (p.overUnder >= 0 ? '+' : '') + fmt0(p.overUnder)}
          </td>
          <td class="text-center ${rankClass}">${isFuture ? '—' : p.rank}</td>
        </tr>`;
    }).join('');

    // Summary stats for completed periods
    const completed = ranked.filter(p => p.startDate <= today && p.actual > 0);
    const totalPlanned = completed.reduce((s, p) => s + p.planned, 0);
    const totalActual  = completed.reduce((s, p) => s + p.actual,  0);
    const totalDelta   = totalActual - totalPlanned;
    const deltaClass   = totalDelta <= 0 ? 'text-green' : 'text-red';
    const deltaLabel   = totalDelta <= 0 ? 'Under budget' : 'Over budget';

    return `
      <!-- YTD summary banner -->
      <div class="card card--glow-cyan mb-16" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
        <div>
          <div class="text-xs text-secondary font-bold" style="text-transform:uppercase;letter-spacing:0.06em">YTD Planned</div>
          <div class="font-mono font-heavy text-cyan" style="font-size:1.05rem;margin-top:4px">${fmt0(totalPlanned)}</div>
        </div>
        <div>
          <div class="text-xs text-secondary font-bold" style="text-transform:uppercase;letter-spacing:0.06em">YTD Actual</div>
          <div class="font-mono font-heavy" style="font-size:1.05rem;margin-top:4px">${fmt0(totalActual)}</div>
        </div>
        <div>
          <div class="text-xs text-secondary font-bold" style="text-transform:uppercase;letter-spacing:0.06em">${deltaLabel}</div>
          <div class="font-mono font-heavy ${deltaClass}" style="font-size:1.05rem;margin-top:4px">${fmt0(Math.abs(totalDelta))}</div>
        </div>
      </div>

      <!-- 26-period table -->
      <div class="card" style="padding:0;overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th style="text-align:center">#</th>
              <th>Pay Date</th>
              <th style="text-align:right">Planned</th>
              <th style="text-align:right">Actual</th>
              <th style="text-align:right">+/−</th>
              <th style="text-align:center" title="Performance rank (1 = best)">Rank</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <!-- YTD by category -->
      ${renderCategoryYTD(state)}
    `;
  }

  // ── Build period data ─────────────────────────────────────
  // Returns array of period objects with planned and actual amounts
  function buildPeriods(state, dates) {
    return dates.map((startDate, idx) => {
      const endDate = dates[idx + 1]
        ? offsetDate(dates[idx + 1], -1)  // day before next payday
        : '9999-12-31';                    // last period goes to end of year

      // Planned = saved paycheck plan for the month this date falls in
      const [y, m] = startDate.split('-').map(Number);
      const key     = `${y}-${String(m).padStart(2, '0')}`;
      // Which paycheck number within the month is this?
      const paydatesInMonth = App.Storage.getPaydaysInMonth(dates, y, m);
      const checkNum        = paydatesInMonth.indexOf(startDate) + 1;
      const savedCheck      = state.paychecks?.[key]?.[checkNum];
      const planned         = savedCheck
        ? sumCheck(savedCheck)
        : defaultPlanned(state);

      // Actual = sum of transactions in [startDate, endDate]
      const actual = (state.transactions || [])
        .filter(tx => tx.date >= startDate && tx.date <= endDate)
        .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

      return {
        period:    idx + 1,
        startDate,
        endDate,
        planned,
        actual,
        overUnder: actual - planned  // negative = under (good), positive = over (bad)
      };
    });
  }

  // Rank periods: rank 1 = best performance (most under budget)
  // Only rank periods that have actual data; future periods get rank 0
  function rankPeriods(periods) {
    const withData = periods.filter(p => p.actual > 0);
    // Sort by overUnder ascending (most negative = most under = best)
    const sorted = [...withData].sort((a, b) => a.overUnder - b.overUnder);
    sorted.forEach((p, i) => { p.rank = i + 1; });
    // Future / empty periods: rank = '—' handled in template
    periods.forEach(p => { if (p.actual === 0) p.rank = 0; });
    return periods;
  }

  // ── YTD by category ───────────────────────────────────────
  function renderCategoryYTD(state) {
    const cats = state.yearlyCategories || [];
    if (!cats.length) return '';

    const txs = state.transactions || [];
    const now = App.Storage.toISODate(new Date());

    // Figure out how many paychecks have passed so far this year
    const pastDates  = (state.income?.paydayDates || []).filter(d => d <= now);
    const pastChecks = pastDates.length;
    const totalChecks = state.income?.paychecksPerYear || 26;

    const rows = cats.map(cat => {
      const ytdSpent = txs
        .filter(tx => tx.categoryId === cat.id)
        .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

      const annualGoal   = cat.annualGoal || 0;
      const remaining    = annualGoal - ytdSpent;
      const paceTarget   = pastChecks > 0
        ? (annualGoal / totalChecks) * pastChecks
        : 0;
      const paceRatio    = paceTarget > 0 ? ytdSpent / paceTarget : 0;
      const paceClass    = paceRatio > 1.1 ? 'red' : paceRatio > 0.9 ? 'amber' : 'green';
      const pctOfAnnual  = annualGoal > 0 ? Math.min(100, (ytdSpent / annualGoal) * 100) : 0;

      return `
        <tr>
          <td class="font-bold text-sm">${esc(cat.name)}</td>
          <td class="font-mono text-right">${fmt0(annualGoal)}</td>
          <td class="font-mono text-right">${fmt0(ytdSpent)}</td>
          <td class="font-mono text-right text-${remaining >= 0 ? 'green' : 'red'}">${fmt0(remaining)}</td>
          <td style="min-width:80px">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--${paceClass}" style="width:${pctOfAnnual.toFixed(1)}%"></div>
            </div>
            <div class="text-xs text-${paceClass}" style="margin-top:2px">${pctOfAnnual.toFixed(0)}%</div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card" style="padding:0;overflow-x:auto;margin-top:16px">
        <div style="padding:14px 16px 0">
          <div class="section-title">YTD by Category</div>
          <div class="text-secondary text-xs mb-8">${pastChecks} of ${totalChecks} paychecks elapsed</div>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th style="text-align:right">Annual Goal</th>
              <th style="text-align:right">YTD Spent</th>
              <th style="text-align:right">Remaining</th>
              <th>% of Year</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ── Helpers ───────────────────────────────────────────────
  // Sum all allocated amounts in a saved paycheck
  function sumCheck(check) {
    const c = (check.categories  || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const f = (check.fixed       || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const u = (check.customItems || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return c + f + u;
  }

  // Fallback planned amount when no saved plan exists for a period
  function defaultPlanned(state) {
    const ppy  = state.income?.paychecksPerYear || 26;
    const cats = (state.yearlyCategories || []).reduce((s, c) => s + (c.annualGoal / ppy), 0);
    const fixed = (state.fixedMonthlyExpenses || []).reduce((s, f) => s + f.amount, 0);
    // Fixed per paycheck ≈ half of monthly fixed (for a 2-paycheck month baseline)
    return cats + (fixed / 2);
  }

  // Subtract N days from an ISO date string
  function offsetDate(isoStr, days) {
    const parts = isoStr.split('-').map(Number);
    const d     = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + days);
    return App.Storage.toISODate(d);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.Tracker = { render };

})(window.App = window.App || {});
