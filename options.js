(function initializeOptionsPage(root, factory) {
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
    api.initializeOptionsPage().catch((error) => {
      console.warn("Could not open settings:", error);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createOptionsPage(
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

  function updatePreferenceButtons(settings, documentObject) {
    const theme = themeApi.resolveTheme(
      settings.appearance.theme,
      documentObject?.defaultView
    );
    const language = i18nApi.resolveLanguage(
      settings.appearance.language,
      documentObject?.defaultView?.navigator?.language
    );
    const themeButton = documentObject.getElementById("themeToggle");
    const languageButton = documentObject.getElementById("languageToggle");
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

  function toggleAppearance(kind, documentObject, chromeObject) {
    const settings = settingsFromForm(documentObject);

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

  function settingsFromForm(documentObject) {
    return settingsApi.normalizeSettings({
      manual: {
        autocorrectTypos:
          documentObject.getElementById("manualAutocorrectTypos").checked,
        convertLikelyUnknown:
          documentObject.getElementById("manualConvertLikelyUnknown").checked,
        minimumLength:
          documentObject.getElementById("manualMinimumLength").value,
        aggressiveness:
          documentObject.getElementById("manualAggressiveness").value
      },
      dynamic: {
        enabled: documentObject.getElementById("dynamicEnabled").checked,
        autocorrectTypos:
          documentObject.getElementById("dynamicAutocorrectTypos").checked,
        convertLikelyUnknown:
          documentObject.getElementById("dynamicConvertLikelyUnknown").checked,
        minimumLength:
          documentObject.getElementById("dynamicMinimumLength").value,
        aggressiveness:
          documentObject.getElementById("dynamicAggressiveness").value
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

  function localSettingsFromForm(documentObject) {
    return settingsApi.normalizeLocalSettings({
      protectedTerms:
        documentObject.getElementById("protectedTerms").value,
      allowedSites: documentObject.getElementById("allowedSites").value,
      blockedSites: documentObject.getElementById("blockedSites").value,
      excludedFieldCategories: [
        [
          "payment",
          documentObject.getElementById("excludePaymentFields").checked
        ],
        [
          "personal",
          documentObject.getElementById("excludePersonalFields").checked
        ],
        [
          "technical",
          documentObject.getElementById("excludeTechnicalFields").checked
        ]
      ]
        .filter(([, checked]) => checked)
        .map(([category]) => category)
    });
  }

  function updateDynamicControls(documentObject, enabled) {
    for (const control of documentObject.querySelectorAll(
      "[data-dynamic-option]"
    )) {
      control.disabled = !enabled;
    }
  }

  function applySettingsToForm(settings, documentObject) {
    documentObject.getElementById("manualAutocorrectTypos").checked =
      settings.manual.autocorrectTypos;
    documentObject.getElementById("manualConvertLikelyUnknown").checked =
      settings.manual.convertLikelyUnknown;
    documentObject.getElementById("manualMinimumLength").value =
      String(settings.manual.minimumLength);
    documentObject.getElementById("manualAggressiveness").value =
      settings.manual.aggressiveness;
    documentObject.getElementById("dynamicEnabled").checked =
      settings.dynamic.enabled;
    documentObject.getElementById("dynamicAutocorrectTypos").checked =
      settings.dynamic.autocorrectTypos;
    documentObject.getElementById("dynamicConvertLikelyUnknown").checked =
      settings.dynamic.convertLikelyUnknown;
    documentObject.getElementById("dynamicMinimumLength").value =
      String(settings.dynamic.minimumLength);
    documentObject.getElementById("dynamicAggressiveness").value =
      settings.dynamic.aggressiveness;
    applyAppearance(settings, documentObject);
    updateDynamicControls(documentObject, settings.dynamic.enabled);
  }

  function applyLocalSettingsToForm(settings, documentObject) {
    documentObject.getElementById("protectedTerms").value =
      settings.protectedTerms.join("\n");
    documentObject.getElementById("allowedSites").value =
      settings.allowedSites.join("\n");
    documentObject.getElementById("blockedSites").value =
      settings.blockedSites.join("\n");
    documentObject.getElementById("excludePaymentFields").checked =
      settings.excludedFieldCategories.includes("payment");
    documentObject.getElementById("excludePersonalFields").checked =
      settings.excludedFieldCategories.includes("personal");
    documentObject.getElementById("excludeTechnicalFields").checked =
      settings.excludedFieldCategories.includes("technical");
  }

  function setStatus(messageKey, isError, documentObject) {
    const status = documentObject.getElementById("status");
    if (status.dataset) {
      status.dataset.i18n = messageKey;
    }
    status.textContent = text(messageKey, documentObject);
    status.classList.toggle("error", Boolean(isError));
  }

  async function dynamicPermissionGranted(chromeObject) {
    if (!chromeObject?.permissions?.contains) {
      return false;
    }

    return chromeObject.permissions.contains({
      origins: settingsApi.DYNAMIC_ORIGINS
    });
  }

  async function updateDynamicPermission(enabled, chromeObject) {
    if (!chromeObject?.permissions) {
      return false;
    }

    if (enabled) {
      return chromeObject.permissions.request({
        origins: settingsApi.DYNAMIC_ORIGINS
      });
    }

    await chromeObject.permissions.remove({
      origins: settingsApi.DYNAMIC_ORIGINS
    });
    return true;
  }

  async function restoreOptions(documentObject, chromeObject) {
    const [settings, localSettings] = await Promise.all([
      settingsApi.loadSettings(chromeObject?.storage?.sync),
      settingsApi.loadLocalSettings(chromeObject?.storage?.local)
    ]);

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

    applySettingsToForm(settings, documentObject, chromeObject);
    applyLocalSettingsToForm(localSettings, documentObject);
    return settings;
  }

  async function saveOptions(documentObject, chromeObject, changedControl) {
    const settings = settingsFromForm(documentObject);
    const localSettings = localSettingsFromForm(documentObject);

    if (changedControl?.id === "dynamicEnabled") {
      const permitted = await updateDynamicPermission(
        settings.dynamic.enabled,
        chromeObject
      );

      if (settings.dynamic.enabled && !permitted) {
        settings.dynamic.enabled = false;
        applySettingsToForm(settings, documentObject);
        setStatus("siteAccessDenied", true, documentObject);
        await settingsApi.saveSettings(
          settings,
          chromeObject?.storage?.sync
        );
        await settingsApi.saveLocalSettings(
          localSettings,
          chromeObject?.storage?.local
        );
        return settings;
      }
    }

    updateDynamicControls(documentObject, settings.dynamic.enabled);

    await Promise.all([
      settingsApi.saveSettings(settings, chromeObject?.storage?.sync),
      settingsApi.saveLocalSettings(
        localSettings,
        chromeObject?.storage?.local
      )
    ]);
    setStatus("settingsSaved", false, documentObject);
    return settings;
  }

  async function initializeOptionsPage(
    documentObject = globalThis.document,
    chromeObject = globalThis.chrome
  ) {
    if (!documentObject?.querySelectorAll) {
      return false;
    }

    try {
      await restoreOptions(documentObject, chromeObject);
    } catch {
      setStatus("loadSettingsFailed", true, documentObject);
    }

    let saveQueue = Promise.resolve();

    for (const control of documentObject.querySelectorAll(
      "input, select, textarea"
    )) {
      control.addEventListener("change", (event) => {
        const changedControl = event.currentTarget;

        if (changedControl?.id === "dynamicEnabled") {
          updateDynamicControls(
            documentObject,
            changedControl.checked
          );
        }

        saveQueue = saveQueue.then(async () => {
          try {
            await saveOptions(
              documentObject,
              chromeObject,
              changedControl
            );
          } catch {
            setStatus(
              "saveSettingsFailed",
              true,
              documentObject
            );
          }
        });
      });
    }

    for (const [id, kind] of [
      ["themeToggle", "theme"],
      ["languageToggle", "language"]
    ]) {
      const button = documentObject.getElementById(id);

      button.addEventListener("click", () => {
        toggleAppearance(kind, documentObject, chromeObject);
        saveQueue = saveQueue
          .then(() => saveOptions(documentObject, chromeObject, button))
          .catch(() => {
            setStatus("saveSettingsFailed", true, documentObject);
          });
      });
    }

    return true;
  }

  return {
    applySettingsToForm,
    applyLocalSettingsToForm,
    assignSystemAppearance,
    dynamicPermissionGranted,
    initializeOptionsPage,
    localSettingsFromForm,
    restoreOptions,
    saveOptions,
    settingsFromForm,
    toggleAppearance,
    updateDynamicControls,
    updateDynamicPermission,
    updatePreferenceButtons
  };
});
