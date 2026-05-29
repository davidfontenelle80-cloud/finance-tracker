/* ══════════════════════════════════════════════════════════════
   TRACKER.JS — 26-Period Paycheck Tracker
   Phase 3: Editable savings ledger.
   - Enter actual amount saved per pay period
   - Rank by savings (1 = most saved)
   - Variance vs expected pace
   - YTD by category (spending breakdown)
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const fmt  = function(n) { return App.Storage.formatCurrency(n); };
  const fmt0 = function(n) { return App.Storage.formatCurrency(n, false); };

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(state, container);
  }

  // ── Main HTML ─────────────────────────────────────────────
  function buildHtml(state) {
    var dates = (state.income && state.income.paydayDates) || [];
    if (!dates.length) {
      return '<div class="stub-container">' +
        '<div class="stub-icon">📅</div>' +
        '<h2>No Payday Dates</h2>' +
        '<p>Set your first payday in the <strong>Setup</strong> tab to populate the tracker.</p>' +
        '</div>';
    }

    var periods = buildPeriods(state, dates);
    var ranked  = rankPeriods(periods, state);
    var today   = App.Storage.toISODate(new Date());

    // YTD summary
    var completed = ranked.filter(function(p) { return p.startDate <= today && p.hasEntry; });
    var totalSaved    = completed.reduce(function(s, p) { return s + p.saved; }, 0);
    var totalExpected = completed.reduce(function(s, p) { return s + p.expectedPerCheck; }, 0);
    var ytdDelta      = totalSaved - totalExpected;
    var deltaClass    = ytdDelta >= 0 ? 'text-green' : 'text-red';
    var deltaLabel    = ytdDelta >= 0 ? 'Ahead of Pace' : 'Behind Pace';

    // Table rows
    var rows = ranked.map(function(p) {
      var isFuture  = p.startDate > today;
      var isCurrent = !isFuture && (!p.endDate || p.endDate >= today);
      var rowStyle  = isCurrent ? ' style="background:rgba(0,240,255,0.04)"' : '';

      var deltaClass2 = p.delta >= 0 ? 'text-green' : 'text-red';
      var rankClass   = p.rank === 0 ? 'text-dim' :
                        p.rank <= 5 ? 'text-green' :
                        p.rank >= (completed.length - 4) && p.rank !== 0 ? 'text-red' : 'text-secondary';

      // Editable saved-amount cell
      var savedCell;
      if (isFuture) {
        savedCell = '<td class="font-mono text-right text-dim">—</td>';
      } else {
        var entryVal = p.saved > 0 ? p.saved.toFixed(2) : '';
        savedCell = '<td class="font-mono text-right tracker-saved-cell">' +
          '<input type="number" class="tracker-amount-input" min="0" step="0.01" ' +
          'placeholder="0.00" value="' + entryVal + '" ' +
          'data-action="tracker-entry" data-idx="' + p.idx + '" />' +
          '</td>';
      }

      return '<tr' + rowStyle + '>' +
        '<td class="text-center font-bold text-secondary">' + p.period + '</td>' +
        '<td class="text-sm">' + p.startDate +
          (isCurrent ? ' <span class="badge badge--cyan" style="font-size:0.58rem">now</span>' : '') +
        '</td>' +
        savedCell +
        '<td class="font-mono text-right text-dim">' + (isFuture ? '—' : fmt0(p.expectedPerCheck)) + '</td>' +
        '<td class="font-mono text-right ' + (isFuture || !p.hasEntry ? 'text-dim' : deltaClass2) + '">' +
          (isFuture || !p.hasEntry ? '—' : (p.delta >= 0 ? '+' : '') + fmt0(p.delta)) +
        '</td>' +
        '<td class="text-center ' + rankClass + '">' + (isFuture || !p.hasEntry ? '—' : p.rank) + '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<!-- YTD summary banner -->' +
      '<div class="card card--glow-cyan mb-16" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">' +
        '<div>' +
          '<div class="text-xs text-secondary font-bold" style="text-transform:uppercase;letter-spacing:0.06em">YTD Saved</div>' +
          '<div class="font-mono font-heavy text-cyan" style="font-size:1.05rem;margin-top:4px">' + fmt0(totalSaved) + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="text-xs text-secondary font-bold" style="text-transform:uppercase;letter-spacing:0.06em">Expected Pace</div>' +
          '<div class="font-mono font-heavy" style="font-size:1.05rem;margin-top:4px">' + fmt0(totalExpected) + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="text-xs text-secondary font-bold" style="text-transform:uppercase;letter-spacing:0.06em">' + deltaLabel + '</div>' +
          '<div class="font-mono font-heavy ' + deltaClass + '" style="font-size:1.05rem;margin-top:4px">' +
            (ytdDelta >= 0 ? '+' : '') + fmt0(ytdDelta) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Save hint -->' +
      '<p class="text-secondary text-xs mb-8" style="text-align:center">Enter the amount saved each paycheck — Tab or Enter to save, ranked automatically.</p>' +

      '<!-- 26-period ledger -->' +
      '<div class="card" style="padding:0;overflow-x:auto">' +
        '<table class="data-table">' +
          '<thead>' +
            '<tr>' +
              '<th style="text-align:center">#</th>' +
              '<th>Pay Date</th>' +
              '<th style="text-align:right">Saved</th>' +
              '<th style="text-align:right">Expected</th>' +
              '<th style="text-align:right">+/−</th>' +
              '<th style="text-align:center" title="Rank by savings (1 = most saved)">Rank</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +

      '<!-- YTD by category -->' +
      renderCategoryYTD(state);
  }

  // ── Build period data ─────────────────────────────────────
  function buildPeriods(state, dates) {
    var entries         = state.trackerEntries || {};
    var ppy             = state.income && state.income.paychecksPerYear ? state.income.paychecksPerYear : 26;
    var annualGoalTotal = (state.yearlyCategories || []).reduce(function(s, c) { return s + (c.annualGoal || 0); }, 0);
    var expectedPerCheck = round2(annualGoalTotal / ppy);

    return dates.map(function(startDate, idx) {
      var endDate = dates[idx + 1] ? offsetDate(dates[idx + 1], -1) : '9999-12-31';
      var entry   = entries[String(idx)] || {};
      var saved   = Number(entry.amount) || 0;
      var hasEntry = entry.amount !== undefined && entry.amount !== null && entry.amount !== '';

      return {
        idx:              idx,
        period:           idx + 1,
        startDate:        startDate,
        endDate:          endDate,
        saved:            saved,
        hasEntry:         hasEntry,
        expectedPerCheck: expectedPerCheck,
        delta:            saved - expectedPerCheck,
        rank:             0  // filled by rankPeriods
      };
    });
  }

  // Rank by savings desc (most saved = rank 1)
  function rankPeriods(periods, state) {
    var today    = App.Storage.toISODate(new Date());
    var withData = periods.filter(function(p) { return p.startDate <= today && p.hasEntry; });
    var sorted   = withData.slice().sort(function(a, b) { return b.saved - a.saved; });
    sorted.forEach(function(p, i) { p.rank = i + 1; });
    return periods;
  }

  // ── Wire events ───────────────────────────────────────────
  function wireEvents(state, container) {
    container.querySelectorAll('.tracker-amount-input').forEach(function(input) {
      function saveEntry() {
        var idx = input.dataset.idx;
        var val = input.value.trim();
        var ns  = App.Storage.cloneState(App.getState());
        if (!ns.trackerEntries) ns.trackerEntries = {};
        if (val === '') {
          delete ns.trackerEntries[idx];
        } else {
          ns.trackerEntries[idx] = { amount: parseFloat(val) || 0 };
        }
        App.setState(ns);
        App.refreshCurrentTab();
      }

      input.addEventListener('blur', saveEntry);
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          saveEntry();
        }
      });
    });
  }

  // ── YTD by category ───────────────────────────────────────
  function renderCategoryYTD(state) {
    var cats = state.yearlyCategories || [];
    if (!cats.length) return '';

    var txs = state.transactions || [];
    var now = App.Storage.toISODate(new Date());

    var pastDates  = (state.income && state.income.paydayDates || []).filter(function(d) { return d <= now; });
    var pastChecks  = pastDates.length;
    var totalChecks = (state.income && state.income.paychecksPerYear) || 26;

    var rows = cats.map(function(cat) {
      var ytdSpent = txs
        .filter(function(tx) { return tx.categoryId === cat.id; })
        .reduce(function(s, tx) { return s + (Number(tx.amount) || 0); }, 0);

      var annualGoal  = cat.annualGoal || 0;
      var remaining   = annualGoal - ytdSpent;
      var paceTarget  = pastChecks > 0 ? (annualGoal / totalChecks) * pastChecks : 0;
      var paceRatio   = paceTarget > 0 ? ytdSpent / paceTarget : 0;
      var paceClass   = paceRatio > 1.1 ? 'red' : paceRatio > 0.9 ? 'amber' : 'green';
      var pctOfAnnual = annualGoal > 0 ? Math.min(100, (ytdSpent / annualGoal) * 100) : 0;

      return '<tr>' +
        '<td class="font-bold text-sm">' + esc(cat.name) + '</td>' +
        '<td class="font-mono text-right">' + fmt0(annualGoal) + '</td>' +
        '<td class="font-mono text-right">' + fmt0(ytdSpent) + '</td>' +
        '<td class="font-mono text-right text-' + (remaining >= 0 ? 'green' : 'red') + '">' + fmt0(remaining) + '</td>' +
        '<td style="min-width:80px">' +
          '<div class="progress-bar">' +
            '<div class="progress-bar__fill progress-bar__fill--' + paceClass + '" style="width:' + pctOfAnnual.toFixed(1) + '%"></div>' +
          '</div>' +
          '<div class="text-xs text-' + paceClass + '" style="margin-top:2px">' + pctOfAnnual.toFixed(0) + '%</div>' +
        '</td>' +
        '</tr>';
    }).join('');

    return '<div class="card" style="padding:0;overflow-x:auto;margin-top:16px">' +
      '<div style="padding:14px 16px 0">' +
        '<div class="section-title">YTD by Category</div>' +
        '<div class="text-secondary text-xs mb-8">' + pastChecks + ' of ' + totalChecks + ' paychecks elapsed</div>' +

        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  // ── Wire events ───────────────────────────────────────────
  function wireEvents(state, container) {
    container.querySelectorAll('.tracker-amount-input').forEach(function(input) {
      function saveEntry() {
        var idx = input.dataset.idx;
        var val = input.value.trim();
        var ns  = App.Storage.cloneState(App.getState());
        if (!ns.trackerEntries) ns.trackerEntries = {};
        if (val === '') {
          delete ns.trackerEntries[idx];
        } else {
          ns.trackerEntries[idx] = { amount: parseFloat(val) || 0 };
        }
        App.setState(ns);
        App.refreshCurrentTab();
      }
      input.addEventListener('blur', saveEntry);
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === 'Tab') { saveEntry(); }
      });
    });
  }

  // ── YTD by category ───────────────────────────────────────
  function renderCategoryYTD(state) {
    var cats = state.yearlyCategories || [];
    if (!cats.length) return '';

    var txs = state.transactions || [];
    var now = App.Storage.toISODate(new Date());

    var pastDates   = ((state.income && state.income.paydayDates) || []).filter(function(d) { return d <= now; });
    var pastChecks  = pastDates.length;
    var totalChecks = (state.income && state.income.paychecksPerYear) || 26;

    var rows = cats.map(function(cat) {
      var ytdSpent = txs
        .filter(function(tx) { return tx.categoryId === cat.id; })
        .reduce(function(s, tx) { return s + (Number(tx.amount) || 0); }, 0);

      var annualGoal  = cat.annualGoal || 0;
      var remaining   = annualGoal - ytdSpent;
      var paceTarget  = pastChecks > 0 ? (annualGoal / totalChecks) * pastChecks : 0;
      var paceRatio   = paceTarget > 0 ? ytdSpent / paceTarget : 0;
      var paceClass   = paceRatio > 1.1 ? 'red' : paceRatio > 0.9 ? 'amber' : 'green';
      var pctOfAnnual = annualGoal > 0 ? Math.min(100, (ytdSpent / annualGoal) * 100) : 0;

      return '<tr>' +
        '<td class="font-bold text-sm">' + esc(cat.name) + '</td>' +
        '<td class="font-mono text-right">' + fmt0(annualGoal) + '</td>' +
        '<td class="font-mono text-right">' + fmt0(ytdSpent) + '</td>' +
        '<td class="font-mono text-right text-' + (remaining >= 0 ? 'green' : 'red') + '">' + fmt0(remaining) + '</td>' +
        '<td style="min-width:80px">' +
          '<div class="progress-bar">' +
            '<div class="progress-bar__fill progress-bar__fill--' + paceClass + '" style="width:' + pctOfAnnual.toFixed(1) + '%"></div>' +
          '</div>' +
          '<div class="text-xs text-' + paceClass + '" style="margin-top:2px">' + pctOfAnnual.toFixed(0) + '%</div>' +
        '</td>' +
        '</tr>';
    }).join('');

    return '<div class="card" style="padding:0;overflow-x:auto;margin-top:16px">' +
      '<div style="padding:14px 16px 0">' +
        '<div class="section-title">YTD by Category</div>' +
        '<div class="text-secondary text-xs mb-8">' + pastChecks + ' of ' + totalChecks + ' paychecks elapsed</div>' +
      '</div>' +
      '<table class="data-table">' +
        '<thead>' +
          '<tr>' +
            '<th>Category</th>' +
            '<th style="text-align:right">Annual Goal</th>' +
            '<th style="text-align:right">YTD Spent</th>' +
            '<th style="text-align:right">Remaining</th>' +
            '<th>% of Year</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  // ── Helpers ───────────────────────────────────────────────
  function offsetDate(isoStr, days) {
    var parts = isoStr.split('-').map(Number);
    var d     = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + days);
    return App.Storage.toISODate(d);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  App.Tracker = { render: render };

})(window.App = window.App || {});
