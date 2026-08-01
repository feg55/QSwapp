const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SETTINGS,
  DYNAMIC_ORIGINS,
  dynamicCorrectionOptions,
  isSiteAllowed,
  loadLocalSettings,
  loadSettings,
  manualCorrectionOptions,
  normalizeLocalSettings,
  normalizeSiteRule,
  normalizeSettings,
  saveLocalSettings,
  saveSettings
} = require("../settings");

test("uses safe defaults for all settings", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
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
  });
  assert.deepEqual(DYNAMIC_ORIGINS, [
    "http://*/*",
    "https://*/*"
  ]);
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
});

test("migrates legacy settings and persists the nested schema", async () => {
  const calls = [];
  const storage = {
    async get(query) {
      assert.equal(query, null);
      return {
        autocorrectTypos: false,
        dynamicCorrection: true
      };
    },
    async set(value) {
      calls.push(["set", value]);
    },
    async remove(keys) {
      calls.push(["remove", keys]);
    }
  };

  assert.deepEqual(await loadSettings(storage), {
    manual: {
      autocorrectTypos: false,
      convertLikelyUnknown: true,
      minimumLength: 1,
      aggressiveness: "balanced"
    },
    dynamic: {
      enabled: true,
      autocorrectTypos: false,
      convertLikelyUnknown: false,
      minimumLength: 3,
      aggressiveness: "safe"
    },
    appearance: {
      theme: "system",
      language: "system"
    }
  });
  assert.deepEqual(
    await saveSettings(
      {
        manual: {
          autocorrectTypos: 0,
          convertLikelyUnknown: 1,
          minimumLength: 99,
          aggressiveness: "aggressive"
        },
        dynamic: {
          enabled: "",
          autocorrectTypos: false,
          convertLikelyUnknown: true,
          minimumLength: "4",
          aggressiveness: "invalid"
        },
        appearance: {
          theme: "light",
          language: "ru"
        }
      },
      storage
    ),
    {
      manual: {
        autocorrectTypos: false,
        convertLikelyUnknown: true,
        minimumLength: 12,
        aggressiveness: "aggressive"
      },
      dynamic: {
        enabled: false,
        autocorrectTypos: false,
        convertLikelyUnknown: true,
        minimumLength: 4,
        aggressiveness: "safe"
      },
      appearance: {
        theme: "light",
        language: "ru"
      }
    }
  );
  assert.deepEqual(calls, [
    [
      "set",
      {
        manual: {
          autocorrectTypos: false,
          convertLikelyUnknown: true,
          minimumLength: 12,
          aggressiveness: "aggressive"
        },
        dynamic: {
          enabled: false,
          autocorrectTypos: false,
          convertLikelyUnknown: true,
          minimumLength: 4,
          aggressiveness: "safe"
        },
        appearance: {
          theme: "light",
          language: "ru"
        }
      }
    ],
    [
      "remove",
      [
        "autocorrectTypos",
        "convertLikelyUnknown",
        "dynamicCorrection"
      ]
    ]
  ]);
});

test("returns independent analyzer options for manual and dynamic modes", () => {
  const settings = normalizeSettings({
    manual: {
      autocorrectTypos: false,
      convertLikelyUnknown: true,
      minimumLength: 2,
      aggressiveness: "aggressive"
    },
    dynamic: {
      enabled: true,
      autocorrectTypos: true,
      convertLikelyUnknown: false,
      minimumLength: 5,
      aggressiveness: "safe"
    }
  });

  assert.deepEqual(
    manualCorrectionOptions(settings, {
      protectedTerms: ["Б.Ю. Иванов"]
    }),
    {
      ...settings.manual,
      protectedTerms: ["Б.Ю. Иванов"]
    }
  );
  assert.deepEqual(dynamicCorrectionOptions(settings), {
    ...settings.dynamic,
    dynamicCorrection: true,
    protectedTerms: [],
    excludedFieldCategories: [
      "passwords",
      "apiSecrets",
      "oneTimeCodes",
      "payment",
    ]
  });
});

test("normalizes local exclusions and evaluates site lists", async () => {
  const calls = [];
  const storage = {
    async get(query) {
      assert.equal(query, null);
      return {
        protectedTerms: "ExampleTerm\nexampleterm\nБ.Ю. Иванов",
        allowedSites: [
          "https://Example.com/path",
          "*.docs.example.org"
        ],
        blockedSites: "private.example.com\nbad rule!"
      };
    },
    async set(value) {
      calls.push(value);
    }
  };
  const local = await loadLocalSettings(storage);

  assert.deepEqual(local, {
    protectedTerms: ["ExampleTerm", "Б.Ю. Иванов"],
    allowedSites: ["example.com", "docs.example.org"],
    blockedSites: ["private.example.com"],
    excludedFieldCategories: [
      "passwords",
      "apiSecrets",
      "oneTimeCodes",
      "payment",
    ]
  });
  assert.equal(isSiteAllowed("https://www.example.com/page", local), true);
  assert.equal(isSiteAllowed("https://private.example.com", local), false);
  assert.equal(isSiteAllowed("https://unlisted.test", local), false);
  assert.deepEqual(
    await saveLocalSettings(normalizeLocalSettings(local), storage),
    local
  );
  assert.deepEqual(calls, [local]);
});

test("canonicalizes IDN and IPv6 site rules before matching", () => {
  assert.equal(normalizeSiteRule("банк.рф"), "xn--80ab2al.xn--p1ai");
  assert.equal(normalizeSiteRule("[::1]"), "[::1]");
  assert.equal(
    isSiteAllowed("https://банк.рф/login", {
      blockedSites: ["банк.рф"]
    }),
    false
  );
  assert.equal(
    isSiteAllowed("http://[::1]/", {
      blockedSites: ["[::1]"]
    }),
    false
  );
  assert.equal(
    isSiteAllowed("https://example.com", {
      excludedFieldCategories: []
    }),
    true
  );
});

test("migrates broad field exclusions to concrete sensitive types", () => {
  assert.deepEqual(
    normalizeLocalSettings({
      excludedFieldCategories: [
        "credentials",
        "payment",
        "personal",
        "technical"
      ]
    }).excludedFieldCategories,
    ["passwords", "apiSecrets", "oneTimeCodes", "payment"]
  );
});
