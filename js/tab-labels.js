(function (window) {
  "use strict";

  var App = window.App = window.App || {};

  function labelFor(tab) {
    if (tab === "accounts") return "Banking";
    if (tab === "import") return "Excel Import";
    return "";
  }

  function setLabels() {
    Array.prototype.forEach.call(document.querySelectorAll(".tab-btn"), function (btn) {
      var text = labelFor(btn.getAttribute("data-tab"));
      var label = btn.querySelector(".tab-label");
      if (text && label) label.textContent = text;
    });
    var bankingPane = document.getElementById("tab-accounts");
    if (bankingPane) bankingPane.setAttribute("aria-label", "Banking");
    var importPane = document.getElementById("tab-import");
    if (importPane) importPane.setAttribute("aria-label", "Excel Import");
  }

  function install() {
    setLabels();
    if (!App.Dashboard || !App.Dashboard.render || App.Dashboard.__tabLabelPatched) return;
    var original = App.Dashboard.render;
    App.Dashboard.render = function () {
      var result = original.apply(App.Dashboard, arguments);
      setLabels();
      return result;
    };
    App.Dashboard.__tabLabelPatched = true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})(window);
