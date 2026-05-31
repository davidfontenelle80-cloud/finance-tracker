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

  // ── PWA Install Banner ────────────────────────────────────
  let _deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    _deferredInstallPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    // Don't show if already installed or dismissed
    if (localStorage.getItem('pwa_install_dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    var banner = document.createElement('div');
    banner.id = 'pwa-banner';
    banner.style.cssText = [
      'position:fixed','bottom:70px','left:12px','right:12px',
      'background:var(--card-bg,#0f1629)','border:1px solid var(--neon-cyan)',
      'border-radius:12px','padding:12px 14px','z-index:9999',
      'display:flex','align-items:center','gap:10px',
      'box-shadow:0 4px 20px rgba(0,240,255,0.15)'
    ].join(';');
    banner.innerHTML =
      '<span style="font-size:1.3rem">📲</span>' +
      '<div style="flex:1">' +
        '<div class="text-sm font-bold">Install Finance Tracker</div>' +
        '<div class="text-xs text-secondary">Add to home screen for offline use</div>' +
      '</div>' +
      '<button id="pwa-install-btn" class="btn btn--primary btn--sm">Install</button>' +
      '<button id="pwa-dismiss-btn" class="btn btn--secondary btn--sm">✕</button>';
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', function() {
      if (_deferredInstallPrompt) {
        _deferredInstallPrompt.prompt();
        _deferredInstallPrompt.userChoice.then(function() {
          _deferredInstallPrompt = null;
          banner.remove();
        });
      }
    });
    document.getElementById('pwa-dismiss-btn').addEventListener('click', function() {
      localStorage.setItem('pwa_install_dismissed', '1');
      banner.remove();
    });
  }

  // iOS install hint (no beforeinstallprompt on iOS)
  function showIOSInstallHint() {
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var isStandalone = window.navigator.standalone;
    var dismissed = localStorage.getItem('ios_install_dismissed');
    if (!isIOS || isStandalone || dismissed) return;

    var hint = document.createElement('div');
    hint.id = 'ios-hint';
    hint.style.cssText = 'position:fixed;bottom:70px;left:12px;right:12px;background:var(--card-bg,#0f1629);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:12px 14px;z-index:9999;font-size:0.82rem';
    hint.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<strong>📲 Install on iPhone</strong>' +
        '<button id="ios-hint-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:1rem">✕</button>' +
      '</div>' +
      '<div class="text-secondary">Tap <strong>Share ↑</strong> then <strong>Add to Home Screen</strong> to install offline.</div>';
    document.body.appendChild(hint);
    document.getElementById('ios-hint-close').addEventListener('click', function() {
      localStorage.setItem('ios_install_dismissed', '1');
      hint.remove();
    });
  }



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
    goals: () => {
      if (App.Goals) App.Goals.render(_state, el('tab-goals'));
      else renderStub('tab-goals', 'Goals', 'Coming Soon',
        'Vault savings targets and yearly spending goal progress.');
    },
    calendar: () => {
      if (App.Calendar) App.Calendar.render(_state, el('tab-calendar'));
      else renderStub('tab-calendar', 'Calendar', 'Coming Soon',
        'Full-year calendar with payday highlights and OT tracker.');
    },
    dashboard: () => {
      if (App.Dashboard) App.Dashboard.render(_state, el('tab-dashboard'));
      else renderStub('tab-dashboard', 'Dashboard', 'Phase 3',
        'Net worth tracker and 12-month charts.');
    },
    settings: () => {
      // Settings tab = lightweight: theme, export/import, force update only
      const container = el('tab-settings');
      container.innerHTML = '';
      App.Setup.renderSettings(_state, container);
    },
    setup: () => {
      // Setup tab = full configuration: categories, accounts, income, budget rules, weekly items
      App.Setup.render(_state, el('tab-setup'));
    },
    'paycheck-tracker': () => {
      if (App.PaycheckTracker) App.PaycheckTracker.render(_state, el('tab-paycheck-tracker'));
      else renderStub('tab-paycheck-tracker', 'Paycheck Tracker', 'Loading...', '');
    },
    // savings-plan tab removed — challenges consolidated into Goals tab

    'next-year': () => {
      if (App.NextYearPlanner) App.NextYearPlanner.render(_state, el('tab-next-year'));
      else renderStub('tab-next-year', 'Next Year Planner', 'Loading...', '');
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


  // ── Modal API ─────────────────────────────────────────────
  function showModal(html) {
    var bd = document.getElementById('modal-backdrop');
    var mc = document.getElementById('modal-content');
    if (!bd || !mc) return;
    mc.innerHTML = html;
    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');
    // Close on backdrop click
    bd.onclick = function(e) { if (e.target === bd) closeModal(); };
  }

  function closeModal() {
    var bd = document.getElementById('modal-backdrop');
    var mc = document.getElementById('modal-content');
    if (bd) { bd.classList.add('hidden'); bd.setAttribute('aria-hidden', 'true'); bd.onclick = null; }
    if (mc) mc.innerHTML = '';
  }

  App.showToast         = showToast;
  App.showModal         = showModal;
  App.closeModal        = closeModal;
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

    // 1c. Auto-reset subscription paid flags on new month
    (function() {
      var thisMonth = new Date().toISOString().slice(0,7);
      var lastSave  = _state.lastSaveDate || null;
      if (lastSave && lastSave !== thisMonth && _state.subscriptions) {
        _state.subscriptions.forEach(function(s) { s.paid = false; });
        App.Storage.saveState(_state);
        console.log('[App] New month — subscription paid flags reset.');
      }
    })();

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
    const REACTIVE_TABS = ['accounts', 'dashboard', 'planner', 'tracker'];
    App.events.on('state:changed', function() {
      REACTIVE_TABS.forEach(refreshTabIfVisible);
    });

    // 3b. iOS keyboard — shrink modal when keyboard appears
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function() {
        var box = document.querySelector('.modal-box');
        if (!box) return;
        var kbHeight = window.innerHeight - window.visualViewport.height;
        if (kbHeight > 100) {
          box.classList.add('keyboard-open');
          // Scroll focused input into view after a brief delay
          setTimeout(function() {
            var focused = box.querySelector('input:focus, textarea:focus, select:focus');
            if (focused) focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 150);
        } else {
          box.classList.remove('keyboard-open');
        }
      });
    }

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

// ── Setup Wizard (injected at end of app.js) ──────────────
// Shows on first open when no data exists yet.
(function(App) {
  'use strict';

  function needsSetup(state) {
    if (!state) return true;
    var bank  = (state.accounts && state.accounts.bank)   || [];
    var dates = (state.income && state.income.paydayDates) || [];
    return bank.length === 0 && dates.length === 0;
  }

  function showWizard() {
    var bd = document.getElementById('modal-backdrop');
    var mc = document.getElementById('modal-content');
    if (!bd || !mc) return;

    mc.innerHTML =
      '<div style="padding:8px">' +
        '<div style="text-align:center;margin-bottom:16px">' +
          '<div style="font-size:2.5rem;margin-bottom:6px">💰</div>' +
          '<div style="font-size:1.2rem;font-weight:700">Welcome to Finance Tracker</div>' +
          '<div class="text-secondary text-sm" style="margin-top:4px">Let\'s get you set up in 3 quick steps.</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">' +
          '<div style="text-align:center;padding:10px 6px;background:rgba(0,240,255,0.08);border-radius:8px;border:1px solid var(--neon-cyan)">' +
            '<div style="font-size:1.3rem">💵</div>' +
            '<div class="text-xs font-bold" style="margin-top:4px">1. Income</div>' +
            '<div class="text-xs text-secondary">Payday &amp; amount</div>' +
          '</div>' +
          '<div style="text-align:center;padding:10px 6px;background:var(--surface-2);border-radius:8px">' +
            '<div style="font-size:1.3rem">🏦</div>' +
            '<div class="text-xs font-bold" style="margin-top:4px">2. Accounts</div>' +
            '<div class="text-xs text-secondary">Banks &amp; cards</div>' +
          '</div>' +
          '<div style="text-align:center;padding:10px 6px;background:var(--surface-2);border-radius:8px">' +
            '<div style="font-size:1.3rem">🎯</div>' +
            '<div class="text-xs font-bold" style="margin-top:4px">3. Goals</div>' +
            '<div class="text-xs text-secondary">Savings targets</div>' +
          '</div>' +
        '</div>' +

        '<div style="background:rgba(0,240,255,0.05);border:1px solid rgba(0,240,255,0.2);border-radius:8px;padding:10px 12px;margin-bottom:16px">' +
          '<div class="text-xs text-secondary">' +
            '⚡ Quick start: Go to <strong>Settings → Setup</strong> to configure your income, accounts, and categories.<br><br>' +
            '📱 Works offline on any device. Install it: tap <strong>Share → Add to Home Screen</strong> on iPhone, or the install icon in your browser address bar on PC.' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn--secondary" style="flex:1" id="wizard-skip">Skip for now</button>' +
          '<button class="btn btn--primary" style="flex:1" id="wizard-go">Go to Setup ➜</button>' +
        '</div>' +
      '</div>';

    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');

    document.getElementById('wizard-skip').addEventListener('click', function() {
      localStorage.setItem('wizard_dismissed', '1');
      bd.classList.add('hidden');
      mc.innerHTML = '';
    });
    document.getElementById('wizard-go').addEventListener('click', function() {
      localStorage.setItem('wizard_dismissed', '1');
      bd.classList.add('hidden');
      mc.innerHTML = '';
      App.showTab('settings');
    });
  }

  // Hook into App.init
  var _origInit = App.init;
  App.init = function() {
    _origInit && _origInit.apply(this, arguments);
    if (!localStorage.getItem('wizard_dismissed')) {
      var state = App.Storage.loadState();
      if (needsSetup(state)) {
        setTimeout(showWizard, 600);
      }
    }
  };

})(window.App = window.App || {});
