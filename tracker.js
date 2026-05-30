/* ═══════════════════════════════════════════════════════════
   TRACKER.JS -- 26-Period Paycheck Tracker
   Phase 3: Editable savings ledger.
   Phase 4: Savings Plan (26-period simulation) + Savings Challenge.
═══════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function(k) { return App.Lang ? App.Lang.t(k) : k; };
  var fmt  = function(n) { return App.Storage.formatCurrency(n); };
  var fmt0 = function(n) { return App.Storage.formatCurrency(n, false); };

  // -- Entry point -------------------------------------------------------
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(state, container);
  }

  // -- Main HTML ---------------------------------------------------------
  function buildHtml(state) {
    var dates = (state.income && state.income.paydayDates) || [];
    if (!dates.length) {
      return '<div class="stub-container">' +
        '<div class="stub-icon">&#128197;</div>' +
        '<h2>No Payday Dates</h2>' +
        '<p>Set your first payday in the <strong>Setup</strong> tab to populate the tracker.</p>' +
        '</div>';
    }

    var periods = buildPeriods(state, dates);
    var ranked  = rankPeriods(periods, state);
    var today   = App.Storage.toISODate(new Date());

    // YTD summary
    var completed     = ranked.filter(function(p) { return p.startDate <= today && p.hasEntry; });
    var totalSaved    = completed.reduce(function(s, p) { return s + p.saved; }, 0);
    var totalExpected = completed.reduce(function(s, p) { return s + p.expectedPerCheck; }, 0);
    var ytdDelta      = totalSaved - totalExpected;
    var deltaClass    = ytdDelta >= 0 ? 'text-green' : 'text-red';
    var deltaLabel    = ytdDelta >= 0 ? t('track.aheadOfPace') : t('track.behindPace');

    // Table rows
    var rows = ranked.map(function(p) {
      var isFuture  = p.startDate > today;
      var isCurrent = !isFuture && (!p.endDate || p.endDate >= today);
      var rowStyle  = isCurrent ? ' style="background:rgba(0,240,255,0.04)"' : '';

      var deltaClass2 = p.delta >= 0 ? 'text-green' : 'text-red';
      var rankClass   = p.rank === 0 ? 'text-dim' :
                        p.rank <= 5 ? 'text-green' :
                        p.rank >= (completed.length - 4) && p.rank !== 0 ? 'text-red' : 'text-secondary';

      var savedCell;
      if (isFuture) {
        savedCell = '<td class="font-mono text-right text-dim">&#8212;</td>';
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
        '<td class="font-mono text-right text-dim">' + (isFuture ? '&#8212;' : fmt0(p.expectedPerCheck)) + '</td>' +
        '<td class="font-mono text-right ' + (isFuture || !p.hasEntry ? 'text-dim' : deltaClass2) + '">' +
          (isFuture || !p.hasEntry ? '&#8212;' : (p.delta >= 0 ? '+' : '') + fmt0(p.delta)) +
        '</td>' +
        '<td class="text-center ' + rankClass + '">' + (isFuture || !p.hasEntry ? '&#8212;' : p.rank) + '</td>' +
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
      '<p class="text-secondary text-xs mb-8" style="text-align:center">Enter the amount saved each paycheck -- Tab or Enter to save, ranked automatically.</p>' +

      '<!-- 26-period ledger -->' +
      '<div class="card" style="padding:0;overflow-x:auto">' +
        '<table class="data-table">' +
          '<thead>' +
            '<tr>' +
              '<th style="text-align:center">#</th>' +
              '<th>Pay Date</th>' +
              '<th style="text-align:right">Saved</th>' +
              '<th style="text-align:right">Expected</th>' +
              '<th style="text-align:right">+/-</th>' +
              '<th style="text-align:center" title="Rank by savings (1 = most saved)">Rank</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +

      '<!-- YTD by category -->' +
      renderCategoryYTD(state) +

      '<!-- Savings Plan: 26-period simulation -->' +
      renderSavingsPlan(state, ranked) +

      '<!-- Savings Challenge: next year planning -->' +
      renderSavingsChallenge(state);
  }

  // -- Build period data ------------------------------------------------
  function buildPeriods(state, dates) {
    var entries          = state.trackerEntries || {};
    var ppy              = state.income && state.income.paychecksPerYear ? state.income.paychecksPerYear : 26;
    var annualGoalTotal  = (state.yearlyCategories || []).reduce(function(s, c) { return s + (c.annualGoal || 0); }, 0);
    var expectedPerCheck = round2(annualGoalTotal / ppy);

    return dates.map(function(startDate, idx) {
      var endDate  = dates[idx + 1] ? offsetDate(dates[idx + 1], -1) : '9999-12-31';
      var entry    = entries[String(idx)] || {};
      var saved    = Number(entry.amount) || 0;
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
        rank:             0
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

  // -- Wire events ------------------------------------------------------
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

  // -- YTD by category --------------------------------------------------
  function renderCategoryYTD(state) {
    var cats = state.yearlyCategories || [];
    if (!cats.length) return '';

    var txs = state.transactions || [];
    var now = App.Storage.toISODate(new Date());

    var pastDates   = ((state.income && state.income.paydayDates) || []).filter(function(d) { return d <= now; });
    var pastChecks  = pastDates.length;
    var totalChecks = (state.income && state.income.paychecksPerYear) || 26;

    var rows = cats.map(function(cat) {
      var ytdSpent    = txs
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

  // -- Savings Plan: year-end projection (Phase 4C) ---------------------
  function renderSavingsPlan(state, periods) {
    var cats = state.yearlyCategories || [];
    if (!cats.length) return '';

    var ppy      = (state.income && state.income.paychecksPerYear) || 26;
    var entries  = state.trackerEntries || {};
    var today    = App.Storage.toISODate(new Date());
    var dates    = (state.income && state.income.paydayDates) || [];

    var totalSaved = 0, periodsWithData = 0;
    dates.forEach(function(d, idx) {
      if (d <= today) {
        var e = entries[String(idx)] || {};
        if (e.amount !== undefined && e.amount !== '') {
          totalSaved += Number(e.amount) || 0;
          periodsWithData++;
        }
      }
    });

    var periodsLeft    = ppy - periodsWithData;
    var avgSaved       = periodsWithData > 0 ? round2(totalSaved / periodsWithData) : 0;
    var projectedYTD   = round2(totalSaved + avgSaved * periodsLeft);
    var annualTotal    = cats.reduce(function(s, c) { return s + (c.annualGoal || 0); }, 0);
    var shortfall      = round2(annualTotal - projectedYTD);
    var projClass      = shortfall <= 0 ? 'text-green' : 'text-red';
    var expectedPerChk = periods.length ? periods[0].expectedPerCheck : 0;

    var catRows = cats.map(function(cat) {
      var perCheck  = round2((cat.annualGoal || 0) / ppy);
      var projected = annualTotal > 0 ? round2(projectedYTD * ((cat.annualGoal || 0) / annualTotal)) : 0;
      var pct       = cat.annualGoal > 0 ? Math.min(100, (projected / cat.annualGoal) * 100) : 0;
      var barColor  = pct >= 95 ? 'green' : pct >= 70 ? 'amber' : 'red';
      var onTrack   = projected >= (cat.annualGoal || 0);
      return '<tr>' +
        '<td class="text-sm font-bold">' + esc(cat.name) + '</td>' +
        '<td class="font-mono text-right text-dim">' + fmt0(perCheck) + '</td>' +
        '<td class="font-mono text-right">' + fmt0(projected) + '</td>' +
        '<td class="font-mono text-right text-dim">' + fmt0(cat.annualGoal || 0) + '</td>' +
        '<td style="min-width:80px">' +
          '<div class="progress-bar"><div class="progress-bar__fill progress-bar__fill--' + barColor + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
          '<div class="text-xs text-' + (onTrack ? 'green' : 'red') + '" style="margin-top:2px">' + (onTrack ? t('common.onTrack') : pct.toFixed(0) + '%') + '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<div class="card" style="padding:0;overflow-x:auto;margin-top:16px">' +
      '<div style="padding:14px 16px 0">' +
        '<div class="section-title">Savings Plan -- Year-End Projection</div>' +
        '<div class="text-secondary text-xs mb-8">' +
          periodsWithData + ' periods complete &middot; avg ' + fmt0(avgSaved) + '/check &middot; ' + periodsLeft + ' remaining' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">' +
          '<div><div class="text-xs text-secondary font-bold">PROJECTED TOTAL</div><div class="font-mono font-heavy text-cyan" style="font-size:1rem;margin-top:4px">' + fmt0(projectedYTD) + '</div></div>' +
          '<div><div class="text-xs text-secondary font-bold">ANNUAL GOAL</div><div class="font-mono font-heavy" style="font-size:1rem;margin-top:4px">' + fmt0(annualTotal) + '</div></div>' +
          '<div><div class="text-xs text-secondary font-bold">' + (shortfall <= 0 ? 'SURPLUS' : 'SHORTFALL') + '</div><div class="font-mono font-heavy ' + projClass + '" style="font-size:1rem;margin-top:4px">' + fmt0(Math.abs(shortfall)) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<table class="data-table">' +
        '<thead><tr>' +
          '<th>Category</th>' +
          '<th style="text-align:right">Per Check</th>' +
          '<th style="text-align:right">Projected</th>' +
          '<th style="text-align:right">Annual Goal</th>' +
          '<th>On Track</th>' +
        '</tr></thead>' +
        '<tbody>' + catRows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  // -- Savings Challenge: next year planning (Phase 4D) -----------------
  function renderSavingsChallenge(state) {
    var cats = state.yearlyCategories || [];
    if (!cats.length) return '';

    var ppy     = (state.income && state.income.paychecksPerYear) || 26;
    var entries = state.trackerEntries || {};
    var today   = App.Storage.toISODate(new Date());
    var dates   = (state.income && state.income.paydayDates) || [];

    var totalSaved = 0, periodsWithData = 0;
    dates.forEach(function(d, idx) {
      if (d <= today) {
        var e = entries[String(idx)] || {};
        if (e.amount !== undefined && e.amount !== '') {
          totalSaved += Number(e.amount) || 0; periodsWithData++;
        }
      }
    });
    var avgPerCheck = periodsWithData > 0 ? round2(totalSaved / periodsWithData) : 0;
    var annualTotal = cats.reduce(function(s, c) { return s + (c.annualGoal || 0); }, 0);
    var neededPerCheck = round2(annualTotal / ppy);

    var tiers = [
      { label: t('track.matchGoals'),    multiplier: 1.0, icon: '&#127919;' },
      { label: t('track.stretch10'),   multiplier: 1.1, icon: '&#128170;' },
      { label: t('track.ambitious20'), multiplier: 1.2, icon: '&#128640;' }
    ];

    var tierCards = tiers.map(function(tier) {
      var target     = round2(annualTotal * tier.multiplier);
      var perCheck   = round2(target / ppy);
      var delta      = round2(perCheck - avgPerCheck);
      var deltaClass = delta <= 0 ? 'text-green' : 'text-amber';
      var deltaLabel = delta <= 0 ? t('track.covered') : ('+' + fmt0(delta) + '/check needed');
      return '<div style="flex:1;min-width:140px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center">' +
        '<div style="font-size:1.4rem;margin-bottom:4px">' + tier.icon + '</div>' +
        '<div class="text-xs font-bold text-secondary" style="text-transform:uppercase;letter-spacing:0.05em">' + tier.label + '</div>' +
        '<div class="font-mono font-heavy text-cyan" style="font-size:1.1rem;margin:6px 0">' + fmt0(perCheck) + '/check</div>' +
        '<div class="text-xs ' + deltaClass + '">' + deltaLabel + '</div>' +
        '<div class="text-xs text-secondary" style="margin-top:4px">' + fmt0(target) + '/year</div>' +
      '</div>';
    }).join('');

    var catRows = cats.map(function(cat) {
      var base       = round2((cat.annualGoal || 0) / ppy);
      var perCheck10 = round2((cat.annualGoal || 0) * 1.1 / ppy);
      var perCheck20 = round2((cat.annualGoal || 0) * 1.2 / ppy);
      return '<tr>' +
        '<td class="text-sm font-bold">' + esc(cat.name) + '</td>' +
        '<td class="font-mono text-right">' + fmt0(cat.annualGoal || 0) + '</td>' +
        '<td class="font-mono text-right text-cyan">' + fmt0(base) + '</td>' +
        '<td class="font-mono text-right text-amber">' + fmt0(perCheck10) + '</td>' +
        '<td class="font-mono text-right text-green">' + fmt0(perCheck20) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="card" style="padding:0;margin-top:16px">' +
      '<div style="padding:14px 16px 12px">' +
        '<div class="section-title">Savings Challenge</div>' +
        '<div class="text-secondary text-xs mb-12">Your current avg: ' + fmt0(avgPerCheck) + '/check &middot; needed for goals: ' + fmt0(neededPerCheck) + '/check</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">' + tierCards + '</div>' +
      '</div>' +
      '<table class="data-table">' +
        '<thead><tr>' +
          '<th>Category</th>' +
          '<th style="text-align:right">Annual Goal</th>' +
          '<th style="text-align:right" class="text-cyan">Base /check</th>' +
          '<th style="text-align:right" class="text-amber">+10% /check</th>' +
          '<th style="text-align:right" class="text-green">+20% /check</th>' +
        '</tr></thead>' +
        '<tbody>' + catRows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  // -- Helpers -----------------------------------------------------------
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
