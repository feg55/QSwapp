(function initializePopupModule(root, factory) {
  const settingsApi =
    typeof module === "object" && module.exports
      ? require("./settings")
      : root.QswappSettings;
  const themeApi =
    typeof module === "object" && module.exports
      ? require("./theme")
      : root.QswappTheme;
  const i18nApi =
    typeof module === "object" && module.exports
      ? require("./i18n")
      : root.QswappI18n;
  const api = factory(settingsApi, themeApi, i18nApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    api.initializePopup().catch((error) => {
      console.warn("Could not open quick settings:", error);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createPopup(
  settingsApi,
  themeApi,
  i18nApi
) {
  "use strict";

  function browserLanguage(documentObject, chromeObject) {
    return (
      chromeObject?.i18n?.getUILanguage?.() ||
      documentObject?.defaultView?.navigator?.language ||
      ""
    );
  }

  function text(key, documentObject) {
    return i18nApi.translate(
      documentObject?.documentElement?.dataset?.language || "en",
      key
    );
  }

  function setStatus(messageKey, isError, documentObject) {
    const status = documentObject.getElementById("popupStatus");
    if (status.dataset) {
      status.dataset.i18n = messageKey;
    }
    status.textContent = text(messageKey, documentObject);
    status.classList.toggle("error", Boolean(isError));
  }

  function setStatusMessage(message, isError, documentObject) {
    const status = documentObject.getElementById("popupStatus");
    status.removeAttribute?.("data-i18n");
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function updatePreferenceButtons(settings, documentObject) {
    const theme = themeApi.resolveTheme(
      settings.appearance.theme,
      documentObject?.defaultView
    );
    const language = i18nApi.resolveLanguage(
      settings.appearance.language,
      documentObject?.defaultView?.navigator?.language
    );
    const themeButton =
      documentObject.getElementById("popupThemeToggle");
    const languageButton =
      documentObject.getElementById("popupLanguageToggle");
    const themeKey = theme === "dark" ? "switchToLight" : "switchToDark";
    const languageKey =
      language === "en" ? "switchToRussian" : "switchToEnglish";
    const themeIcon = themeButton.querySelector?.(".theme-icon");

    themeIcon?.setAttribute(
      "src",
      theme === "dark" ? "icons/moon.svg" : "icons/sun.svg"
    );
    themeButton.title = text(themeKey, documentObject);
    themeButton.setAttribute("aria-label", themeButton.title);
    languageButton.textContent = language.toUpperCase();
    languageButton.title = text(languageKey, documentObject);
    languageButton.setAttribute("aria-label", languageButton.title);
  }

  function applyAppearance(settings, documentObject, chromeObject) {
    themeApi.applyTheme(settings.appearance.theme, documentObject);
    i18nApi.applyLanguage(
      settings.appearance.language,
      documentObject,
      browserLanguage(documentObject, chromeObject)
    );
    updatePreferenceButtons(settings, documentObject);
  }

  function assignSystemAppearance(settings, documentObject, chromeObject) {
    if (
      settings.appearance.theme === "system" ||
      settings.appearance.language === "system"
    ) {
      settings.appearance.theme = themeApi.resolveTheme(
        "system",
        documentObject?.defaultView
      );
      settings.appearance.language = i18nApi.resolveLanguage(
        "system",
        browserLanguage(documentObject, chromeObject)
      );
      return true;
    }

    return false;
  }

  function applySettings(settings, documentObject, chromeObject) {
    documentObject.getElementById("popupDynamicEnabled").checked =
      settings.dynamic.enabled;
    documentObject.getElementById("popupAutocorrectTypos").checked =
      settings.manual.autocorrectTypos;
    documentObject.getElementById("popupConvertUnknown").checked =
      settings.manual.convertLikelyUnknown;
    applyAppearance(settings, documentObject, chromeObject);
  }

  function mergePopupSettings(settings, documentObject) {
    return settingsApi.normalizeSettings({
      ...settings,
      manual: {
        ...settings.manual,
        autocorrectTypos:
          documentObject.getElementById("popupAutocorrectTypos").checked,
        convertLikelyUnknown:
          documentObject.getElementById("popupConvertUnknown").checked
      },
      dynamic: {
        ...settings.dynamic,
        enabled:
          documentObject.getElementById("popupDynamicEnabled").checked
      },
      appearance: {
        theme:
          documentObject.documentElement.dataset.themePreference ||
          documentObject.documentElement.dataset.theme,
        language:
          documentObject.documentElement.dataset.languagePreference ||
          documentObject.documentElement.dataset.language
      }
    });
  }

  function toggleAppearance(kind, settings, documentObject, chromeObject) {
    if (kind === "theme") {
      settings.appearance.theme =
        settings.appearance.theme === "dark" ? "light" : "dark";
    } else if (kind === "language") {
      settings.appearance.language =
        settings.appearance.language === "en" ? "ru" : "en";
    }

    applyAppearance(settings, documentObject, chromeObject);
    return settings;
  }

  async function dynamicPermissionGranted(chromeObject) {
    return Boolean(
      await chromeObject?.permissions?.contains?.({
        origins: settingsApi.DYNAMIC_ORIGINS
      })
    );
  }

  async function setDynamicPermission(enabled, chromeObject) {
    if (enabled) {
      return Boolean(
        await chromeObject?.permissions?.request?.({
          origins: settingsApi.DYNAMIC_ORIGINS
        })
      );
    }

    await chromeObject?.permissions?.remove?.({
      origins: settingsApi.DYNAMIC_ORIGINS
    });
    return true;
  }

  async function restorePopup(documentObject, chromeObject) {
    const settings = await settingsApi.loadSettings(
      chromeObject?.storage?.sync
    );

    let settingsChanged = assignSystemAppearance(
      settings,
      documentObject,
      chromeObject
    );

    if (
      settings.dynamic.enabled &&
      !(await dynamicPermissionGranted(chromeObject))
    ) {
      settings.dynamic.enabled = false;
      settingsChanged = true;
    }

    if (settingsChanged) {
      await settingsApi.saveSettings(settings, chromeObject?.storage?.sync);
    }

    applySettings(settings, documentObject, chromeObject);
    const version = chromeObject?.runtime?.getManifest?.().version;
    documentObject.getElementById("version").textContent =
      version ? `v${version}` : "";
    return settings;
  }

  async function savePopupChange(
    documentObject,
    chromeObject,
    changedControl
  ) {
    const current = await settingsApi.loadSettings(
      chromeObject?.storage?.sync
    );
    const settings = mergePopupSettings(current, documentObject);

    if (changedControl?.id === "popupDynamicEnabled") {
      const permitted = await setDynamicPermission(
        settings.dynamic.enabled,
        chromeObject
      );

      if (settings.dynamic.enabled && !permitted) {
        settings.dynamic.enabled = false;
        applySettings(settings, documentObject, chromeObject);
        await settingsApi.saveSettings(
          settings,
          chromeObject?.storage?.sync
        );
        setStatus("siteAccessDenied", true, documentObject);
        return settings;
      }
    }

    await settingsApi.saveSettings(settings, chromeObject?.storage?.sync);
    setStatus("saved", false, documentObject);
    return settings;
  }

  function sendRuntimeMessage(chromeObject, message) {
    return new Promise((resolve, reject) => {
      chromeObject.runtime.sendMessage(message, (response) => {
        const error = chromeObject.runtime.lastError;

        if (error) {
          reject(new Error(error.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async function fixCurrentSelection(documentObject, chromeObject) {
    const button = documentObject.getElementById("fixSelection");
    button.disabled = true;

    try {
      const [tab] = await chromeObject.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!Number.isInteger(tab?.id)) {
        throw new Error(text("activeTabUnavailable", documentObject));
      }

      const response = await sendRuntimeMessage(chromeObject, {
        type: "qswapp:run-manual",
        tabId: tab.id
      });

      if (!response?.ok) {
        throw new Error(
          response?.error || text("commandFailed", documentObject)
        );
      }

      setStatus("selectionCheckStarted", false, documentObject);
      return true;
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : String(error),
        true,
        documentObject
      );
      return false;
    } finally {
      button.disabled = false;
    }
  }

  async function initializePopup(
    documentObject = globalThis.document,
    chromeObject = globalThis.chrome
  ) {
    if (!documentObject?.getElementById) {
      return false;
    }

    await restorePopup(documentObject, chromeObject);
    let saveQueue = Promise.resolve();

    for (const id of [
      "popupDynamicEnabled",
      "popupAutocorrectTypos",
      "popupConvertUnknown"
    ]) {
      const control = documentObject.getElementById(id);
      control.addEventListener("change", () => {
        saveQueue = saveQueue
          .then(() => savePopupChange(documentObject, chromeObject, control))
          .catch(() => {
            setStatus("saveFailed", true, documentObject);
          });
      });
    }

    for (const [id, kind] of [
      ["popupThemeToggle", "theme"],
      ["popupLanguageToggle", "language"]
    ]) {
      const button = documentObject.getElementById(id);

      button.addEventListener("click", () => {
        saveQueue = saveQueue
          .then(async () => {
            const settings = await settingsApi.loadSettings(
              chromeObject?.storage?.sync
            );
            toggleAppearance(
              kind,
              settings,
              documentObject,
              chromeObject
            );
            return savePopupChange(
              documentObject,
              chromeObject,
              button
            );
          })
          .catch(() => {
            setStatus("saveFailed", true, documentObject);
          });
      });
    }

    documentObject
      .getElementById("fixSelection")
      .addEventListener("click", () => {
        void fixCurrentSelection(documentObject, chromeObject);
      });
    documentObject
      .getElementById("openOptions")
      .addEventListener("click", () => {
        void chromeObject.runtime.openOptionsPage();
      });

    return true;
  }

  return {
    applySettings,
    assignSystemAppearance,
    dynamicPermissionGranted,
    fixCurrentSelection,
    initializePopup,
    mergePopupSettings,
    restorePopup,
    savePopupChange,
    setDynamicPermission,
    toggleAppearance,
    updatePreferenceButtons
  };
});
