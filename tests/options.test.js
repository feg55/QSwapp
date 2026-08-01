const test = require("node:test");
const assert = require("node:assert/strict");

const {
  restoreOptions,
  saveOptions,
  toggleAppearance,
  updateDynamicPermission
} = require("../options");

function createOptionsDocument() {
  const elements = {
    manualAutocorrectTypos: {
      id: "manualAutocorrectTypos",
      checked: false
    },
    manualConvertLikelyUnknown: {
      id: "manualConvertLikelyUnknown",
      checked: false
    },
    manualMinimumLength: {
      id: "manualMinimumLength",
      value: ""
    },
    manualAggressiveness: {
      id: "manualAggressiveness",
      value: ""
    },
    dynamicEnabled: {
      id: "dynamicEnabled",
      checked: false
    },
    dynamicAutocorrectTypos: {
      id: "dynamicAutocorrectTypos",
      checked: false,
      disabled: false,
      dynamicOption: true
    },
    dynamicConvertLikelyUnknown: {
      id: "dynamicConvertLikelyUnknown",
      checked: false,
      disabled: false,
      dynamicOption: true
    },
    dynamicMinimumLength: {
      id: "dynamicMinimumLength",
      value: "",
      disabled: false,
      dynamicOption: true
    },
    dynamicAggressiveness: {
      id: "dynamicAggressiveness",
      value: "",
      disabled: false,
      dynamicOption: true
    },
    themeIcon: {
      src: "",
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    themeToggle: {
      id: "themeToggle",
      textContent: "",
      querySelector(selector) {
        return selector === ".theme-icon" ? elements.themeIcon : null;
      },
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    languageToggle: {
      id: "languageToggle",
      textContent: "",
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    protectedTerms: {
      id: "protectedTerms",
      value: ""
    },
    allowedSites: {
      id: "allowedSites",
      value: ""
    },
    blockedSites: {
      id: "blockedSites",
      value: ""
    },
    excludePaymentFields: {
      id: "excludePaymentFields",
      checked: false,
      disabled: false,
      dynamicOption: true
    },
    excludePasswordFields: {
      id: "excludePasswordFields",
      checked: false,
      disabled: false,
      dynamicOption: true
    },
    excludeApiSecretFields: {
      id: "excludeApiSecretFields",
      checked: false,
      disabled: false,
      dynamicOption: true
    },
    excludeOneTimeCodeFields: {
      id: "excludeOneTimeCodeFields",
      checked: false,
      disabled: false,
      dynamicOption: true
    },
    status: {
      textContent: "",
      classList: {
        error: false,
        toggle(name, enabled) {
          if (name === "error") {
            this.error = enabled;
          }
        }
      }
    }
  };

  return {
    elements,
    documentElement: {
      dataset: {
        theme: "dark",
        themePreference: "dark",
        language: "en",
        languagePreference: "en"
      }
    },
    defaultView: {
      navigator: { language: "en-US" },
      matchMedia() {
        return { matches: false };
      }
    },
    getElementById(id) {
      return elements[id];
    },
    querySelectorAll(selector) {
      if (selector === "[data-dynamic-option]") {
        return Object.values(elements).filter(
          (element) => element.dynamicOption
        );
      }

      return [];
    }
  };
}

function createChrome({
  stored = {},
  permissionGranted = false,
  requestGranted = false
} = {}) {
  const storageState = { ...stored };
  const localStorageState = {};
  const calls = [];

  return {
    storageState,
    calls,
    chromeObject: {
      storage: {
        sync: {
          async get(query) {
            assert.equal(query, null);
            return { ...storageState };
          },
          async set(value) {
            Object.assign(storageState, value);
            calls.push(["set", value]);
          },
          async remove(keys) {
            for (const key of keys) {
              delete storageState[key];
            }
            calls.push(["remove", keys]);
          }
        },
        local: {
          async get(query) {
            assert.equal(query, null);
            return { ...localStorageState };
          },
          async set(value) {
            Object.assign(localStorageState, value);
            calls.push(["set-local", value]);
          }
        }
      },
      permissions: {
        async contains(details) {
          calls.push(["contains", details]);
          return permissionGranted;
        },
        async request(details) {
          calls.push(["request", details]);
          return requestGranted;
        },
        async remove(details) {
          calls.push(["remove", details]);
          return true;
        }
      },
      i18n: {
        getUILanguage() {
          return "en-US";
        }
      }
    }
  };
}

test("restores defaults and disables stale dynamic permission state", async () => {
  const documentObject = createOptionsDocument();
  const fixture = createChrome({
    stored: {
      manual: {
        autocorrectTypos: true,
        convertLikelyUnknown: true,
        minimumLength: 1,
        aggressiveness: "balanced"
      },
      dynamic: {
        enabled: true,
        autocorrectTypos: true,
        convertLikelyUnknown: false,
        minimumLength: 3,
        aggressiveness: "safe"
      }
    },
    permissionGranted: false
  });

  const restored = await restoreOptions(
    documentObject,
    fixture.chromeObject
  );

  assert.deepEqual(restored, {
    manual: {
      autocorrectTypos: true,
      convertLikelyUnknown: true,
      minimumLength: 1,
      aggressiveness: "balanced"
    },
    dynamic: {
      enabled: false,
      autocorrectTypos: true,
      convertLikelyUnknown: false,
      minimumLength: 3,
      aggressiveness: "safe"
    },
    appearance: {
      theme: "dark",
      language: "en"
    }
  });
  assert.equal(
    documentObject.elements.manualAutocorrectTypos.checked,
    true
  );
  assert.equal(
    documentObject.elements.manualConvertLikelyUnknown.checked,
    true
  );
  assert.equal(documentObject.elements.dynamicEnabled.checked, false);
  assert.equal(documentObject.documentElement.dataset.theme, "dark");
  assert.equal(documentObject.documentElement.dataset.language, "en");
  assert.equal(documentObject.elements.themeIcon.src, "icons/moon.svg");
  assert.equal(documentObject.elements.languageToggle.textContent, "EN");
  assert.equal(fixture.storageState.dynamic.enabled, false);
  assert.equal(
    documentObject.elements.dynamicAutocorrectTypos.disabled,
    true
  );
});

test("keeps dynamic mode disabled when site permission is denied", async () => {
  const documentObject = createOptionsDocument();
  documentObject.elements.manualAutocorrectTypos.checked = true;
  documentObject.elements.manualConvertLikelyUnknown.checked = true;
  documentObject.elements.manualMinimumLength.value = "1";
  documentObject.elements.manualAggressiveness.value = "balanced";
  documentObject.elements.dynamicEnabled.checked = true;
  documentObject.elements.dynamicAutocorrectTypos.checked = true;
  documentObject.elements.dynamicConvertLikelyUnknown.checked = false;
  documentObject.elements.dynamicMinimumLength.value = "3";
  documentObject.elements.dynamicAggressiveness.value = "safe";
  documentObject.elements.excludePasswordFields.checked = true;
  documentObject.elements.excludeApiSecretFields.checked = true;
  documentObject.elements.excludeOneTimeCodeFields.checked = true;
  documentObject.elements.excludePaymentFields.checked = true;
  documentObject.documentElement.dataset.theme = "dark";
  documentObject.documentElement.dataset.themePreference = "dark";
  documentObject.documentElement.dataset.language = "en";
  documentObject.documentElement.dataset.languagePreference = "en";
  documentObject.elements.protectedTerms.value =
    "Б.Ю. Иванов\nБ.Ю. Иванов";
  documentObject.elements.blockedSites.value =
    "https://bank.example/login";
  const fixture = createChrome({ requestGranted: false });

  const saved = await saveOptions(
    documentObject,
    fixture.chromeObject,
    documentObject.elements.dynamicEnabled
  );

  assert.equal(saved.dynamic.enabled, false);
  assert.equal(documentObject.elements.dynamicEnabled.checked, false);
  assert.deepEqual(fixture.calls.at(-1), [
    "set-local",
    {
      protectedTerms: ["Б.Ю. Иванов"],
      allowedSites: [],
      blockedSites: ["bank.example"],
      excludedFieldCategories: [
        "passwords",
        "apiSecrets",
        "oneTimeCodes",
        "payment",
      ]
    }
  ]);
  assert.equal(
    documentObject.elements.status.textContent,
    "Site access was not granted"
  );
  assert.equal(documentObject.elements.status.classList.error, true);
});

test("removes site permission when dynamic mode is switched off", async () => {
  const fixture = createChrome();

  assert.equal(
    await updateDynamicPermission(false, fixture.chromeObject),
    true
  );
  assert.deepEqual(fixture.calls, [
    [
      "remove",
      { origins: ["http://*/*", "https://*/*"] }
    ]
  ]);
});

test("enables automatic controls immediately after permission is granted", async () => {
  const documentObject = createOptionsDocument();
  const fixture = createChrome({ requestGranted: true });
  documentObject.elements.manualAutocorrectTypos.checked = true;
  documentObject.elements.manualConvertLikelyUnknown.checked = true;
  documentObject.elements.manualMinimumLength.value = "1";
  documentObject.elements.manualAggressiveness.value = "balanced";
  documentObject.elements.dynamicEnabled.checked = true;
  documentObject.elements.dynamicAutocorrectTypos.checked = true;
  documentObject.elements.dynamicConvertLikelyUnknown.checked = false;
  documentObject.elements.dynamicMinimumLength.value = "3";
  documentObject.elements.dynamicAggressiveness.value = "safe";
  documentObject.elements.excludePasswordFields.checked = true;
  documentObject.elements.excludeApiSecretFields.checked = true;
  documentObject.elements.excludeOneTimeCodeFields.checked = true;
  documentObject.elements.excludePaymentFields.checked = true;
  documentObject.elements.dynamicAutocorrectTypos.disabled = true;
  documentObject.elements.dynamicConvertLikelyUnknown.disabled = true;
  documentObject.elements.dynamicMinimumLength.disabled = true;
  documentObject.elements.dynamicAggressiveness.disabled = true;

  await saveOptions(
    documentObject,
    fixture.chromeObject,
    documentObject.elements.dynamicEnabled
  );

  assert.equal(
    documentObject.elements.dynamicAutocorrectTypos.disabled,
    false
  );
  assert.equal(documentObject.elements.dynamicAggressiveness.disabled, false);
  assert.equal(documentObject.elements.dynamicMinimumLength.disabled, false);
  assert.equal(documentObject.elements.excludePasswordFields.disabled, false);
  assert.equal(documentObject.elements.excludeApiSecretFields.disabled, false);
});

test("changes theme and language only after their buttons are used", () => {
  const documentObject = createOptionsDocument();
  const fixture = createChrome();

  let settings = toggleAppearance(
    "theme",
    documentObject,
    fixture.chromeObject
  );
  assert.equal(settings.appearance.theme, "light");
  assert.equal(documentObject.documentElement.dataset.theme, "light");

  settings = toggleAppearance(
    "language",
    documentObject,
    fixture.chromeObject
  );
  assert.equal(settings.appearance.language, "ru");
  assert.equal(documentObject.documentElement.dataset.language, "ru");
  assert.equal(documentObject.elements.languageToggle.textContent, "RU");
});
