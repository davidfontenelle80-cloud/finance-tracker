/* ══════════════════════════════════════════════════════════════
   INVESTMENTS.JS — Holdings + Roth Contribution Tracker
   Tab 6: View/edit investment accounts.
   CRITICAL: Add/edit/delete holdings by unique ID — no other
   holding is affected by changes to a single one.
   Manual price entry only (no live API).
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function(k) { return App.Lang ? App.Lang.t(k) : k; };

  const fmt = (n) => App.Storage.formatCurrency(n);

  // Which account tab is active (module-level)
  let _activeAccountIdx = 0;

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(container, state);
  }

  // ── HTML ──────────────────────────────────────────────────
  function buildHtml(state) {
    const inv      = state.investments || { accounts: [] };
    const accounts = inv.accounts || [];

    if (!accounts.length) {
      return `<div class="stub-container">
        <div class="stub-icon">📈</div>
        <h2>No Investment Accounts</h2>
        <p>Investment accounts are pre-configured with your Roth IRA holdings. If you see this, re-load the app.</p>
      </div>`;
    }

    // Clamp active index
    if (_activeAccountIdx >= accounts.length) _activeAccountIdx = 0;
    const acct = accounts[_activeAccountIdx];

    // Account selector tabs
    const acctTabs = accounts.map((a, i) => `
      <button class="tab-btn ${i === _activeAccountIdx ? 'active' : ''}"
              data-action="switch-account" data-idx="${i}"
              style="font-size:0.75rem;min-width:auto;padding:0 14px">
        ${esc(a.name)}
      </button>`).join('');

    return `
      <!-- Contribution progress (all accounts) -->
      ${renderContributions(accounts)}

      <!-- Account selector -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--card-radius);display:flex;overflow-x:auto;margin-bottom:16px;scrollbar-width:none">
        ${acctTabs}
        <button class="tab-btn" data-action="add-account"
                style="font-size:0.75rem;min-width:auto;padding:0 14px;color:var(--neon-cyan)">
          + Account
        </button>
      </div>

      <!-- Selected account -->
      ${renderAccount(acct)}
    `;
  }

  // ── Contribution progress ─────────────────────────────────
  function renderContributions(accounts) {
    const items = accounts.map(a => {
      const pct   = a.annualGoal > 0 ? Math.min(100, (a.ytdContribution / a.annualGoal) * 100) : 0;
      const color = pct >= 100 ? 'green' : pct >= 50 ? 'cyan' : 'amber';
      return `
        <div style="margin-bottom:12px">
          <div class="flex-between mb-4">
            <span class="text-sm font-bold">${esc(a.name)}</span>
            <span class="font-mono text-sm">
              <span class="text-${color}">${fmt(a.ytdContribution)}</span>
              <span class="text-secondary"> / ${fmt(a.annualGoal)}</span>
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--${color}" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="flex-between mt-4">
            <span class="text-xs text-secondary">${pct.toFixed(0)}% of annual goal</span>
            <span class="text-xs text-secondary">Remaining: ${fmt(Math.max(0, a.annualGoal - a.ytdContribution))}</span>
          </div>
        </div>`;
    }).join('');

    const totalContrib = accounts.reduce((s, a) => s + (Number(a.ytdContribution) || 0), 0);
    const totalGoal    = accounts.reduce((s, a) => s + (Number(a.annualGoal) || 0), 0);

    return `
      <details class="card card--glow-magenta" open>
        <summary>
          <div>
            <div class="card-title">💰 Contributions YTD</div>
            <div class="card-subtitle">${fmt(totalContrib)} of ${fmt(totalGoal)} combined</div>
          </div>
        </summary>
        <div>${items}</div>
      </details>`;
  }

  // ── Single account view ───────────────────────────────────
  function renderAccount(acct) {
    const holdings = acct.holdings || [];

    // Calculate values
    const holdingsWithCalc = holdings.map(h => ({
      ...h,
      value:      round2((h.shares || 0) * (h.price || 0)),
      actualPct:  0  // filled below
    }));
    const totalValue = holdingsWithCalc.reduce((s, h) => s + h.value, 0);
    holdingsWithCalc.forEach(h => {
      h.actualPct = totalValue > 0 ? round2((h.value / totalValue) * 100) : 0;
    });

    const rows = holdingsWithCalc.map(h => {
      const drift      = round2(h.actualPct - (h.targetPct || 0));
      const driftClass = Math.abs(drift) < 2 ? 'text-green'
                       : Math.abs(drift) < 5 ? 'text-amber'
                       : 'text-red';
      return `
        <tr>
          <td class="font-bold font-mono">${esc(h.ticker)}</td>
          <td class="text-right font-mono">${(h.shares || 0).toFixed(4)}</td>
          <td class="text-right">
            <input type="number" class="price-input" data-id="${h.id}"
                   value="${h.price || 0}" min="0" step="0.01"
                   style="width:80px;padding:4px 8px;min-height:32px;text-align:right" />
          </td>
          <td class="text-right font-mono text-cyan">${fmt(h.value)}</td>
          <td class="text-right">${(h.targetPct || 0).toFixed(0)}%</td>
          <td class="text-right font-mono ${driftClass}">
            ${h.actualPct.toFixed(1)}%
            <span class="text-xs">(${drift >= 0 ? '+' : ''}${drift.toFixed(1)})</span>
          </td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn btn--secondary btn--sm btn--icon" data-action="edit-holding"
                      data-acct-idx="${_activeAccountIdx}" data-id="${h.id}" title="Edit">✎</button>
              <button class="btn btn--danger btn--sm btn--icon"    data-action="del-holding"
                      data-acct-idx="${_activeAccountIdx}" data-id="${h.id}" title="Delete">✕</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card">
        <div class="flex-between mb-12">
          <div>
            <div class="card-title">${esc(acct.name)}</div>
            <div class="card-subtitle">${holdings.length} holdings · ${fmt(totalValue)} total</div>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="edit-contribution"
                  data-acct-idx="${_activeAccountIdx}">
            + Contribution
          </button>
        </div>

        ${holdings.length ? `
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th style="text-align:right">Shares</th>
                  <th style="text-align:right">Price</th>
                  <th style="text-align:right">Value</th>
                  <th style="text-align:right">Target%</th>
                  <th style="text-align:right">Actual%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="3" class="font-bold text-secondary text-xs">TOTAL</td>
                  <td class="font-mono font-bold text-cyan text-right">${fmt(totalValue)}</td>
                  <td class="font-mono text-right text-secondary">
                    ${holdingsWithCalc.reduce((s,h) => s + (h.targetPct||0), 0).toFixed(0)}%
                  </td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <button class="btn btn--secondary btn--sm mt-12" data-action="update-prices"
                  data-acct-idx="${_activeAccountIdx}">
            Save Prices
          </button>
        ` : '<p class="text-secondary text-sm">No holdings yet. Add one below.</p>'}

        <button class="btn btn--primary btn--sm mt-12" data-action="add-holding"
                data-acct-idx="${_activeAccountIdx}">
          + Add Holding
        </button>
      </div>`;
  }

  // ── Modal helpers ─────────────────────────────────────────
  function openModal(html, onSubmit) {
    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    mc.innerHTML = html;
    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');
    mc.querySelector('[data-action="modal-close"]')?.addEventListener('click', closeModal);
    mc.querySelector('[data-action="modal-submit"]')?.addEventListener('click', () => onSubmit(mc));
    bd.addEventListener('click', function h(e) { if (e.target === bd) { closeModal(); bd.removeEventListener('click', h); } });
    const fi = mc.querySelector('input');
    if (fi) setTimeout(() => fi.focus(), 50);
  }

  function closeModal() {
    const bd = document.getElementById('modal-backdrop');
    bd.classList.add('hidden');
    bd.setAttribute('aria-hidden', 'true');
    document.getElementById('modal-content').innerHTML = '';
  }

  // ── Events ────────────────────────────────────────────────
  function wireEvents(container, state) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, acctIdx, id } = btn.dataset;
      const aIdx = parseInt(acctIdx ?? _activeAccountIdx, 10);

      switch (action) {

        case 'switch-account':
          _activeAccountIdx = parseInt(btn.dataset.idx, 10);
          App.refreshCurrentTab();
          break;

        case 'add-holding':
          openHoldingModal(null, aIdx);
          break;

        case 'edit-holding': {
          const ns = App.getState();
          const h  = ns.investments.accounts[aIdx]?.holdings.find(x => x.id === id);
          if (h) openHoldingModal(h, aIdx);
          break;
        }

        case 'del-holding': {
          if (!confirm('Delete this holding?')) break;
          const ns = App.getState();
          const a  = ns.investments.accounts[aIdx];
          if (a) a.holdings = a.holdings.filter(h => h.id !== id);
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast('Holding deleted.', 'info');
          break;
        }

        case 'update-prices': {
          // Read all price inputs for current account and save
          const ns    = App.getState();
          const acct  = ns.investments.accounts[aIdx];
          if (!acct) break;
          container.querySelectorAll('.price-input').forEach(inp => {
            const hId  = inp.dataset.id;
            const hidx = acct.holdings.findIndex(h => h.id === hId);
            if (hidx !== -1) acct.holdings[hidx].price = parseFloat(inp.value) || 0;
          });
          App.setState(ns);
          App.showToast('Prices saved ✓', 'success');
          App.refreshCurrentTab();
          break;
        }

        case 'edit-contribution':
          openContribModal(aIdx);
          break;

        case 'add-account':
          openAddAccountModal();
          break;
      }
    });
  }

  function openHoldingModal(existing, acctIdx) {
    const isNew = !existing;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">${isNew ? 'Add' : 'Edit'} Holding</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ticker</label>
          <input type="text" id="m-ticker" value="${existing ? esc(existing.ticker) : ''}" placeholder="VOO" style="text-transform:uppercase" />
        </div>
        <div class="form-group">
          <label>Shares</label>
          <input type="number" id="m-shares" value="${existing ? existing.shares : 0}" min="0" step="0.0001" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Current Price ($)</label>
          <input type="number" id="m-price" value="${existing ? existing.price : 0}" min="0" step="0.01" />
        </div>
        <div class="form-group">
          <label>Target % <span class="text-dim">(of account)</span></label>
          <input type="number" id="m-target" value="${existing ? existing.targetPct : 0}" min="0" max="100" step="1" />
        </div>
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">
        ${isNew ? 'Add Holding' : 'Save Changes'}
      </button>
    `, mc => {
      const ticker  = mc.querySelector('#m-ticker').value.trim().toUpperCase();
      const shares  = parseFloat(mc.querySelector('#m-shares').value) || 0;
      const price   = parseFloat(mc.querySelector('#m-price').value)  || 0;
      const target  = parseFloat(mc.querySelector('#m-target').value) || 0;
      if (!ticker) { App.showToast('Ticker required.', 'error'); return; }

      const ns   = App.getState();
      const acct = ns.investments.accounts[acctIdx];
      if (!acct) { App.showToast('Account not found.', 'error'); return; }

      if (isNew) {
        acct.holdings.push({ id: App.Storage.generateId(), ticker, shares, price, targetPct: target });
      } else {
        const idx = acct.holdings.findIndex(h => h.id === existing.id);
        if (idx !== -1) Object.assign(acct.holdings[idx], { ticker, shares, price, targetPct: target });
      }
      App.setState(ns);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`${ticker} ${isNew ? 'added' : 'updated'} ✓`, 'success');
    });
  }

  function openContribModal(acctIdx) {
    const acct = App.getState().investments.accounts[acctIdx];
    if (!acct) return;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Contribution — ${esc(acct.name)}</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <p class="text-secondary text-sm mb-12">
        YTD contributions: <strong>${fmt(acct.ytdContribution)}</strong> of ${fmt(acct.annualGoal)}
      </p>
      <div class="form-group">
        <label>Add Contribution ($)</label>
        <input type="number" id="m-contrib" value="0" min="0" step="0.01" />
      </div>
      <div class="form-group">
        <label>Override YTD Total ($) <span class="text-dim">(optional)</span></label>
        <input type="number" id="m-ytd" placeholder="${acct.ytdContribution}" min="0" step="0.01" />
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Save</button>
    `, mc => {
      const add      = parseFloat(mc.querySelector('#m-contrib').value) || 0;
      const override = mc.querySelector('#m-ytd').value.trim();
      const ns       = App.getState();
      const a        = ns.investments.accounts[acctIdx];
      if (!a) return;
      if (override !== '') {
        a.ytdContribution = parseFloat(override) || 0;
      } else {
        a.ytdContribution = (a.ytdContribution || 0) + add;
      }
      App.setState(ns);
      closeModal();
      App.refreshCurrentTab();
      App.showToast('Contribution saved ✓', 'success');
    });
  }

  function openAddAccountModal() {
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Add Investment Account</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label>Account Name</label>
        <input type="text" id="m-acct-name" placeholder="e.g. Taxable Brokerage" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Annual Contribution Goal ($)</label>
          <input type="number" id="m-acct-goal" value="0" min="0" step="1" />
        </div>
        <div class="form-group">
          <label>YTD Contributions ($)</label>
          <input type="number" id="m-acct-ytd" value="0" min="0" step="0.01" />
        </div>
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Add Account</button>
    `, mc => {
      const name = mc.querySelector('#m-acct-name').value.trim();
      const goal = parseFloat(mc.querySelector('#m-acct-goal').value) || 0;
      const ytd  = parseFloat(mc.querySelector('#m-acct-ytd').value)  || 0;
      if (!name) { App.showToast('Account name required.', 'error'); return; }
      const ns = App.getState();
      if (!ns.investments)          ns.investments = { accounts: [] };
      if (!ns.investments.accounts) ns.investments.accounts = [];
      ns.investments.accounts.push({ id: App.Storage.generateId(), name, holdings: [], ytdContribution: ytd, annualGoal: goal });
      _activeAccountIdx = ns.investments.accounts.length - 1;
      App.setState(ns);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`"${name}" added ✓`, 'success');
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  function round2(n)  { return Math.round(n * 100) / 100; }
  function esc(s)     { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  App.Investments = { render };

})(window.App = window.App || {});
