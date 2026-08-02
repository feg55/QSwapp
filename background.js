if (typeof importScripts === "function") {
  importScripts(
    "settings.js",
    "layout-map.js",
    "dictionaries.js",
    "word-analyzer.js"
  );
}

const MENU_ID = "qswapp";
const DYNAMIC_CONTENT_SCRIPT_ID = "qswapp-dynamic";
const SETTINGS_API = globalThis.QswappSettings;
const TEXT_ANALYZER = globalThis.Qswapp;
const DEFAULT_SETTINGS = SETTINGS_API?.DEFAULT_SETTINGS ?? {
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
    theme: "system",
    language: "system"
  }
};
const DYNAMIC_ORIGINS =
  globalThis.QswappSettings?.DYNAMIC_ORIGINS ?? [
    "http://*/*",
    "https://*/*"
  ];
const CONTENT_SCRIPTS = [
  "settings.js",
  "field-safety.js",
  "analysis-client.js",
  "replace-selection.js"
];
const DYNAMIC_CONTENT_SCRIPTS = [
  "settings.js",
  "field-safety.js",
  "analysis-client.js",
  "dynamic-correction.js"
];
let dynamicSyncPromise = Promise.resolve(false);

function dynamicContentScriptDefinition() {
  return {
    id: DYNAMIC_CONTENT_SCRIPT_ID,
    matches: DYNAMIC_ORIGINS,
    js: DYNAMIC_CONTENT_SCRIPTS,
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: "document_idle",
    persistAcrossSessions: true
  };
}

function createMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: "Fix keyboard layout",
        contexts: ["editable"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn(
            "Could not create the context menu item:",
            chrome.runtime.lastError.message
          );
        }
      }
    );
  });
}

function frameHasEditableSelection() {
  let activeElement = document.activeElement;

  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement;
  }

  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement
  ) {
    return (
      typeof activeElement.selectionStart === "number" &&
      typeof activeElement.selectionEnd === "number" &&
      activeElement.selectionStart !== activeElement.selectionEnd
    );
  }

  const root = activeElement?.getRootNode?.();
  const selection = root?.getSelection?.() || globalThis.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}

async function runManualCorrectionInTab(tabId) {
  const inspected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: frameHasEditableSelection
  });
  const selectedFrame = inspected.find((result) => result.result === true);
  const target = selectedFrame
    ? { tabId, frameIds: [selectedFrame.frameId] }
    : { tabId, frameIds: [0] };

  await chrome.scripting.executeScript({
    target,
    files: CONTENT_SCRIPTS
  });
}

async function dynamicPermissionGranted() {
  return chrome.permissions.contains({ origins: DYNAMIC_ORIGINS });
}

async function unregisterDynamicContentScript() {
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [DYNAMIC_CONTENT_SCRIPT_ID]
  });

  if (registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({
      ids: [DYNAMIC_CONTENT_SCRIPT_ID]
    });
  }
}

function sameContentScriptConfiguration(actual, desired) {
  return [
    "id",
    "allFrames",
    "matchOriginAsFallback",
    "runAt",
    "persistAcrossSessions"
  ].every((key) => actual?.[key] === desired[key]) &&
    JSON.stringify(actual?.matches || []) === JSON.stringify(desired.matches) &&
    JSON.stringify(actual?.js || []) === JSON.stringify(desired.js);
}

async function injectDynamicCorrectionIntoOpenTabs() {
  if (!chrome.tabs?.query) {
    return 0;
  }

  const tabs = await chrome.tabs.query({ url: DYNAMIC_ORIGINS });
  let injected = 0;

  await Promise.all(
    tabs.map(async (tab) => {
      if (!Number.isInteger(tab.id)) {
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: DYNAMIC_CONTENT_SCRIPTS
        });
        injected += 1;
      } catch (error) {
        console.warn(
          `Could not enable automatic correction in tab ${tab.id}:`,
          error
        );
      }
    })
  );

  return injected;
}

async function syncDynamicContentScript() {
  const settings = SETTINGS_API?.loadSettings
    ? await SETTINGS_API.loadSettings(chrome.storage.sync)
    : await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const enabled =
    Boolean(settings.dynamic?.enabled) &&
    (await dynamicPermissionGranted());
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [DYNAMIC_CONTENT_SCRIPT_ID]
  });

  if (!enabled) {
    if (registered.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: [DYNAMIC_CONTENT_SCRIPT_ID]
      });
    }
    return false;
  }

  const desired = dynamicContentScriptDefinition();

  if (registered.length === 0) {
    await chrome.scripting.registerContentScripts([desired]);
    await injectDynamicCorrectionIntoOpenTabs();
    return true;
  }

  if (!sameContentScriptConfiguration(registered[0], desired)) {
    if (chrome.scripting.updateContentScripts) {
      await chrome.scripting.updateContentScripts([desired]);
    } else {
      await unregisterDynamicContentScript();
      await chrome.scripting.registerContentScripts([desired]);
    }
    await injectDynamicCorrectionIntoOpenTabs();
  }

  return true;
}

function scheduleDynamicContentScriptSync() {
  dynamicSyncPromise = dynamicSyncPromise
    .then(() => syncDynamicContentScript())
    .catch((error) => {
      console.warn("Could not update automatic correction:", error);
      return false;
    });
  return dynamicSyncPromise;
}

async function initializeExtension() {
  createMenu();
  await scheduleDynamicContentScriptSync();
}

chrome.runtime.onInstalled.addListener(initializeExtension);

chrome.runtime.onStartup?.addListener(scheduleDynamicContentScriptSync);

chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (message?.type === "qswapp:correct-text") {
    try {
      if (!TEXT_ANALYZER?.correctText) {
        throw new Error("The background analyzer is not initialized");
      }

      sendResponse({
        ok: true,
        correctedText: TEXT_ANALYZER.correctText(
          String(message.text || ""),
          message.options || {}
        )
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return false;
  }

  if (
    message?.type === "qswapp:run-manual" &&
    Number.isInteger(message.tabId)
  ) {
    runManualCorrectionInTab(message.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  return false;
});

chrome.commands?.onCommand.addListener(async (command, tab) => {
  if (command !== "fix-selection-v2") {
    return;
  }

  try {
    const activeTab =
      tab?.id
        ? tab
        : (await chrome.tabs.query({
            active: true,
            currentWindow: true
          }))[0];

    if (Number.isInteger(activeTab?.id)) {
      await runManualCorrectionInTab(activeTab.id);
    }
  } catch (error) {
    console.warn("Could not run correction from the keyboard shortcut:", error);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "sync" &&
    ("dynamic" in changes || "dynamicCorrection" in changes)
  ) {
    void scheduleDynamicContentScriptSync();
  }
});

chrome.permissions.onRemoved.addListener(async (permissions) => {
  if (
    permissions.origins?.some((origin) => DYNAMIC_ORIGINS.includes(origin))
  ) {
    const settings = SETTINGS_API?.loadSettings
      ? await SETTINGS_API.loadSettings(chrome.storage.sync)
      : await chrome.storage.sync.get(DEFAULT_SETTINGS);

    if (settings.dynamic?.enabled) {
      await chrome.storage.sync.set({
        dynamic: {
          ...settings.dynamic,
          enabled: false
        }
      });
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (String(info.menuItemId) !== MENU_ID || !tab?.id) {
    return;
  }

  const target = { tabId: tab.id };

  if (Number.isInteger(info.frameId)) {
    target.frameIds = [info.frameId];
  }

  try {
    await chrome.scripting.executeScript({
      target,
      files: CONTENT_SCRIPTS
    });
  } catch (error) {
    // The browser blocks injection on internal pages and in some protected
    // documents. A nested frameId is used when it is available.
    console.warn("Could not fix the keyboard layout:", error);
  }
});
