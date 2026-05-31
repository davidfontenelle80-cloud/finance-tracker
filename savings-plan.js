/* ══════════════════════════════════════════════════════════════
   SAVINGS-PLAN.JS — 52-Week + 26 Bi-Weekly Challenge Tables
   Configurable seed amount; running totals update live.
   Tap/click a row to mark it completed.
   Mirrors Excel "Savings Plan" + "Savings Challenge" sheets.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function (k) { return App.Lang ? App.Lang.t(k) : k; };

  var DEFAULTS = {
    week52:     { seed: 2,  checked: [] },
    biweekly26: { seed: 50, checked: [] }
  };

  function getPlans(state) {
    var p = state.savingsPlans || {};
    return {
      week52:     Object.assign({ seed: 2,  checked: [] }, p.week52     || {}),
      biweekly26: Object.assign({ seed: 50, checked: [] }, p.biweekly26 || {})
    };
  }

  // ── Table builders ────────────────────────────────────────

  // 52-week: week N saves (seed + N - 1), i.e. $2, $3, $4 ... $53
  function build52Table(w52) {
    var seed    = Math.max(1, w52.seed || 2);
    var checked = w52.checked || [];
    var total   = 0;
    var html    = '';
    var yearEnd = 0;
    for (var i = 1; i <= 52; i++) { yearEnd += seed + (i - 1); }

    html += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem">';
    html += '<thead><tr style="border-bottom:1px solid var(--border)">';
    html += '<th style="padding:5px 8px;width:36px"></th>';
    html += '<th style="padding:5px 8px;text-align:center">' + t('splan.week') + '</th>';
    html += '<th style="padding:5px 8px;text-align:right">' + t('splan.saveThisWeek') + '</th>';
    html += '<th style="padding:5px 8px;text-align:right">' + t('splan.totalSaved') + '</th>';
    html += '</tr></thead><tbody>';

    for (var i = 1; i <= 52; i++) {
      var amt       = seed + (i - 1);
      total        += amt;
      var isDone    = checked.indexOf(i) !== -1;
      var rowStyle  = isDone ? 'background:rgba(0,240,255,0.05)' : '';
      var checkMark = isDone ? '&#9989;' : '&#9711;';
      html += '<tr class="splan-row" data-plan="52" data-period="' + i + '" style="cursor:pointer;' + rowStyle + '">';
      html += '<td style="padding:4px 8px;text-align:center;font-size:1rem">' + checkMark + '</td>';
      html += '<td style="padding:4px 8px;text-align:center">' + i + '</td>';
      html += '<td style="padding:4px 8px;text-align:right">$' + amt.toFixed(2) + '</td>';
      html += '<td style="padding:4px 8px;text-align:right;' + (isDone ? 'color:var(--neon-cyan)' : '') + '">$' + total.toFixed(2) + '</td>';
      html += '</tr>';
    }
    html += '</tbody>';
    html += '<tfoot><tr style="border-top:2px solid var(--border);font-weight:700">';
    html += '<td colspan="2" style="padding:6px 8px">' + t('splan.yearEnd') + '</td>';
    html += '<td></td>';
    html += '<td style="text-align:right;padding:6px 8px;color:var(--neon-cyan)">$' + yearEnd.toFixed(2) + '</td>';
    html += '</tr></tfoot>';
    html += '</table>';
    return html;
  }

  // 26 bi-weekly: period N saves (seed + (N-1)*2), i.e. $50, $52, $54 ... $100
  function build26Table(b26) {
    var seed    = Math.max(1, b26.seed || 50);
    var checked = b26.checked || [];
    var total   = 0;
    var html    = '';
    var yearEnd = 0;
    for (var i = 1; i <= 26; i++) { yearEnd += seed + (i - 1) * 2; }

    html += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem">';
    html += '<thead><tr style="border-bottom:1px solid var(--border)">';
    html += '<th style="padding:5px 8px;width:36px"></th>';
    html += '<th style="padding:5px 8px;text-align:center">' + t('splan.period') + '</th>';
    html += '<th style="padding:5px 8px;text-align:right">' + t('splan.saveThisPeriod') + '</th>';
    html += '<th style="padding:5px 8px;text-align:right">' + t('splan.totalSaved') + '</th>';
    html += '</tr></thead><tbody>';

    for (var i = 1; i <= 26; i++) {
      var amt      = seed + (i - 1) * 2;
      total       += amt;
      var isDone   = checked.indexOf(i) !== -1;
      var rowStyle = isDone ? 'background:rgba(0,240,255,0.05)' : '';
      var checkMark = isDone ? '&#9989;' : '&#9711;';
      html += '<tr class="splan-row" data-plan="26" data-period="' + i + '" style="cursor:pointer;' + rowStyle + '">';
      html += '<td style="padding:4px 8px;text-align:center;font-size:1rem">' + checkMark + '</td>';
      html += '<td style="padding:4px 8px;text-align:center">P' + i + '</td>';
      html += '<td style="padding:4px 8px;text-align:right">$' + amt.toFixed(2) + '</td>';
      html += '<td style="padding:4px 8px;text-align:right;' + (isDone ? 'color:var(--neon-cyan)' : '') + '">$' + total.toFixed(2) + '</td>';
      html += '</tr>';
    }
    html += '</tbody>';
    html += '<tfoot><tr style="border-top:2px solid var(--border);font-weight:700">';
    html += '<td colspan="2" style="padding:6px 8px">' + t('splan.yearEnd') + '</td>';
    html += '<td></td>';
    html += '<td style="text-align:right;padding:6px 8px;color:var(--neon-cyan)">$' + yearEnd.toFixed(2) + '</td>';
    html += '</tr></tfoot>';
    html += '</table>';
    return html;
  }

  // ── Render ────────────────────────────────────────────────
  function render(state, container) {
    var plans = getPlans(state);
    var w52   = plans.week52;
    var b26   = plans.biweekly26;

    var done52  = w52.checked.length;
    var done26  = b26.checked.length;
    var total52 = 0;
    for (var i = 1; i <= done52; i++) { total52 += (w52.seed || 2) + (w52.checked.sort(function(a,b){return a-b;})[i-1] - 1); }
    // Simpler: just count checked
    var checked52sorted = (w52.checked || []).slice().sort(function(a,b){return a-b;});
    var saved52 = checked52sorted.reduce(function(s,i){ return s + (w52.seed||2) + (i-1); }, 0);
    var checked26sorted = (b26.checked || []).slice().sort(function(a,b){return a-b;});
    var saved26 = checked26sorted.reduce(function(s,i){ return s + (b26.seed||50) + (i-1)*2; }, 0);

    var html = '';

    // 52-week section
    html += '<div class="section-card" style="margin-bottom:16px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
    html += '<h2 class="section-title" style="margin:0">&#128197; ' + t('splan.week52') + '</h2>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<span class="text-secondary" style="font-size:0.78rem">' + t('splan.startAt') + '</span>';
    html += '<input type="number" id="splan-seed-52" class="input" min="1" step="1" value="' + (w52.seed || 2) + '" ';
    html += 'style="width:64px;padding:4px 6px;font-size:0.85rem">';
    html += '</div></div>';

    html += '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:4px 10px;font-size:0.78rem">&#9989; ' + done52 + '/52 ' + t('splan.completed') + '</span>';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:4px 10px;font-size:0.78rem;color:var(--neon-cyan)">&#128178; $' + saved52.toFixed(2) + ' ' + t('splan.saved') + '</span>';
    html += '</div>';

    html += build52Table(w52);
    html += '</div>';

    // 26 bi-weekly section
    html += '<div class="section-card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
    html += '<h2 class="section-title" style="margin:0">&#128181; ' + t('splan.biweekly26') + '</h2>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<span class="text-secondary" style="font-size:0.78rem">' + t('splan.startAt') + '</span>';
    html += '<input type="number" id="splan-seed-26" class="input" min="1" step="1" value="' + (b26.seed || 50) + '" ';
    html += 'style="width:72px;padding:4px 6px;font-size:0.85rem">';
    html += '</div></div>';

    html += '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:4px 10px;font-size:0.78rem">&#9989; ' + done26 + '/26 ' + t('splan.completed') + '</span>';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:4px 10px;font-size:0.78rem;color:var(--neon-cyan)">&#128178; $' + saved26.toFixed(2) + ' ' + t('splan.saved') + '</span>';
    html += '</div>';

    html += build26Table(b26);
    html += '</div>';

    container.innerHTML = html;
    wireEvents(container);
  }

  // ── Wire Events ───────────────────────────────────────────
  function wireEvents(container) {
    // Seed inputs
    ['52', '26'].forEach(function (key) {
      var inp = document.getElementById('splan-seed-' + key);
      if (!inp) return;
      inp.addEventListener('change', function () {
        var val = Math.max(1, parseInt(inp.value) || (key === '52' ? 2 : 50));
        inp.value = val;
        var s    = App.Storage.cloneState(App.getState());
        if (!s.savingsPlans) s.savingsPlans = { week52: { seed: 2, checked: [] }, biweekly26: { seed: 50, checked: [] } };
        var planKey = key === '52' ? 'week52' : 'biweekly26';
        if (!s.savingsPlans[planKey]) s.savingsPlans[planKey] = { seed: val, checked: [] };
        s.savingsPlans[planKey].seed = val;
        App.setState(s);
        render(App.getState(), container);
      });
    });

    // Row tap to toggle
    container.querySelectorAll('.splan-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var planKey    = row.dataset.plan === '52' ? 'week52' : 'biweekly26';
        var period     = parseInt(row.dataset.period, 10);
        var s          = App.Storage.cloneState(App.getState());
        if (!s.savingsPlans) s.savingsPlans = { week52: { seed: 2, checked: [] }, biweekly26: { seed: 50, checked: [] } };
        if (!s.savingsPlans[planKey]) s.savingsPlans[planKey] = DEFAULTS[planKey];
        var arr = (s.savingsPlans[planKey].checked || []).slice();
        var idx = arr.indexOf(period);
        if (idx === -1) { arr.push(period); } else { arr.splice(idx, 1); }
        s.savingsPlans[planKey].checked = arr;
        App.setState(s);
        render(App.getState(), container);
      });
    });
  }

  App.SavingsPlan = { render: render };

})(window.App = window.App || {});
