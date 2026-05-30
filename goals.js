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
      buildSpendingGoals(cats, txs, state)
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
        '<div class="section-title">Vault Savings Goals</div>' +
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
        '<div class="section-title">Yearly Spending Goals</div>' +
        '<div class="text-secondary text-xs" style="margin-bottom:4px">' +
          pastChecks + ' of ' + totalChecks + ' paychecks elapsed &mdash; ' +
          'Total budget: ' + fmt0(totalAnnual) + '/yr' +
        '</div>' +
      '</div>' +
      '<table class="data-table">' +
        '<thead><tr>' +
          '<th>Category</th>' +
          '<th style="text-align:right">Annual Goal</th>' +
          '<th style="text-align:right">YTD Spent</th>' +
          '<th style="text-align:right">Remaining</th>' +
          '<th>Pace</th>' +
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

  // ── Events ───────────────────────────────────────────────
  function wireEvents(container, state) {
    container.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'set-target') {
        var vaultId   = btn.dataset.id;
        var vaultName = btn.dataset.name;
        var current   = parseFloat(btn.dataset.current) || 0;
        var val = prompt(
          'Set savings target for "' + vaultName + '":\n(Enter 0 to remove target)',
          current > 0 ? current.toFixed(2) : ''
        );
        if (val === null) return; // cancelled
        var amount = parseFloat(val) || 0;
        var ns = App.Storage.cloneState(App.getState());
        var vault = (ns.accounts.vaults || []).find(function(v) { return v.id === vaultId; });
        if (vault) {
          vault.targetAmount = amount > 0 ? amount : null;
          App.setState(ns);
          App.showToast(amount > 0 ? 'Target set to ' + fmt(amount) : 'Target removed', 'success');
        }
      }
    });
  }

  App.Goals = { render: render };

})(window.App = window.App || {});
