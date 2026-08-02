const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fixCurrentSelection,
  openShortcutSettings,
  restorePopup,
  savePopupChange,
  toggleAppearance,
  updateShortcutDisplay
} = require("../popup");

function createPopupDocument() {
  const elements = {
    popupDynamicEnabled: {
      id: "popupDynamicEnabled",
      checked: false
    },
    popupAutocorrectTypos: {
      id: "popupAutocorrectTypos",
      checked: false
    },
    popupConvertUnknown: {
      id: "popupConvertUnknown",
      checked: false
    },
    popupThemeIcon: {
      src: "",
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    popupThemeToggle: {
      id: "popupThemeToggle",
      textContent: "",
      querySelector(selector) {
        return selector === ".theme-icon"
          ? elements.popupThemeIcon
          : null;
      },
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    popupLanguageToggle: {
      id: "popupLanguageToggle",
      textContent: "",
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    popupStatus: {
      textContent: "",
      classList: {
        error: false,
        toggle(name, enabled) {
          if (name === "error") {
            this.error = enabled;
          }
        }
      }
    },
    shortcutHint: {
      dataset: {},
      textContent: "",
      removeAttribute(name) {
        if (name === "data-i18n") {
          delete this.dataset.i18n;
        }
      }
    },
    configureShortcut: {
      hidden: true
    },
    version: { textContent: "" },
    fixSelection: { disabled: false }
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
    querySelectorAll() {
      return [];
    }
  };
}

function createPopupChrome({
  permissionGranted = false,
  requestGranted = false,
  shortcut = "Ctrl+Shift+L"
} = {}) {
  const storageState = {
    manual: {
      autocorrectTypos: true,
      convertLikelyUnknown: true,
      minimumLength: 2,
      aggressiveness: "balanced"
    },
    dynamic: {
      enabled: false,
      autocorrectTypos: true,
      convertLikelyUnknown: false,
      minimumLength: 4,
      aggressiveness: "safe"
    },
    appearance: {
      theme: "dark",
      language: "en"
    }
  };
  const calls = [];
  const chromeObject = {
    storage: {
      sync: {
        async get() {
          return { ...storageState };
        },
        async set(value) {
          Object.assign(storageState, value);
          calls.push(["set", value]);
        },
        async remove(keys) {
          calls.push(["remove", keys]);
        }
      }
    },
    permissions: {
      async contains() {
        return permissionGranted;
      },
      async request() {
        return requestGranted;
      },
      async remove() {
        return true;
      }
    },
    tabs: {
      async query() {
        return [{ id: 51 }];
      },
      async create(details) {
        calls.push(["create", details]);
        return { id: 52, ...details };
      }
    },
    commands: {
      async getAll() {
        return [
          {
            name: "fix-selection-v2",
            shortcut
          }
        ];
      }
    },
    runtime: {
      lastError: null,
      getManifest() {
        return { version: "3.2.1" };
      },
      sendMessage(message, callback) {
        calls.push(["message", message]);
        callback({ ok: true });
      }
    },
    i18n: {
      getUILanguage() {
        return "en-US";
      }
    }
  };

  return { calls, chromeObject, storageState };
}

test("restores compact settings with saved appearance", async () => {
  const documentObject = createPopupDocument();
  const fixture = createPopupChrome();
  const settings = await restorePopup(
    documentObject,
    fixture.chromeObject
  );

  assert.equal(settings.appearance.theme, "dark");
  assert.equal(settings.appearance.language, "en");
  assert.equal(documentObject.documentElement.dataset.theme, "dark");
  assert.equal(documentObject.documentElement.dataset.language, "en");
  assert.equal(
    documentObject.elements.popupThemeIcon.src,
    "icons/moon.svg"
  );
  assert.equal(documentObject.elements.popupLanguageToggle.textContent, "EN");
  assert.equal(documentObject.elements.popupAutocorrectTypos.checked, true);
  assert.equal(documentObject.elements.popupConvertUnknown.checked, true);
  assert.equal(documentObject.elements.version.textContent, "v3.2.1");
});

test("shows the active browser shortcut instead of a hard-coded value", async () => {
  const documentObject = createPopupDocument();
  const fixture = createPopupChrome({ shortcut: "Ctrl+Shift+L" });

  assert.equal(
    await updateShortcutDisplay(documentObject, fixture.chromeObject),
    "Ctrl+Shift+L"
  );
  assert.equal(
    documentObject.elements.shortcutHint.textContent,
    "Ctrl+Shift+L"
  );
  assert.equal(documentObject.elements.configureShortcut.hidden, true);
});

test("offers browser shortcut settings when the command is unassigned", async () => {
  const documentObject = createPopupDocument();
  const fixture = createPopupChrome({ shortcut: "" });

  assert.equal(
    await updateShortcutDisplay(documentObject, fixture.chromeObject),
    ""
  );
  assert.equal(
    documentObject.elements.shortcutHint.textContent,
    "Keyboard shortcut is not assigned"
  );
  assert.equal(documentObject.elements.configureShortcut.hidden, false);

  await openShortcutSettings(documentObject, fixture.chromeObject);
  assert.deepEqual(fixture.calls.at(-1), [
    "create",
    { url: "chrome://extensions/shortcuts" }
  ]);
});

test("opens the Edge shortcut page when running in Edge", async () => {
  const documentObject = createPopupDocument();
  documentObject.defaultView = {
    navigator: {
      userAgent:
        "Mozilla/5.0 Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0"
    }
  };
  const fixture = createPopupChrome();

  await openShortcutSettings(documentObject, fixture.chromeObject);
  assert.deepEqual(fixture.calls.at(-1), [
    "create",
    { url: "edge://extensions/shortcuts" }
  ]);
});

test("saves quick settings without resetting advanced values", async () => {
  const documentObject = createPopupDocument();
  const fixture = createPopupChrome();
  const settings = await restorePopup(
    documentObject,
    fixture.chromeObject
  );
  documentObject.elements.popupAutocorrectTypos.checked = false;
  documentObject.elements.popupConvertUnknown.checked = false;
  toggleAppearance(
    "theme",
    settings,
    documentObject,
    fixture.chromeObject
  );

  const saved = await savePopupChange(
    documentObject,
    fixture.chromeObject,
    documentObject.elements.popupThemeToggle
  );

  assert.equal(saved.manual.autocorrectTypos, false);
  assert.equal(saved.manual.minimumLength, 2);
  assert.equal(saved.dynamic.minimumLength, 4);
  assert.equal(saved.appearance.theme, "light");
  assert.equal(saved.appearance.language, "en");
  assert.equal(documentObject.documentElement.dataset.theme, "light");
});

test("switches the compact interface language without changing it again", async () => {
  const documentObject = createPopupDocument();
  const fixture = createPopupChrome();
  const settings = await restorePopup(
    documentObject,
    fixture.chromeObject
  );

  toggleAppearance(
    "language",
    settings,
    documentObject,
    fixture.chromeObject
  );
  const saved = await savePopupChange(
    documentObject,
    fixture.chromeObject,
    documentObject.elements.popupLanguageToggle
  );

  assert.equal(saved.appearance.language, "ru");
  assert.equal(documentObject.documentElement.dataset.language, "ru");
  assert.equal(documentObject.elements.popupLanguageToggle.textContent, "RU");
});

test("keeps dynamic mode off when site permission is denied", async () => {
  const documentObject = createPopupDocument();
  const fixture = createPopupChrome({ requestGranted: false });
  await restorePopup(documentObject, fixture.chromeObject);
  documentObject.elements.popupDynamicEnabled.checked = true;

  const saved = await savePopupChange(
    documentObject,
    fixture.chromeObject,
    documentObject.elements.popupDynamicEnabled
  );

  assert.equal(saved.dynamic.enabled, false);
  assert.equal(documentObject.elements.popupDynamicEnabled.checked, false);
  assert.equal(documentObject.elements.popupStatus.classList.error, true);
});

test("starts manual correction for the active tab", async () => {
  const documentObject = createPopupDocument();
  const fixture = createPopupChrome();

  assert.equal(
    await fixCurrentSelection(documentObject, fixture.chromeObject),
    true
  );
  assert.deepEqual(fixture.calls.at(-1), [
    "message",
    { type: "qswapp:run-manual", tabId: 51 }
  ]);
  assert.equal(documentObject.elements.fixSelection.disabled, false);
});
