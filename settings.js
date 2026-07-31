(function initializeLayoutFixerSettings(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LayoutFixerSettings = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createSettings() {
  "use strict";

  const DEFAULT_MANUAL_SETTINGS = Object.freeze({
    autocorrectTypos: true,
    convertLikelyUnknown: true,
    minimumLength: 1,
    aggressiveness: "balanced"
  });
  const DEFAULT_DYNAMIC_SETTINGS = Object.freeze({
    enabled: false,
    autocorrectTypos: true,
    convertLikelyUnknown: false,
    minimumLength: 3,
    aggressiveness: "safe"
  });
  const DEFAULT_APPEARANCE_SETTINGS = Object.freeze({
    theme: "system",
    language: "system"
  });
  const DEFAULT_SETTINGS = Object.freeze({
    manual: DEFAULT_MANUAL_SETTINGS,
    dynamic: DEFAULT_DYNAMIC_SETTINGS,
    appearance: DEFAULT_APPEARANCE_SETTINGS
  });
  const DEFAULT_LOCAL_SETTINGS = Object.freeze({
    protectedTerms: Object.freeze([]),
    allowedSites: Object.freeze([]),
    blockedSites: Object.freeze([])
  });
  const DYNAMIC_ORIGINS = Object.freeze([
    "http://*/*",
    "https://*/*"
  ]);

  function normalizeMinimumLength(value, fallback) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.max(1, Math.min(12, parsed));
  }

  function normalizeAggressiveness(value, fallback) {
    return ["safe", "balanced", "aggressive"].includes(value)
      ? value
      : fallback;
  }

  function normalizeTheme(value) {
    return ["dark", "light", "system"].includes(value) ? value : "system";
  }

  function normalizeLanguage(value) {
    return ["en", "ru", "system"].includes(value) ? value : "system";
  }

  function normalizeMode(value = {}, defaults = DEFAULT_MANUAL_SETTINGS) {
    return {
      autocorrectTypos:
        value.autocorrectTypos === undefined
          ? defaults.autocorrectTypos
          : Boolean(value.autocorrectTypos),
      convertLikelyUnknown:
        value.convertLikelyUnknown === undefined
          ? defaults.convertLikelyUnknown
          : Boolean(value.convertLikelyUnknown),
      minimumLength: normalizeMinimumLength(
        value.minimumLength,
        defaults.minimumLength
      ),
      aggressiveness: normalizeAggressiveness(
        value.aggressiveness,
        defaults.aggressiveness
      )
    };
  }

  function normalizeSettings(value = {}) {
    const legacyMode = {
      autocorrectTypos: value.autocorrectTypos,
      convertLikelyUnknown: value.convertLikelyUnknown
    };
    const manual = normalizeMode(
      value.manual || legacyMode,
      DEFAULT_MANUAL_SETTINGS
    );
    const dynamicMode = normalizeMode(
      value.dynamic || legacyMode,
      DEFAULT_DYNAMIC_SETTINGS
    );

    return {
      manual,
      dynamic: {
        enabled:
          value.dynamic?.enabled === undefined
            ? Boolean(value.dynamicCorrection)
            : Boolean(value.dynamic.enabled),
        ...dynamicMode
      },
      appearance: {
        theme: normalizeTheme(value.appearance?.theme ?? value.theme),
        language: normalizeLanguage(
          value.appearance?.language ?? value.language
        )
      }
    };
  }

  function normalizeList(value, maximumItems = 250, maximumLength = 160) {
    const entries = Array.isArray(value)
      ? value
      : String(value || "").split(/\r?\n/u);
    const seen = new Set();
    const normalized = [];

    for (const entry of entries) {
      const item = String(entry).trim().slice(0, maximumLength);
      const key = item.toLocaleLowerCase();

      if (!item || seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(item);

      if (normalized.length >= maximumItems) {
        break;
      }
    }

    return normalized;
  }

  function normalizeSiteRule(value) {
    let rule = String(value || "").trim().toLocaleLowerCase();

    if (!rule) {
      return "";
    }

    rule = rule
      .replace(/^[a-z][a-z0-9+.-]*:\/\//u, "")
      .split(/[/?#]/u, 1)[0]
      .replace(/^\*\./u, "")
      .replace(/^\.+|\.+$/gu, "");

    if (rule.startsWith("[") && rule.includes("]")) {
      rule = rule.slice(1, rule.indexOf("]"));
    } else {
      rule = rule.replace(/:\d+$/u, "");
    }

    return /^[a-z0-9а-яё.-]+$/u.test(rule) ? rule : "";
  }

  function normalizeSiteList(value) {
    return normalizeList(value)
      .map(normalizeSiteRule)
      .filter((rule, index, rules) => rule && rules.indexOf(rule) === index);
  }

  function normalizeLocalSettings(value = {}) {
    return {
      protectedTerms: normalizeList(value.protectedTerms, 500, 160),
      allowedSites: normalizeSiteList(value.allowedSites),
      blockedSites: normalizeSiteList(value.blockedSites)
    };
  }

  async function loadLocalSettings(
    storageArea = globalThis.chrome?.storage?.local
  ) {
    if (!storageArea?.get) {
      return normalizeLocalSettings();
    }

    return normalizeLocalSettings(await storageArea.get(null));
  }

  async function saveLocalSettings(
    value,
    storageArea = globalThis.chrome?.storage?.local
  ) {
    const settings = normalizeLocalSettings(value);
    await storageArea?.set?.(settings);
    return settings;
  }

  function siteRuleMatches(hostname, rule) {
    const host = String(hostname || "").toLocaleLowerCase().replace(/\.$/u, "");
    const normalizedRule = normalizeSiteRule(rule);

    return Boolean(
      normalizedRule &&
      (host === normalizedRule || host.endsWith(`.${normalizedRule}`))
    );
  }

  function hostnameFrom(value) {
    if (typeof value === "object" && value?.hostname) {
      return value.hostname;
    }

    try {
      return new URL(String(value)).hostname;
    } catch {
      return normalizeSiteRule(value);
    }
  }

  function isSiteAllowed(value, localSettings = {}) {
    const settings = normalizeLocalSettings(localSettings);
    const hostname = hostnameFrom(value);

    if (!hostname) {
      return false;
    }

    if (
      settings.blockedSites.some((rule) =>
        siteRuleMatches(hostname, rule)
      )
    ) {
      return false;
    }

    return (
      settings.allowedSites.length === 0 ||
      settings.allowedSites.some((rule) =>
        siteRuleMatches(hostname, rule)
      )
    );
  }

  async function loadSettings(storageArea = globalThis.chrome?.storage?.sync) {
    if (!storageArea?.get) {
      return normalizeSettings();
    }

    const stored = await storageArea.get(null);
    return normalizeSettings(stored);
  }

  async function saveSettings(
    value,
    storageArea = globalThis.chrome?.storage?.sync
  ) {
    const settings = normalizeSettings(value);

    if (storageArea?.set) {
      await storageArea.set(settings);
      await storageArea.remove?.([
        "autocorrectTypos",
        "convertLikelyUnknown",
        "dynamicCorrection"
      ]);
    }

    return settings;
  }

  function manualCorrectionOptions(value = {}, localSettings = {}) {
    return {
      ...normalizeSettings(value).manual,
      protectedTerms: normalizeLocalSettings(localSettings).protectedTerms
    };
  }

  function dynamicCorrectionOptions(value = {}, localSettings = {}) {
    const settings = normalizeSettings(value);

    return {
      ...settings.dynamic,
      dynamicCorrection: settings.dynamic.enabled,
      protectedTerms: normalizeLocalSettings(localSettings).protectedTerms
    };
  }

  return {
    DEFAULT_APPEARANCE_SETTINGS,
    DEFAULT_DYNAMIC_SETTINGS,
    DEFAULT_LOCAL_SETTINGS,
    DEFAULT_MANUAL_SETTINGS,
    DEFAULT_SETTINGS,
    DYNAMIC_ORIGINS,
    dynamicCorrectionOptions,
    isSiteAllowed,
    loadLocalSettings,
    loadSettings,
    manualCorrectionOptions,
    normalizeLocalSettings,
    normalizeLanguage,
    normalizeMode,
    normalizeSiteRule,
    normalizeSettings,
    normalizeTheme,
    saveLocalSettings,
    saveSettings,
    siteRuleMatches
  };
});
