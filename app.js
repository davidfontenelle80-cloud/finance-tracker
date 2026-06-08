(function (window) {
  "use strict";

  const App = (window.App = window.App || {});
  let state = null;
  let activeView = "dashboard";

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

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  });
})(window);
