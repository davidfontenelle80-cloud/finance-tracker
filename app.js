(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  const CLOUD_APP_ID = "finance-tracker";
  const CLOUD_KEYS = ["financeDashboard_v1"];
  let state = null;
  let activeView = "dashboard";
  let cloudUser = null;
  let cloudSaveTimer = null;

  const views = {
    dashboard: "tab-dashboard",
    paycheck: "tab-paycheck",
    accounts: "tab-accounts",
    changes: "tab-changes",
    sync: "tab-sync",
    settings: "tab-settings",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function save(nextState) {
    state = nextState;
    App.Storage.saveState(state);
    render();
    scheduleCloudSave();
  }

  function showToast(message, type) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast--${type || "success"} toast--visible`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("toast--visible"), 2800);
  }

  function showView(view) {
    activeView = views[view] ? view : "dashboard";
    Object.entries(views).forEach(([key, paneId]) => {
      const pane = $(paneId);
      if (pane) pane.classList.toggle("active", key === activeView);
    });
    document.querySelectorAll(".tab-btn").forEach((button) => {
      const isActive = button.dataset.tab === activeView;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    render();
    try {
      localStorage.setItem("finance_dashboard_active_view", activeView);
    } catch (err) {}
  }

  function render() {
    if (!state) return;
    App.Dashboard.render(state, {
      activeView,
      save,
      showToast,
      showView,
      cloudStatus: getCloudStatus(),
      cloudAccount,
      cloudSave,
      cloudRestore,
    });
  }

  function applyTheme() {
    const theme = (state && state.settings && state.settings.theme) || "dark";
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
  }

  App.getState = () => state;
  App.setState = save;
  App.showToast = showToast;
  App.showTab = showView;
  App.refreshCurrentTab = render;

  function cloudReady() {
    return !!(window.KHub && KHub.CloudBackup && KHub.CloudAuth);
  }

  function formatCloudDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function getCloudStatus() {
    const lastSaved = cloudReady() ? KHub.CloudBackup.lastSaved(CLOUD_APP_ID) : "";
    return {
      ready: cloudReady(),
      signedIn: !!cloudUser,
      email: cloudUser && cloudUser.email ? cloudUser.email : "",
      lastSaved: formatCloudDate(lastSaved),
    };
  }

  async function ensureCloudAccount() {
    if (!cloudReady()) {
      showToast("Cloud backup is still loading. Try again in a moment.", "error");
      return false;
    }
    if (KHub.CloudBackup.isSignedIn()) return true;
    const result = await KHub.CloudAuth.openDialog("signin");
    return !!result || KHub.CloudBackup.isSignedIn();
  }

  function reloadLocalState() {
    state = App.Storage.loadState();
    applyTheme();
    render();
  }

  async function restoreLatestIfNewer(source) {
    if (!cloudReady() || !KHub.CloudBackup.isSignedIn()) return false;
    const restored = await KHub.CloudBackup.restoreLatestIfNewer(CLOUD_APP_ID, CLOUD_KEYS, null, reloadLocalState);
    if (restored) showToast(source === "signin" ? "Latest cloud backup restored" : "Cloud data refreshed", "success");
    return restored;
  }

  async function cloudAccount() {
    if (!cloudReady()) return showToast("Cloud backup is not ready yet.", "error");
    if (KHub.CloudBackup.isSignedIn()) {
      const email = cloudUser && cloudUser.email ? cloudUser.email : "this cloud account";
      if (!confirm(`Signed in as ${email}. Sign out of cloud backup on this device?`)) return;
      await KHub.CloudAuth.signOut();
      cloudUser = null;
      render();
      showToast("Signed out of cloud backup", "success");
      return;
    }
    const signedIn = await ensureCloudAccount();
    if (signedIn) {
      await restoreLatestIfNewer("signin");
      render();
    }
  }

  async function cloudSave() {
    try {
      if (!(await ensureCloudAccount())) return;
      App.Storage.saveState(state);
      await KHub.CloudBackup.save(CLOUD_APP_ID, CLOUD_KEYS, null);
      render();
      showToast("Cloud save complete", "success");
    } catch (err) {
      const message = KHub.CloudAuth && KHub.CloudAuth.authMessage ? KHub.CloudAuth.authMessage(err) : err.message;
      showToast(message || "Cloud save failed", "error");
      console.error("[Finance Dashboard] cloud save failed:", err);
    }
  }

  async function cloudRestore() {
    try {
      if (!(await ensureCloudAccount())) return;
      await KHub.CloudBackup.restore(CLOUD_APP_ID, CLOUD_KEYS, null, reloadLocalState);
      reloadLocalState();
      showToast("Cloud restore complete", "success");
    } catch (err) {
      const message = err && err.message === "no-backup"
        ? "No cloud backup found for this account yet."
        : KHub.CloudAuth && KHub.CloudAuth.authMessage ? KHub.CloudAuth.authMessage(err) : err.message;
      showToast(message || "Cloud restore failed", "error");
      console.error("[Finance Dashboard] cloud restore failed:", err);
    }
  }

  function scheduleCloudSave() {
    if (!cloudReady() || !KHub.CloudBackup.isSignedIn()) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      KHub.CloudBackup.save(CLOUD_APP_ID, CLOUD_KEYS, null)
        .then(() => render())
        .catch((err) => console.warn("[Finance Dashboard] background cloud save failed:", err));
    }, 1800);
  }

  function initCloud() {
    if (!cloudReady()) return;
    KHub.CloudAuth.onChange(async (user) => {
      cloudUser = user || null;
      render();
      if (user) await restoreLatestIfNewer("signin");
      render();
    });
    KHub.CloudBackup.autoSave(CLOUD_APP_ID, CLOUD_KEYS, null);
  }

  document.addEventListener("DOMContentLoaded", () => {
    state = App.Storage.loadState();
    applyTheme();

    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.tab));
    });

    const importInput = $("json-import");
    if (importInput) {
      importInput.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const imported = await App.Storage.importJSON(file);
          state = App.Storage.mergeImportedState(state, imported);
          App.Storage.saveState(state);
          showToast("Dashboard updated from JSON", "success");
          render();
        } catch (err) {
          showToast(err.message || "Import failed", "error");
        } finally {
          event.target.value = "";
        }
      });
    }

    const last = (() => {
      try {
        return localStorage.getItem("finance_dashboard_active_view") || "dashboard";
      } catch (err) {
        return "dashboard";
      }
    })();
    showView(last);
    initCloud();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  });
})(window);
