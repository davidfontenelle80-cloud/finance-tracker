/* ═══════════════════════════════════════════════════════════
   CALENDAR.JS — Full-Year Calendar + OT Hours Tracker
   Mirrors the Calendar sheet from House_Budgetper.xlsx.
   - 12-month grid, payday dates auto-highlighted
   - Tap any date to add Vacation / Asamblea / Note events
   - OT Hours tracker: two periods, 30-hour threshold flag
═══════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const fmt = (n) => App.Storage.formatCurrency(n);

  let _year = new Date().getFullYear();

  const DAY_NAMES   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  const EVENT_TYPES = {
    vacation: { label: 'Vacation',  color: '#F59E0B', bg: 'rgba(245,158,11,0.18)'  },
    asamblea: { label: 'Asamblea',  color: '#8B5CF6', bg: 'rgba(139,92,246,0.18)'  },
    note:     { label: 'Note',      color: '#64748B', bg: 'rgba(100,116,139,0.18)' }
  };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function toISO(y, m, d) {
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  // ── Entry point ──────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(container, state);
  }

  // ── Main HTML ────────────────────────────────────────────
  function buildHtml(state) {
    const paydaySet = new Set((state.income && state.income.paydayDates) || []);
    const events    = state.calendarEvents || [];
    const eventMap  = {};  // date -> [events]
    events.forEach(e => {
      if (!eventMap[e.date]) eventMap[e.date] = [];
      eventMap[e.date].push(e);
    });

    const months = Array.from({ length: 12 }, (_, i) =>
      buildMonth(state, _year, i + 1, paydaySet, eventMap)
    ).join('');

    const legend = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px 0 4px;font-size:0.75rem">
        <span style="display:flex;align-items:center;gap:4px">
          <span style="width:12px;height:12px;border-radius:50%;background:var(--blue);display:inline-block"></span> Payday
        </span>
        ${Object.entries(EVENT_TYPES).map(([k, v]) => `
          <span style="display:flex;align-items:center;gap:4px">
            <span style="width:12px;height:12px;border-radius:50%;background:${v.color};display:inline-block"></span>
            ${v.label}
          </span>`).join('')}
        <span style="display:flex;align-items:center;gap:4px">
          <span style="width:12px;height:12px;border-radius:50%;background:var(--accent);display:inline-block"></span> Today
        </span>
      </div>`;

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <button class="btn btn--secondary btn--sm" data-action="cal-prev-year">&#8249;</button>
        <div style="text-align:center">
          <div style="font-size:1.1rem;font-weight:700">${_year} Calendar</div>
        </div>
        <button class="btn btn--secondary btn--sm" data-action="cal-next-year">&#8250;</button>
      </div>
      <div class="card" style="padding:10px 12px 4px">
        ${legend}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:8px;margin-top:8px">
        ${months}
      </div>
      ${buildOTSection(state)}
    `;
  }

  // ── Month grid ───────────────────────────────────────────
  function buildMonth(state, year, month, paydaySet, eventMap) {
    const today    = App.Storage.toISODate(new Date());
    const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month, 0).getDate();

    const dayHeaders = DAY_NAMES.map(d =>
      `<div style="text-align:center;font-size:0.65rem;font-weight:700;color:var(--text-dim);padding:2px 0">${d}</div>`
    ).join('');

    // Blank cells for days before the 1st
    const blanks = Array.from({ length: firstDay }, () =>
      `<div></div>`
    ).join('');

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day  = i + 1;
      const iso  = toISO(year, month, day);
      const isToday   = iso === today;
      const isPayday  = paydaySet.has(iso);
      const dayEvents = eventMap[iso] || [];

      // Determine cell background/border
      let bg = 'transparent', border = '1px solid transparent', textColor = 'inherit';
      if (isToday)  { bg = 'var(--accent)'; textColor = '#000'; border = 'none'; }
      else if (isPayday) { bg = 'rgba(59,130,246,0.22)'; border = '1px solid rgba(59,130,246,0.5)'; }
      else if (dayEvents.length) {
        const t = EVENT_TYPES[dayEvents[0].type] || EVENT_TYPES.note;
        bg = t.bg; border = `1px solid ${t.color}40`;
      }

      // Dot indicators for events
      const dots = dayEvents.map(e => {
        const t = EVENT_TYPES[e.type] || { color: '#94A3B8', bg: 'rgba(148,163,184,0.18)', label: e.customType || e.type };
        return `<span style="width:4px;height:4px;border-radius:50%;background:${t.color};display:inline-block;margin:0 1px" title="${esc(e.label || e.type)}"></span>`;
      }).join('');

      return `
        <div data-action="cal-day-click" data-date="${iso}"
             style="position:relative;text-align:center;padding:4px 2px;border-radius:6px;cursor:pointer;
                    background:${bg};border:${border};color:${textColor};
                    min-height:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;
                    transition:background 0.1s"
             title="${iso}${isPayday ? ' · Payday' : ''}${dayEvents.map(e => ' · ' + (e.label || e.type)).join('')}">
          <div style="font-size:0.75rem;font-weight:${isToday || isPayday ? '700' : '400'}">${day}</div>
          ${dots ? `<div style="display:flex;justify-content:center;gap:1px;margin-top:1px">${dots}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="card" style="padding:10px 12px">
        <div style="font-weight:700;font-size:0.85rem;margin-bottom:8px;color:var(--text)">${MONTH_NAMES[month-1]}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
          ${dayHeaders}${blanks}${days}
        </div>
      </div>`;
  }

  // ── OT Hours section ─────────────────────────────────────
  function buildOTSection(state) {
    const log = state.otHours || [];
    const p1  = log.filter(e => e.period === 1);
    const p2  = log.filter(e => e.period === 2);
    const t1  = p1.reduce((s, e) => s + (Number(e.hours) || 0), 0);
    const t2  = p2.reduce((s, e) => s + (Number(e.hours) || 0), 0);

    function periodBadge(total) {
      if (total >= 30) return `<span class="badge" style="background:rgba(16,185,129,0.2);color:var(--accent);margin-left:6px">✓ 30+ hrs</span>`;
      return `<span class="badge" style="background:rgba(245,158,11,0.15);color:var(--amber);margin-left:6px">${(30 - total).toFixed(1)} hrs to go</span>`;
    }

    function periodRows(entries) {
      if (!entries.length) return '<tr><td colspan="3" class="text-dim text-xs">No entries yet</td></tr>';
      return entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => `
        <tr>
          <td class="text-xs text-secondary">${e.date}</td>
          <td class="font-mono text-right">${Number(e.hours).toFixed(1)} hrs</td>
          <td style="text-align:center">
            <button class="btn btn--icon btn--secondary" style="padding:1px 6px;font-size:0.7rem"
                    data-action="ot-delete" data-id="${e.id}">✕</button>
          </td>
        </tr>`).join('');
    }

    return `
      <div class="card" style="margin-top:8px">
        <div class="card-title" style="margin-bottom:12px">⏱ OT Hours Tracker</div>

        <!-- Add entry form -->
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
          <div class="form-group" style="margin:0;flex:0 0 auto">
            <label class="text-xs text-secondary">Date</label>
            <input type="date" id="ot-date" style="padding:6px 8px;min-height:36px" />
          </div>
          <div class="form-group" style="margin:0;flex:0 0 60px">
            <label class="text-xs text-secondary">Hours</label>
            <input type="number" id="ot-hours" placeholder="8" min="0.5" max="24" step="0.5" inputmode="decimal"
                   style="padding:6px 8px;min-height:36px;width:70px" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="text-xs text-secondary">Period</label>
            <select id="ot-period" style="padding:6px 8px;min-height:36px">
              <option value="1">Period 1</option>
              <option value="2">Period 2</option>
            </select>
          </div>
          <button class="btn btn--primary btn--sm" data-action="ot-add" style="min-height:36px">+ Log OT</button>
        </div>

        <!-- Period grids -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-weight:700;font-size:0.8rem;margin-bottom:6px">
              Period 1 — ${t1.toFixed(1)} hrs ${periodBadge(t1)}
            </div>
            <table class="data-table" style="font-size:0.78rem">
              <thead><tr><th>Date</th><th style="text-align:right">Hours</th><th></th></tr></thead>
              <tbody>${periodRows(p1)}</tbody>
              <tfoot><tr>
                <td class="font-bold text-xs">TOTAL</td>
                <td class="font-mono font-bold text-right ${t1 >= 30 ? 'text-green' : 'text-amber'}">${t1.toFixed(1)}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
          <div>
            <div style="font-weight:700;font-size:0.8rem;margin-bottom:6px">
              Period 2 — ${t2.toFixed(1)} hrs ${periodBadge(t2)}
            </div>
            <table class="data-table" style="font-size:0.78rem">
              <thead><tr><th>Date</th><th style="text-align:right">Hours</th><th></th></tr></thead>
              <tbody>${periodRows(p2)}</tbody>
              <tfoot><tr>
                <td class="font-bold text-xs">TOTAL</td>
                <td class="font-mono font-bold text-right ${t2 >= 30 ? 'text-green' : 'text-amber'}">${t2.toFixed(1)}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      </div>`;
  }

  // ── Events ───────────────────────────────────────────────
  function wireEvents(container, state) {

    // Year navigation
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'cal-prev-year') { _year--; App.refreshCurrentTab(); return; }
      if (action === 'cal-next-year') { _year++; App.refreshCurrentTab(); return; }

      // Day click — add/view event
      if (action === 'cal-day-click') {
        const date = btn.dataset.date;
        openDayModal(date, App.getState()); // always fresh state
        return;
      }

      // Add OT entry
      if (action === 'ot-add') {
        const date   = container.querySelector('#ot-date').value;
        const hours  = parseFloat(container.querySelector('#ot-hours').value) || 0;
        const period = parseInt(container.querySelector('#ot-period').value) || 1;
        if (!date) { App.showToast('Pick a date.', 'error'); return; }
        if (hours <= 0) { App.showToast('Enter hours worked.', 'error'); return; }
        const ns = App.Storage.cloneState(App.getState());
        if (!ns.otHours) ns.otHours = [];
        ns.otHours.push({ id: App.Storage.generateId(), date, hours, period });
        App.setState(ns);
        App.showToast(`${hours} hrs logged ✓`, 'success');
        return;
      }

      // Delete OT entry
      if (action === 'ot-delete') {
        const ns = App.Storage.cloneState(App.getState());
        ns.otHours = (ns.otHours || []).filter(e => e.id !== btn.dataset.id);
        App.setState(ns);
        App.showToast('Entry removed', 'info');
        return;
      }
    });
  }

  // ── Day modal ────────────────────────────────────────────
  function openDayModal(date, state) { // state = App.getState() at click time
    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    if (!bd || !mc) return;

    const existing = (state.calendarEvents || []).filter(e => e.date === date);
    const isPay    = (state.income && state.income.paydayDates || []).includes(date);

    const existList = existing.length
      ? existing.map(e => {
          const t = EVENT_TYPES[e.type] || { color: '#94A3B8', label: e.customType || e.type };
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <div>
              <span style="color:${t.color};font-weight:700;font-size:0.8rem">${e.customType || t.label}</span>
              ${e.label ? `<div class="text-xs text-secondary">${esc(e.label)}</div>` : ''}
            </div>
            <button class="btn btn--icon btn--secondary" style="font-size:0.7rem;padding:1px 6px"
                    data-action="modal-del-event" data-id="${e.id}">✕</button>
          </div>`;
        }).join('')
      : '';

    mc.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${date}${isPay ? ' 💵' : ''}</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      ${isPay ? '<div class="text-xs" style="color:var(--blue);margin-bottom:8px">📅 Payday</div>' : ''}
      ${existList}
      <div class="form-group" style="margin-top:12px">
        <label>Add Event</label>
        <select id="m-evt-type">
          ${Object.entries(EVENT_TYPES).map(([k, v]) =>
            `<option value="${k}">${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Label <span class="text-dim">(optional)</span></label>
        <input type="text" id="m-evt-label" enterkeyhint="done" placeholder="e.g. Spring Assembly" />
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Add Event</button>
    `;

    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');

    mc.querySelector('[data-action="modal-close"]')?.addEventListener('click', closeModal);

    // Show/hide custom type input when "Other" is selected
    const typeSelect = mc.querySelector('#m-evt-type');
    const customWrap = mc.querySelector('#m-custom-type-wrap');
    typeSelect.addEventListener('change', function() {
      customWrap.style.display = this.value === 'other' ? 'block' : 'none';
      if (this.value === 'other') mc.querySelector('#m-evt-custom').focus();
    });

    mc.querySelector('[data-action="modal-submit"]')?.addEventListener('click', () => {
      const typeVal  = mc.querySelector('#m-evt-type').value;
      const custom   = mc.querySelector('#m-evt-custom').value.trim();
      const label    = mc.querySelector('#m-evt-label').value.trim();
      // For "other" type, use the custom text as both type key and display
      const type     = typeVal === 'other' ? (custom || 'note') : typeVal;
      const ns    = App.Storage.cloneState(App.getState());
      if (!ns.calendarEvents) ns.calendarEvents = [];
      // Store custom type name in label if it was an "other" entry
      const finalLabel = typeVal === 'other' && custom ? (label ? custom + ' — ' + label : custom) : label;
      ns.calendarEvents.push({ id: App.Storage.generateId(), date, type, label: finalLabel, customType: typeVal === 'other' ? custom : null });
      App.setState(ns);
      closeModal();
      App.showToast('Event added ✓', 'success');
    });

    mc.querySelectorAll('[data-action="modal-del-event"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ns = App.Storage.cloneState(App.getState());
        ns.calendarEvents = (ns.calendarEvents || []).filter(e => e.id !== btn.dataset.id);
        App.setState(ns);
        closeModal();
        App.showToast('Event removed', 'info');
      });
    });

    bd.addEventListener('click', function h(e) {
      if (e.target === bd) { closeModal(); bd.removeEventListener('click', h); }
    });
  }

  function closeModal() {
    const bd = document.getElementById('modal-backdrop');
    bd.classList.add('hidden');
    bd.setAttribute('aria-hidden', 'true');
    document.getElementById('modal-content').innerHTML = '';
  }

  App.Calendar = { render };

})(window.App = window.App || {});
