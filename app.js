/* ══════════════════════════════════════════════════════════════
   APP.JS — Router, Bootstrap & Event Bus
   Boots the app: loads state, wires tab nav, routes to renderers.
   Must load last (after all module files).

   Public API:
     App.getState()             → current state (read-only ref)
     App.setState(newState)     → save + persist + emit state:changed
     App.showToast(msg, type)   → bottom toast notification
     App.showTab(name)          → switch to named tab
     App.refreshCurrentTab()    → re-render the active tab in place
     App.events.on(event, fn)   → subscribe to an event
     App.events.emit(event, d)  → fire an event to all subscribers
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  // ── In-memory state ───────────────────────────────────────
  let _state     = null;
  let _activeTab = 'dashboard';

  // ══════════════════════════════════════════════════════════
  // EVENT BUS
  // Lightweight pub/sub so any module can react to data changes
  // without polling or tight coupling.
  //
  // Events emitted by the app:
  //   state:changed        — fires after every setState() call
  //   account:balanceChanged — fires when any account/vault balance changes
  //   paycheck:allocated   — fires after Transfers → Paycheck Execute
  //   card:paid            — fires after Transfers → Pay Cards Execute
  //   vault:funded         — fires after Transfers → Fund Vault Execute
  //   category:goalChanged — fires when a yearly category is edited in Setup
  // ══════════════════════════════════════════════════════════
  App.events = {
    _listeners: {},

    on: function(event, fn) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(fn);
    },

    off: function(event, fn) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(function(f) { return f !== fn; });
    },

    emit: function(event, data) {
      const listeners = this._listeners[event] || [];
      listeners.forEach(function(fn) {
        try { fn(data); } catch(e) { console.error('[App.events] Error in listener for "' + event + '":', e); }
      });
    }
  };

  // ── Tab registry ──────────────────────────────────────────
  const TABS = {
    setup: () => {
      App.Setup.render(_state, el('tab-setup'));
    },
    planner: () => {
      if (App.Paychecks) App.Paychecks.render(_state, el('tab-planner'));
      else renderStub('tab-planner', 'Paycheck Planner', 'Phase 2',
        'Set up your income and categories in Setup first, then come back here.');
    },
    tracker: () => {
      if (App.Tracker) App.Tracker.render(_state, el('tab-tracker'));
      else renderStub('tab-tracker', 'Paycheck Tracker', 'Phase 2',
        'Tracks all 26 pay periods, planned vs actual.');
    },
    entry: () => {
      if (App.Entry) App.Entry.render(_state, el('tab-entry'));
      else renderStub('tab-entry', 'Data Entry', 'Phase 2',
        'Log transactions here. They cascade to every other tab.');
    },
    transfers: () => {
      if (App.Transfers) App.Transfers.render(_state, el('tab-transfers'));
      else renderStub('tab-transfers', 'Transfers', 'Engine Upgrade',
        'Paycheck allocation, card payments, and money movement.');
    },
    accounts: () => {
      if (App.Accounts) App.Accounts.render(_state, el('tab-accounts'));
      else renderStub('tab-accounts', 'Accounts', 'Phase 2',
        'Vaults, bank accounts, and credit cards with the safety-net warning.');
    },
    investments: () => {
      if (App.Investments) App.Investments.render(_state, el('tab-investments'));
      else renderStub('tab-investments', 'Investments', 'Phase 3',
        'Track your Roth IRA holdings and YTD contributions.');
    },
    dashboard: () => {
      if (App.Dashboard) App.Dashboard.render(_state, el('tab-dashboard'));
      else renderStub('tab-dashboard', 'Dashboard', 'Phase 3',
        'Net worth tracker and 12-month charts.');
    },
    settings: () => {
      // Settings = App Settings section + Setup (the brain) as a sub-section
      const container = el('tab-settings');
      container.innerHTML = '';
      // Render the global app settings (import/export/theme/clear)
      App.Setup.renderSettings(_state, container);
      // Append Setup (categories, accounts, income) as a collapsible sub-section
      const setupWrap = document.createElement('div');
      setupWrap.id = 'settings-setup-section';
      container.appendChild(setupWrap);
      App.Setup.render(_state, setupWrap);
    }
  };

  // ── Stub renderer ─────────────────────────────────────────
  function renderStub(id, title, phase, detail) {
    el(id).innerHTML = `
      <div class="stub-container">
        <div class="stub-icon">🚧</div>
        <h2>${title}</h2>
        <p>${detail || ''}</p>
        <p class="text-dim text-xs" style="margin-top:8px;">Coming in ${phase}</p>
      </div>
    `;
  }

  // ── Tab switching ─────────────────────────────────────────
  function showTab(name) {
    if (!TABS[name]) {
      console.warn('[App] Unknown tab:', name);
      return;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === name;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${name}`);
    });

    _activeTab = name;

    try {
      TABS[name]();
    } catch (err) {
      console.error(`[App] Error rendering tab "${name}":`, err);
      el(`tab-${name}`).innerHTML = `
        <div class="stub-container">
          <div class="stub-icon">⚠️</div>
          <h2>Render Error</h2>
          <p class="text-red">${err.message}</p>
          <p class="text-dim text-xs">Check the console for details.</p>
        </div>
      `;
    }

    try { localStorage.setItem('financeApp_activeTab', name); } catch (_) {}

    const pane = el(`tab-${name}`);
    if (pane) pane.scrollTop = 0;
  }

  // ── Reactive tab refresh ──────────────────────────────────
  // Called by the event bus listener below.
  // Re-renders a tab ONLY if it is currently visible,
  // so off-screen tabs stay stale until the user navigates to them.
  function refreshTabIfVisible(tabName) {
    if (_activeTab === tabName && TABS[tabName]) {
      try { TABS[tabName](); } catch(e) { console.error('[App] reactive refresh error:', e); }
    }
  }

  // ── Toast ─────────────────────────────────────────────────
  let _toastTimer = null;
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    if (_toastTimer) clearTimeout(_toastTimer);
    toast.textContent = message;
    toast.className   = `toast toast--${type} toast--visible`;
    _toastTimer = setTimeout(() => {
      toast.classList.remove('toast--visible');
    }, 3000);
  }

  // ── Public state API ──────────────────────────────────────
  App.getState = () => _state;

  App.setState = (newState) => {
    _state = newState;
    App.Storage.saveState(_state);
    // Fire the central event so subscribers (accounts, dashboard, etc.)
    // can react without being directly coupled to each other.
    App.events.emit('state:changed', _state);
  };

  App.showToast         = showToast;
  App.showTab           = showTab;
  App.refreshCurrentTab = () => showTab(_activeTab);

  // ── Helpers ───────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  // ── Bootstrap ─────────────────────────────────────────────
  function initApp() {
    // 0. Restore saved theme before anything renders
    (function() {
      try {
        const t = localStorage.getItem('financeApp_theme') || 'dark-neon';
        if (App.Setup && App.Setup.applyTheme) App.Setup.applyTheme(t);
      } catch(_) {}
    })();

    // 1. Load state
    _state = App.Storage.loadState();

    // 1b. Init language engine
    if (App.Lang) {
      var savedLang = (_state.settings && _state.settings.lang) || 'en';
      App.Lang._lang = savedLang; // set before init to avoid extra render
      App.Lang.init();
    }

    // 2. Wire tab nav
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });

    // 3. Subscribe to state:changed — refresh any visible reactive tab
    //    Tabs that need live updates list themselves here.
    const REACTIVE_TABS = ['accounts', 'dashboard', 'tracker', 'planner'];
    App.events.on('state:changed', function() {
      REACTIVE_TABS.forEach(refreshTabIfVisible);
    });

    // 4. Restore last tab
    const lastTab = (() => {
      try { return localStorage.getItem('financeApp_activeTab') || 'dashboard'; }
      catch (_) { return 'setup'; }
    })();
    showTab(lastTab);

    // 5. Service worker (PWA offline)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // sw.js not present in dev — silently skip
      });
    }

    console.log('[App] Finance Tracker v1.1 — Engine Upgrade loaded.');
  }

  document.addEventListener('DOMContentLoaded', initApp);

})(window.App = window.App || {});
