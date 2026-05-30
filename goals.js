/* ═══════════════════════════════════════════════════════════
   GOALS.JS — Savings Goals Tab
   Mirrors the Savings Goals sheet from House_Budgetper.xlsx.
   Shows each vault against a savings target:
     name | target | current | still needed | % bar | status
   Also shows yearly spending category goals (from Tracker YTD).
   Targets are editable inline — tap the target amount to edit.
═══════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var fmt  = function(n) { return App.Storage.formatCurrency(n); };
  var fmt0 = function(n) { return App.Storage.formatCurrency(n, false); };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function statusEmoji(pct) {
    if (pct >= 100) return '🎉 Complete!';
    if (pct >= 75)  return '🔥 Almost there!';
    if (pct >= 50)  return '💪 Half way';
    if (pct >= 25)  return '📈 Getting there';
    return '🚀 Keep going';
  }

  function barColor(pct) {
    if (pct >= 100) return 'green';
    if (pct >= 60)  return 'cyan';
    if (pct >= 30)  return 'amber';
    return 'red';
  }

  // Vault effective balance (sum of items if any, else manual balance)
  function vaultBal(v) {
    if (v.items && v.items.length > 0) {
      return v.items.reduce(function(s, i) { return s + (Number(i.amount) || 0); }, 0);
    }
    return Number(v.balance) || 0;
  }

  // ── Entry point ──────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(container, state);
  }

  // ── Main HTML ────────────────────────────────────────────
  function buildHtml(state) {
    var vaults = (state.accounts && state.accounts.vaults) || [];
    var cats   = state.yearlyCategories || [];
    var txs    = state.transactions || [];

    // Filter vaults that have a target set, put them first
    var withTarget    = vaults.filter(function(v) { return v.targetAmount > 0; });
    var withoutTarget = vaults.filter(function(v) { return !(v.targetAmount > 0); });

    // Summary totals (only vaults with targets)
    var totalTarget  = withTarget.reduce(function(s, v) { return s + (Number(v.targetAmount) || 0); }, 0);
    var totalSaved   = withTarget.reduce(function(s, v) { return s + vaultBal(v); }, 0);
    var totalNeeded  = Math.max(0, totalTarget - totalSaved);
    var overallPct   = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0;

    return (
      buildSummaryCard(totalTarget, totalSaved, totalNeeded, overallPct, withTarget.length, vaults.length) +
      buildVaultGoals(withTarget, withoutTarget) +
      buildSpendingGoals(cats, txs, state) +
      buildChallenges(state)
    );
  }

  // ── Summary card ─────────────────────────────────────────
  function buildSummaryCard(totalTarget, totalSaved, totalNeeded, pct, activeGoals, totalVaults) {
    if (activeGoals === 0) {
      return '<div class="card" style="text-align:center;padding:24px 16px">' +
        '<div style="font-size:2rem;margin-bottom:8px">🎯</div>' +
        '<div class="section-title" style="margin-bottom:6px">No Savings Targets Set</div>' +
        '<div class="text-secondary text-sm">Tap the target amount on any vault below to set a savings goal.</div>' +
        '</div>';
    }
    var bar = Math.min(100, pct).toFixed(1);
    return '<div class="card card--glow-cyan" style="margin-bottom:4px">' +
      '<div class="section-title" style="margin-bottom:12px">🎯 Savings Goals Summary</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin-bottom:14px">' +
        '<div><div class="text-xs text-secondary font-bold">TOTAL TARGET</div><div class="font-mono font-heavy" style="font-size:1.05rem;margin-top:4px">' + fmt0(totalTarget) + '</div></div>' +
        '<div><div class="text-xs text-secondary font-bold">SAVED SO FAR</div><div class="font-mono font-heavy text-green" style="font-size:1.05rem;margin-top:4px">' + fmt0(totalSaved) + '</div></div>' +
        '<div><div class="text-xs text-secondary font-bold">STILL NEEDED</div><div class="font-mono font-heavy text-amber" style="font-size:1.05rem;margin-top:4px">' + fmt0(totalNeeded) + '</div></div>' +
      '</div>' +
      '<div class="progress-bar" style="height:10px;border-radius:6px;margin-bottom:6px">' +
        '<div class="progress-bar__fill progress-bar__fill--' + barColor(pct) + '" style="width:' + bar + '%;border-radius:6px"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between">' +
        '<span class="text-xs text-secondary">' + activeGoals + ' of ' + totalVaults + ' vaults have targets</span>' +
        '<span class="text-xs font-bold ' + (pct >= 75 ? 'text-green' : pct >= 40 ? 'text-amber' : 'text-red') + '">' + pct.toFixed(1) + '% overall</span>' +
      '</div>' +
    '</div>';
  }

  // ── Vault goals list ─────────────────────────────────────
  function buildVaultGoals(withTarget, withoutTarget) {
    var rows = withTarget
      .slice()
      .sort(function(a, b) {
        // Sort by % complete descending (closest to done first)
        var pA = a.targetAmount > 0 ? vaultBal(a) / a.targetAmount : 0;
        var pB = b.targetAmount > 0 ? vaultBal(b) / b.targetAmount : 0;
        return pB - pA;
      })
      .map(renderVaultRow)
      .join('');

    var unsetRows = withoutTarget.map(function(v) {
      var bal = vaultBal(v);
      return '<div class="list-item" style="opacity:0.7">' +
        '<div style="flex:1"><div class="font-bold text-sm">' + esc(v.name) + '</div>' +
        '<div class="text-xs text-secondary">No target set &mdash; balance: ' + fmt(bal) + '</div></div>' +
        '<button class="btn btn--secondary btn--sm" data-action="set-target" data-id="' + v.id + '" data-name="' + esc(v.name) + '" data-current="' + (v.targetAmount || 0) + '">Set Target</button>' +
      '</div>';
    }).join('');

    return '<div class="card" style="padding:0;margin-bottom:4px">' +
      '<div style="padding:14px 16px 0">' +
        '<div class="section-title">' + t('goal.vaultGoals') + '</div>' +
        (withTarget.length === 0 ? '<div class="text-secondary text-xs" style="margin-bottom:12px">Set a target on any vault to track progress here.</div>' : '<div class="text-secondary text-xs" style="margin-bottom:4px">Tap a target to edit it.</div>') +
      '</div>' +
      (rows || '') +
      (unsetRows
        ? '<details style="border-top:1px solid var(--border)">' +
          '<summary style="padding:10px 16px;cursor:pointer;font-size:0.8rem;color:var(--text-dim);list-style:none;-webkit-appearance:none">' +
          '&#9654; ' + withoutTarget.length + ' vault' + (withoutTarget.length !== 1 ? 's' : '') + ' without a target</summary>' +
          '<div>' + unsetRows + '</div>' +
          '</details>'
        : '') +
    '</div>';
  }

  function renderVaultRow(v) {
    var bal     = vaultBal(v);
    var target  = Number(v.targetAmount) || 0;
    var needed  = Math.max(0, target - bal);
    var pct     = target > 0 ? Math.min(100, (bal / target) * 100) : 0;
    var bar     = pct.toFixed(1);
    var emoji   = statusEmoji(pct);
    var color   = barColor(pct);
    var overshot = bal > target && target > 0;

    return '<div class="list-item" style="display:block;padding:12px 16px;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">' +
        '<div>' +
          '<div class="font-bold text-sm">' + esc(v.name) + '</div>' +
          '<div class="text-xs" style="margin-top:2px">' + emoji + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div class="font-mono font-heavy text-green" style="font-size:1rem">' + fmt(bal) + '</div>' +
          '<div class="text-xs text-secondary">saved</div>' +
        '</div>' +
      '</div>' +
      '<div class="progress-bar" style="margin-bottom:6px">' +
        '<div class="progress-bar__fill progress-bar__fill--' + color + '" style="width:' + bar + '%"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div class="text-xs text-secondary">' +
          (overshot
            ? '<span class="text-green">&#10003; Goal reached! +' + fmt(bal - target) + ' extra</span>'
            : fmt(needed) + ' still needed') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<span class="text-xs text-secondary">Target:</span>' +
          '<button class="btn btn--secondary btn--sm" style="font-family:monospace;min-width:80px" ' +
            'data-action="set-target" data-id="' + v.id + '" data-name="' + esc(v.name) + '" data-current="' + target + '">' +
            fmt0(target) +
          '</button>' +
          '<span class="text-xs font-bold ' + (pct >= 75 ? 'text-green' : pct >= 40 ? 'text-amber' : 'text-red') + '">' + pct.toFixed(0) + '%</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Spending category goals ──────────────────────────────
  function buildSpendingGoals(cats, txs, state) {
    if (!cats.length) return '';

    var now        = App.Storage.toISODate(new Date());
    var dates      = (state.income && state.income.paydayDates) || [];
    var pastChecks = dates.filter(function(d) { return d <= now; }).length;
    var totalChecks = (state.income && state.income.paychecksPerYear) || 26;

    var totalAnnual = cats.reduce(function(s, c) { return s + (c.annualGoal || 0); }, 0);
    var totalSpent  = 0;

    var rows = cats
      .filter(function(c) { return c.annualGoal > 0; })
      .map(function(cat) {
        var ytdSpent   = txs
          .filter(function(tx) { return tx.categoryId === cat.id; })
          .reduce(function(s, tx) { return s + (Number(tx.amount) || 0); }, 0);
        totalSpent += ytdSpent;
        var annual     = cat.annualGoal || 0;
        var remaining  = annual - ytdSpent;
        var paceTarget = pastChecks > 0 ? (annual / totalChecks) * pastChecks : 0;
        var paceRatio  = paceTarget > 0 ? ytdSpent / paceTarget : 0;
        var pct        = annual > 0 ? Math.min(100, (ytdSpent / annual) * 100) : 0;
        // For spending: green = on pace, red = over budget, amber = under
        var spendColor = paceRatio > 1.1 ? 'red' : paceRatio < 0.8 ? 'amber' : 'green';

        return '<tr>' +
          '<td class="font-bold text-sm">' + esc(cat.name) + '</td>' +
          '<td class="font-mono text-right text-dim">' + fmt0(annual) + '</td>' +
          '<td class="font-mono text-right">' + fmt0(ytdSpent) + '</td>' +
          '<td class="font-mono text-right ' + (remaining >= 0 ? 'text-green' : 'text-red') + '">' + fmt0(remaining) + '</td>' +
          '<td style="min-width:80px">' +
            '<div class="progress-bar">' +
              '<div class="progress-bar__fill progress-bar__fill--' + spendColor + '" style="width:' + pct.toFixed(1) + '%"></div>' +
            '</div>' +
            '<div class="text-xs text-' + spendColor + '" style="margin-top:2px">' + pct.toFixed(0) + '%</div>' +
          '</td>' +
        '</tr>';
      }).join('');

    return '<div class="card" style="padding:0;overflow-x:auto;margin-bottom:4px">' +
      '<div style="padding:14px 16px 0">' +
        '<div class="section-title">' + t('goal.spendGoals') + '</div>' +
        '<div class="text-secondary text-xs" style="margin-bottom:4px">' +
          pastChecks + ' of ' + totalChecks + ' paychecks elapsed &mdash; ' +
          'Total budget: ' + fmt0(totalAnnual) + '/yr' +
        '</div>' +
      '</div>' +
      '<table class="data-table">' +
        '<thead><tr>' +
          '<th>Category</th>' +
          '<th style="text-align:right">' + t('track.annualGoal') + '</th>' +
          '<th style="text-align:right">' + t('track.ytdSpent') + '</th>' +
          '<th style="text-align:right">' + t('common.remaining') + '</th>' +
          '<th>' + t('track.paceLabel') + '</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr style="font-weight:700;border-top:2px solid var(--border)">' +
          '<td>TOTAL</td>' +
          '<td class="font-mono text-right">' + fmt0(totalAnnual) + '</td>' +
          '<td class="font-mono text-right">' + fmt0(totalSpent) + '</td>' +
          '<td class="font-mono text-right ' + (totalAnnual - totalSpent >= 0 ? 'text-green' : 'text-red') + '">' + fmt0(totalAnnual - totalSpent) + '</td>' +
          '<td></td>' +
        '</tr></tfoot>' +
      '</table>' +
    '</div>';
  }


  // ── Savings Challenges ───────────────────────────────────
  function buildChallenges(state) {
    var challenges = state.challenges || [];
    if (!challenges.length) return '';

    var cards = challenges.map(function(ch) {
      var periods   = ch.type === '52week' ? 52 : 26;
      var start     = Number(ch.startAmount) || (ch.type === '52week' ? 3 : 50);
      var checked   = ch.checkedPeriods || [];

      // Calculate totals
      var grandTotal = 0;
      for (var i = 1; i <= periods; i++) grandTotal += start * i;

      var savedTotal = checked.reduce(function(s, p) { return s + (start * p); }, 0);
      var pct        = grandTotal > 0 ? Math.min(100, (savedTotal / grandTotal) * 100) : 0;
      var color      = pct >= 75 ? 'green' : pct >= 40 ? 'cyan' : 'amber';
      var nextPeriod = 1;
      for (var j = 1; j <= periods; j++) {
        if (checked.indexOf(j) === -1) { nextPeriod = j; break; }
      }
      var nextAmt = start * nextPeriod;

      // Build period grid
      var gridItems = '';
      for (var k = 1; k <= periods; k++) {
        var isChecked = checked.indexOf(k) !== -1;
        var amt       = start * k;
        gridItems +=
          '<button class="ch-cell' + (isChecked ? ' ch-cell--done' : '') + '" ' +
            'data-action="ch-toggle" data-chid="' + ch.id + '" data-period="' + k + '" ' +
            'title="Period ' + k + ': ' + fmt(amt) + '">' +
            '<span class="ch-period">' + k + '</span>' +
            '<span class="ch-amt">' + fmt0(amt) + '</span>' +
          '</button>';
      }

      return '<div class="card" style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
          '<div>' +
            '<div class="card-title" style="margin-bottom:2px">' +
              (ch.type === '52week' ? '📅' : '💰') + ' ' + esc(ch.name) +
            '</div>' +
            '<div class="text-xs text-secondary">' +
              '$' + start + ' × period # · Total goal: ' + fmt0(grandTotal) +
            '</div>' +
          '</div>' +
          '<button class="btn btn--secondary btn--sm" data-action="ch-config" data-chid="' + ch.id + '" ' +
            'data-start="' + start + '" data-name="' + esc(ch.name) + '">⚙️</button>' +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
          '<span class="font-mono font-bold text-green">' + fmt(savedTotal) + '</span>' +
          '<span class="text-xs text-secondary">' + checked.length + ' / ' + periods + ' periods checked</span>' +
        '</div>' +

        '<div class="progress-bar" style="margin-bottom:4px;height:8px">' +
          '<div class="progress-bar__fill progress-bar__fill--' + color + '" style="width:' + pct.toFixed(1) + '%;border-radius:4px"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:14px">' +
          '<span class="text-xs text-secondary">' + pct.toFixed(0) + '% complete</span>' +
          (checked.length < periods
            ? '<span class="text-xs text-cyan">Next: ' + fmt(nextAmt) + ' (period ' + nextPeriod + ')</span>'
            : '<span class="text-xs text-green">🎉 Challenge complete!</span>') +
        '</div>' +

        '<div class="ch-grid">' + gridItems + '</div>' +

        '<div class="text-xs text-secondary" style="margin-top:8px;text-align:center">' +
          'Tap a period to check/uncheck it' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div style="margin-top:8px">' +
      '<div class="section-title" style="margin-bottom:8px">💪 Savings Challenges</div>' +
      cards +
    '</div>';
  }

  // ── Events ───────────────────────────────────────────────
  function wireEvents(container, state) {
    container.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'ch-toggle') {
        var chId   = btn.dataset.chid;
        var period = parseInt(btn.dataset.period);
        var ns     = App.Storage.cloneState(App.getState());
        var ch     = (ns.challenges || []).find(function(c) { return c.id === chId; });
        if (!ch) return;
        var idx = ch.checkedPeriods.indexOf(period);
        if (idx === -1) ch.checkedPeriods.push(period);
        else            ch.checkedPeriods.splice(idx, 1);
        App.setState(ns);
        return;
      }

      if (btn.dataset.action === 'ch-config') {
        var chId   = btn.dataset.chid;
        var curAmt = parseFloat(btn.dataset.start) || 0;
        var chName = btn.dataset.name;
        App.showModal(
          '<div style="padding:8px">' +
            '<div class="card-title mb-12">⚙️ ' + esc(chName) + '</div>' +
            '<label class="text-xs text-secondary">Starting Amount per Period ($)</label>' +
            '<input id="ch-start-input" type="number" min="1" step="1" inputmode="numeric" ' +
              'class="form-control mb-4" value="' + curAmt + '" />' +
            '<div class="text-xs text-secondary mb-12">' +
              'Each period = this amount × the period number.<br>' +
              'E.g. $3 → Period 1: $3, Period 2: $6, Period 52: $156.' +
            '</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:8px">' +
              '<button class="btn btn--secondary" style="flex:1" onclick="App.closeModal()">Cancel</button>' +
              '<button class="btn btn--primary" style="flex:1" id="ch-save-btn">Save</button>' +
            '</div>' +
            '<button class="btn btn--danger btn--full" id="ch-reset-btn">Reset All Progress</button>' +
          '</div>'
        );
        setTimeout(function() {
          var inp     = document.getElementById('ch-start-input');
          var saveBtn = document.getElementById('ch-save-btn');
          var resetBtn = document.getElementById('ch-reset-btn');
          if (inp) inp.focus();
          if (saveBtn) saveBtn.addEventListener('click', function() {
            var val = parseInt(inp.value) || 1;
            var ns  = App.Storage.cloneState(App.getState());
            var ch  = (ns.challenges || []).find(function(c) { return c.id === chId; });
            if (ch) { ch.startAmount = val; App.setState(ns); }
            App.closeModal();
            App.showToast('Starting amount updated ✓', 'success');
          });
          if (resetBtn) resetBtn.addEventListener('click', function() {
            if (!confirm('Reset all checked periods for this challenge?')) return;
            var ns = App.Storage.cloneState(App.getState());
            var ch = (ns.challenges || []).find(function(c) { return c.id === chId; });
            if (ch) { ch.checkedPeriods = []; App.setState(ns); }
            App.closeModal();
            App.showToast('Challenge reset', 'info');
          });
        }, 50);
        return;
      }

      if (btn.dataset.action === 'set-target') {
        var vaultId   = btn.dataset.id;
        var vaultName = btn.dataset.name;
        var current   = parseFloat(btn.dataset.current) || 0;
        // Custom modal — no browser prompt
        var bd = document.getElementById('modal-backdrop');
        var mc = document.getElementById('modal-content');
        if (!bd || !mc) return;
        mc.innerHTML =
          '<div class="modal-header">' +
            '<div class="modal-title">&#127919; ' + esc(vaultName) + '</div>' +
            '<button class="btn btn--icon btn--secondary" data-action="modal-close">&#10005;</button>' +
          '</div>' +
          '<p class="text-secondary text-sm" style="margin-bottom:12px">Set a savings target to track progress toward this vault goal.</p>' +
          '<div class="form-group">' +
            '<label>Savings Target ($)</label>' +
            '<input type="number" id="m-goal-amt" inputmode="decimal" min="0" step="0.01" ' +
              'value="' + (current > 0 ? current.toFixed(2) : '') + '" ' +
              'placeholder="e.g. 35000" />' +
          '</div>' +
          '<p class="text-xs text-secondary" style="margin-bottom:12px">Enter 0 or leave blank to remove the target.</p>' +
          '<button class="btn btn--primary btn--full" data-action="modal-submit">Save Target</button>';
        bd.classList.remove('hidden');
        bd.setAttribute('aria-hidden', 'false');
        var inp = mc.querySelector('#m-goal-amt');
        if (inp) setTimeout(function() { inp.focus(); inp.select(); }, 80);
        mc.querySelector('[data-action="modal-close"]').addEventListener('click', function() {
          bd.classList.add('hidden');
          mc.innerHTML = '';
        });
        mc.querySelector('[data-action="modal-submit"]').addEventListener('click', function() {
          var amount = parseFloat(mc.querySelector('#m-goal-amt').value) || 0;
          var ns = App.Storage.cloneState(App.getState());
          var vault = (ns.accounts.vaults || []).find(function(v) { return v.id === vaultId; });
          if (vault) {
            vault.targetAmount = amount > 0 ? amount : null;
            App.setState(ns);
            App.showToast(amount > 0 ? 'Target set to ' + fmt(amount) : 'Target removed', 'success');
          }
          bd.classList.add('hidden');
          mc.innerHTML = '';
        });
        inp.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') mc.querySelector('[data-action="modal-submit"]').click();
        });
        bd.addEventListener('click', function h(e) {
          if (e.target === bd) { bd.classList.add('hidden'); mc.innerHTML = ''; bd.removeEventListener('click', h); }
        });
      } // end set-target
    });
  }

  App.Goals = { render: render };

})(window.App = window.App || {});
