const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackground({
  dynamicCorrection = false,
  permissionGranted = false,
  openTabIds = []
} = {}) {
  const listeners = {};
  const createdMenus = [];
  const injections = [];
  const registeredContentScripts = [];
  const registrationCalls = [];
  const updateCalls = [];
  const unregisterCalls = [];
  const storageState = {
    manual: {
      autocorrectTypos: true,
      convertLikelyUnknown: true,
      minimumLength: 1,
      aggressiveness: "balanced"
    },
    dynamic: {
      enabled: dynamicCorrection,
      autocorrectTypos: true,
      convertLikelyUnknown: false,
      minimumLength: 3,
      aggressiveness: "safe"
    },
    appearance: {
      theme: "dark",
      language: "en"
    }
  };
  const chrome = {
    commands: {
      onCommand: {
        addListener(listener) {
          listeners.command = listener;
        }
      }
    },
    contextMenus: {
      removeAll(callback) {
        createdMenus.length = 0;
        callback();
      },
      create(properties, callback) {
        createdMenus.push(properties);
        callback();
      },
      onClicked: {
        addListener(listener) {
          listeners.onClicked = listener;
        }
      }
    },
    runtime: {
      id: "layout-fixer-test",
      lastError: null,
      onMessage: {
        addListener(listener) {
          listeners.message = listener;
        }
      },
      onInstalled: {
        addListener(listener) {
          listeners.onInstalled = listener;
        }
      },
      onStartup: {
        addListener(listener) {
          listeners.onStartup = listener;
        }
      }
    },
    permissions: {
      async contains() {
        return permissionGranted;
      },
      onRemoved: {
        addListener(listener) {
          listeners.permissionsRemoved = listener;
        }
      }
    },
    storage: {
      sync: {
        async get(query) {
          return query === null
            ? { ...storageState }
            : { ...query, ...storageState };
        },
        async set(values) {
          Object.assign(storageState, values);
        }
      },
      onChanged: {
        addListener(listener) {
          listeners.storageChanged = listener;
        }
      }
    },
    tabs: {
      async query(query) {
        return query.url
          ? openTabIds.map((id) => ({ id }))
          : [{ id: 42 }];
      }
    },
    scripting: {
      async executeScript(injection) {
        injections.push(injection);
        return injection.func
          ? [
              { frameId: 0, result: false },
              { frameId: 17, result: true }
            ]
          : [];
      },
      async getRegisteredContentScripts() {
        return registeredContentScripts.slice();
      },
      async registerContentScripts(scripts) {
        registrationCalls.push(scripts);
        registeredContentScripts.push(...scripts);
      },
      async updateContentScripts(scripts) {
        updateCalls.push(scripts);
        for (const script of scripts) {
          const index = registeredContentScripts.findIndex(
            (registered) => registered.id === script.id
          );
          if (index >= 0) {
            registeredContentScripts[index] = script;
          }
        }
      },
      async unregisterContentScripts({ ids }) {
        unregisterCalls.push(ids);
        for (let index = registeredContentScripts.length - 1; index >= 0; index -= 1) {
          if (ids.includes(registeredContentScripts[index].id)) {
            registeredContentScripts.splice(index, 1);
          }
        }
      }
    }
  };
  const filename = path.join(__dirname, "..", "background.js");

  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { chrome, console });
  return {
    listeners,
    createdMenus,
    injections,
    registeredContentScripts,
    registrationCalls,
    unregisterCalls,
    updateCalls,
    storageState
  };
}

test("creates exactly one context-menu item without a submenu", async () => {
  const { listeners, createdMenus } = loadBackground();

  await listeners.onInstalled();
  assert.equal(createdMenus.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(createdMenus[0])),
    {
      id: "layout-fixer",
    title: "Fix keyboard layout",
      contexts: ["editable"]
    }
  );
  assert.equal("parentId" in createdMenus[0], false);
});

test("injects all layers into the frame where the menu was clicked", async () => {
  const { listeners, injections } = loadBackground();

  await listeners.onClicked(
    { menuItemId: "layout-fixer", frameId: 17 },
    { id: 42 }
  );

  assert.equal(injections.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(injections[0])),
    {
      target: {
        tabId: 42,
        frameIds: [17]
      },
      files: [
        "settings.js",
        "field-safety.js",
        "analysis-client.js",
        "replace-selection.js"
      ]
    }
  );
});

test("registers dynamic correction only when enabled and permitted", async () => {
  const { listeners, registeredContentScripts } = loadBackground({
    dynamicCorrection: true,
    permissionGranted: true
  });

  await listeners.onInstalled();

  assert.equal(registeredContentScripts.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(registeredContentScripts[0])),
    {
      id: "layout-fixer-dynamic",
      matches: ["http://*/*", "https://*/*"],
      js: [
        "settings.js",
        "field-safety.js",
        "analysis-client.js",
        "dynamic-correction.js"
      ],
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: "document_idle",
      persistAcrossSessions: true
    }
  );
});

test("does not register dynamic correction without site permission", async () => {
  const { listeners, registeredContentScripts } = loadBackground({
    dynamicCorrection: true,
    permissionGranted: false
  });

  await listeners.onInstalled();
  assert.equal(registeredContentScripts.length, 0);
});

test("does not re-register an unchanged dynamic content script", async () => {
  const loaded = loadBackground({
    dynamicCorrection: true,
    permissionGranted: true
  });

  await loaded.listeners.onInstalled();
  await loaded.listeners.onStartup();

  assert.equal(loaded.registrationCalls.length, 1);
  assert.equal(loaded.updateCalls.length, 0);
  assert.equal(loaded.unregisterCalls.length, 0);
});

test("injects dynamic correction into already open tabs when enabled", async () => {
  const loaded = loadBackground({
    dynamicCorrection: true,
    permissionGranted: true,
    openTabIds: [11, 12]
  });

  await loaded.listeners.onInstalled();

  const fileInjections = loaded.injections.filter(
    (injection) => injection.files
  );
  assert.equal(fileInjections.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(fileInjections[0].target)),
    { tabId: 11, allFrames: true }
  );
});

test("runs the hotkey in the frame that owns the selection", async () => {
  const loaded = loadBackground();

  await loaded.listeners.command("fix-selection", { id: 42 });

  assert.equal(loaded.injections.length, 2);
  assert.equal(typeof loaded.injections[0].func, "function");
  assert.deepEqual(
    JSON.parse(JSON.stringify(loaded.injections[0].target)),
    { tabId: 42, allFrames: true }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(loaded.injections[1].target)),
    { tabId: 42, frameIds: [17] }
  );
});

test("runs manual correction requested by the popup", async () => {
  const loaded = loadBackground();
  let response;
  const keepChannelOpen = loaded.listeners.message(
    { type: "layout-fixer:run-manual", tabId: 42 },
    { id: "layout-fixer-test" },
    (value) => {
      response = value;
    }
  );

  assert.equal(keepChannelOpen, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: true });
  assert.equal(loaded.injections.length, 2);
});
