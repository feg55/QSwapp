(function initializeTheme(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LayoutFixerTheme = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTheme() {
  "use strict";

  function resolveTheme(preference, view = globalThis) {
    if (preference === "light" || preference === "dark") {
      return preference;
    }

    return view?.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function applyTheme(
    preference,
    documentObject = globalThis.document,
    view = documentObject?.defaultView ?? globalThis
  ) {
    const normalized = ["dark", "light", "system"].includes(preference)
      ? preference
      : "dark";
    const resolved = resolveTheme(normalized, view);

    if (documentObject?.documentElement?.dataset) {
      documentObject.documentElement.dataset.theme = resolved;
      documentObject.documentElement.dataset.themePreference = normalized;
    }

    return resolved;
  }

  return { applyTheme, resolveTheme };
});
