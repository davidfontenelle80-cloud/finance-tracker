/* ══════════════════════════════════════════════════════════════
   PAYCHECK-TRACKER.JS — 26-Period Savings Grid
   26-row (one per pay period) x category columns grid.
   Enter actual amounts saved per period.
   Auto-calculates row totals, column totals, planned vs actual.
   Add/remove categories (columns).
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function (k) { return App.Lang ? App.Lang.t(k) : k; };

  var DEFAULT_COLS = [
    'Asamblea', 'Ropa', 'Mantenimiento', 'Emergency',
    'Car Savings', 'Insurance', 'Slush', 'Vacation', 'Roth D', 'Roth Y'
  ];

  function getTrackerData(state) {
    var d = state.paycheckTrackerData;
    if (!d || !d.columns) {
      return { columns: DEFAULT_COLS.slice(), rows: {} };
    }
    return d;
  }

  function escAttr(s) {
    return s.replace(/"/g, '&quot;');
  }

  function render(state, container) {
    var data     = getTrackerData(state);
    var cols     = data.columns;
    var rows     = data.rows || {};
    var dates    = (state.income && state.income.paydayDates) || [];
    var year     = new Date().getFullYear();
    var periods  = dates.filter(function (d) { return d.startsWith(String(year)); });
    if (!periods.length) periods = dates.slice(0, 26);
    while (periods.length < 26) periods.push('P' + (periods.length + 1));

    var colTotals  = {};
    var grandTotal = 0;
    cols.forEach(function (c) { colTotals[c] = 0; });

    periods.slice(0, 26).forEach(function (_, pi) {
      var rowKey  = String(pi + 1);
      var rowData = rows[rowKey] || {};
      cols.forEach(function (c) {
        var v = parseFloat(rowData[c] || 0);
        colTotals[c] += v;
        grandTotal   += v;
      });
    });

    var html = '<div class="section-card" style="padding:12px">';
    var periodsForWire = periods;
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
    html += '<h2 class="section-title" style="margin:0">&#128197; ' + t('pct.title') + '</h2>';
    html += '<div style="display:flex;gap:6px">';
    html += '<button class="btn btn--secondary btn--sm" data-action="pct-autofill">&#128260; ' + t('pct.autoFill') + '</button>';
    html += '<button class="btn btn--secondary btn--sm" data-action="pct-add-col">+ ' + t('pct.addCol') + '</button>';
    html += '</div>';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:4px 10px;font-size:0.78rem">';
    html += '&#128202; ' + t('pct.cols') + ': <strong>' + cols.length + '</strong></span>';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:4px 10px;font-size:0.78rem">';
    html += '&#128178; ' + t('pct.grandTotal') + ': <strong style="color:var(--neon-cyan)">$' + grandTotal.toFixed(2) + '</strong></span>';
    html += '</div>';

    html += '<div style="overflow-x:auto">';
    html += '<table style="border-collapse:collapse;font-size:0.77rem;min-width:' + (160 + cols.length * 80) + 'px">';
    html += '<thead><tr>';
    html += '<th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--surface-1);z-index:2;min-width:100px">' + t('pct.period') + '</th>';
    cols.forEach(function (col, ci) {
      html += '<th style="text-align:right;padding:5px 6px;border-bottom:1px solid var(--border);white-space:nowrap;min-width:76px">';
      html += '<span>' + col + '</span>';
      html += ' <button class="btn btn--ghost" style="font-size:0.6rem;padding:0 3px;opacity:0.5" data-action="pct-del-col" data-col="' + ci + '">&#10005;</button>';
      html += '</th>';
    });
    html += '<th style="text-align:right;padding:5px 8px;border-bottom:1px solid var(--border);min-width:72px">' + t('pct.total') + '</th>';
    html += '</tr></thead>';

    html += '<tbody>';
    periods.slice(0, 26).forEach(function (date, pi) {
      var rowKey   = String(pi + 1);
      var rowData  = rows[rowKey] || {};
      var rowTotal = 0;
      cols.forEach(function (c) { rowTotal += parseFloat(rowData[c] || 0); });
      var bg = pi % 2 !== 0 ? 'background:rgba(255,255,255,0.025)' : '';
      html += '<tr style="' + bg + '">';
      html += '<td style="padding:3px 8px;border-bottom:1px solid rgba(255,255,255,0.04);position:sticky;left:0;background:' + (pi % 2 !== 0 ? '#0d1325' : 'var(--surface-1)') + ';z-index:1">';
      html += '<span style="font-weight:600">#' + (pi + 1) + '</span>';
      if (date && date.length === 10) html += ' <span style="color:var(--text-secondary);font-size:0.71rem">' + date + '</span>';
      html += '</td>';
      cols.forEach(function (col) {
        var val = parseFloat(rowData[col] || 0);
        html += '<td style="padding:2px 4px;border-bottom:1px solid rgba(255,255,255,0.04)">';
        html += '<input type="number" class="pct-cell" step="0.01" min="0" ';
        html += 'data-row="' + rowKey + '" data-col="' + escAttr(col) + '" ';
        html += 'value="' + (val || '') + '" placeholder="0" ';
        html += 'style="width:72px;text-align:right;background:transparent;border:1px solid transparent;border-radius:4px;padding:2px 4px;color:inherit;font-size:0.77rem">';
        html += '</td>';
      });
      html += '<td style="text-align:right;padding:3px 8px;border-bottom:1px solid rgba(255,255,255,0.04);font-weight:600;color:' + (rowTotal > 0 ? 'var(--neon-cyan)' : 'var(--text-secondary)') + '">';
      html += rowTotal > 0 ? ('$' + rowTotal.toFixed(2)) : '—';
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody>';

    html += '<tfoot><tr style="background:rgba(0,240,255,0.06);font-weight:700">';
    html += '<td style="padding:6px 8px;position:sticky;left:0;background:rgba(0,240,255,0.06)">' + t('pct.totals') + '</td>';
    cols.forEach(function (col) {
      html += '<td style="text-align:right;padding:6px 6px">$' + colTotals[col].toFixed(2) + '</td>';
    });
    html += '<td style="text-align:right;padding:6px 8px;color:var(--neon-cyan)">$' + grandTotal.toFixed(2) + '</td>';
    html += '</tr></tfoot>';
    html += '</table></div></div>';

    container.innerHTML = html;
    wireEvents(container, cols, periodsForWire || periods);
  }


  function autoPopulate(state, cols, periods) {
    var txns = state.transactions || [];
    var dates = (state.income && state.income.paydayDates) || [];
    var year  = new Date().getFullYear();
    var yearDates = dates.filter(function(d) { return d.startsWith(String(year)); });
    if (!yearDates.length) yearDates = dates.slice(0, 26);

    var newRows = {};
    periods.slice(0, 26).forEach(function(paydate, pi) {
      var rowKey = String(pi + 1);
      // Date range: day after previous payday (or Jan 1) through this payday
      var startStr;
      if (pi === 0) {
        startStr = String(year) + '-01-01';
      } else {
        var prevDate = new Date(yearDates[pi - 1] + 'T00:00:00');
        prevDate.setDate(prevDate.getDate() + 1);
        startStr = prevDate.toISOString().slice(0, 10);
      }
      var endStr = paydate;
      var rowData = {};
      cols.forEach(function(col) {
        var colLower = col.toLowerCase();
        var sum = 0;
        txns.forEach(function(tx) {
          var txDate = (tx.date || '').slice(0, 10);
          if (txDate >= startStr && txDate <= endStr) {
            var accMatch = (tx.accountName || '').toLowerCase() === colLower;
            var catMatch = (tx.categoryName || '').toLowerCase() === colLower;
            if (accMatch || catMatch) {
              sum += parseFloat(tx.amount) || 0;
            }
          }
        });
        rowData[col] = Math.round(sum * 100) / 100;
      });
      newRows[rowKey] = rowData;
    });
    return newRows;
  }

  function wireEvents(container, cols, periods) {
    container.querySelectorAll('.pct-cell').forEach(function (inp) {
      inp.addEventListener('focus', function () { inp.style.border = '1px solid var(--neon-cyan)'; });
      inp.addEventListener('blur', function () {
        inp.style.border = '1px solid transparent';
        var rowKey  = inp.dataset.row;
        var colName = inp.dataset.col;
        var val     = parseFloat(inp.value) || 0;
        var s = App.Storage.cloneState(App.getState());
        if (!s.paycheckTrackerData) s.paycheckTrackerData = { columns: DEFAULT_COLS.slice(), rows: {} };
        if (!s.paycheckTrackerData.rows) s.paycheckTrackerData.rows = {};
        if (!s.paycheckTrackerData.rows[rowKey]) s.paycheckTrackerData.rows[rowKey] = {};
        s.paycheckTrackerData.rows[rowKey][colName] = val;
        App.setState(s);
        render(App.getState(), container);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var next = container.querySelector('[data-row="' + (parseInt(inp.dataset.row, 10) + 1) + '"][data-col="' + escAttr(inp.dataset.col) + '"]');
          if (next) next.focus();
        }
      });
    });

    var autoFillBtn = container.querySelector('[data-action="pct-autofill"]');
    if (autoFillBtn) {
      autoFillBtn.addEventListener('click', function () {
        var s = App.Storage.cloneState(App.getState());
        if (!s.paycheckTrackerData) s.paycheckTrackerData = { columns: DEFAULT_COLS.slice(), rows: {} };
        var newRows = autoPopulate(s, cols, periods || []);
        // Merge: overwrite only cells with computed > 0, preserve existing manual entries for others
        Object.keys(newRows).forEach(function(rk) {
          if (!s.paycheckTrackerData.rows[rk]) s.paycheckTrackerData.rows[rk] = {};
          Object.keys(newRows[rk]).forEach(function(col) {
            if (newRows[rk][col] > 0) {
              s.paycheckTrackerData.rows[rk][col] = newRows[rk][col];
            }
          });
        });
        App.setState(s);
        render(App.getState(), container.parentElement || container);
      });
    }

    var addBtn = container.querySelector('[data-action="pct-add-col"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        App.showModal(
          '<div style="padding:8px">' +
          '<h3 style="margin-bottom:12px">+ ' + App.Lang.t('pct.addCol') + '</h3>' +
          '<input id="pct-new-col" class="input" type="text" placeholder="' + App.Lang.t('pct.colName') + '" style="width:100%;margin-bottom:12px">' +
          '<div style="display:flex;gap:8px">' +
          '<button class="btn btn--secondary" style="flex:1" onclick="App.closeModal()">' + App.Lang.t('cancel') + '</button>' +
          '<button class="btn btn--primary" style="flex:1" id="pct-col-ok">' + App.Lang.t('add') + '</button>' +
          '</div></div>'
        );
        setTimeout(function () { var el = document.getElementById('pct-new-col'); if (el) el.focus(); }, 50);
        var ok = document.getElementById('pct-col-ok');
        if (ok) {
          ok.addEventListener('click', function () {
            var name = (document.getElementById('pct-new-col').value || '').trim();
            if (!name) return;
            var s = App.Storage.cloneState(App.getState());
            if (!s.paycheckTrackerData) s.paycheckTrackerData = { columns: DEFAULT_COLS.slice(), rows: {} };
            if (s.paycheckTrackerData.columns.indexOf(name) === -1) s.paycheckTrackerData.columns.push(name);
            App.setState(s);
            App.closeModal();
            render(App.getState(), container);
          });
        }
      });
    }

    container.querySelectorAll('[data-action="pct-del-col"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var ci      = parseInt(btn.dataset.col, 10);
        var colName = cols[ci];
        var s = App.Storage.cloneState(App.getState());
        if (!s.paycheckTrackerData) return;
        s.paycheckTrackerData.columns.splice(ci, 1);
        Object.keys(s.paycheckTrackerData.rows || {}).forEach(function (rk) {
          delete s.paycheckTrackerData.rows[rk][colName];
        });
        App.setState(s);
        render(App.getState(), container);
      });
    });
  }

  App.PaycheckTracker = { render: render };

})(window.App = window.App || {});
