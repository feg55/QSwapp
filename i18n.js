(function initializeQswappI18n(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.QswappI18n = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createI18n() {
  "use strict";

  const TRANSLATIONS = Object.freeze({
    en: Object.freeze({
      extensionName: "Qswapp",
      optionsDocumentTitle: "Settings — Qswapp",
      popupDocumentTitle: "Qswapp",
      settingsTitle: "Settings",
      settingsIntro:
        "Choose how actively the extension should correct your text. All processing happens offline.",
      manualHeading: "Manual correction",
      enabledByDefault: "Enabled by default",
      manualTypoTitle: "Correct one typo after switching layouts",
      manualTypoDescription:
        "For example, ghbdtm becomes привет. Ambiguous words remain unchanged.",
      manualUnknownTitle: "Convert likely names and unknown words",
      manualUnknownDescription:
        "Allows conversion when the result is not in the dictionary but looks more plausible than the original text.",
      manualLevelTitle: "Manual correction level",
      manualLevelDescription:
        "Safe mode rejects uncertain replacements more often.",
      minimumWordTitle: "Minimum word length",
      minimumWordDescription: "From 1 to 12 letters.",
      automaticHeading: "Automatic correction",
      whileTyping: "While typing",
      automaticEnabledTitle: "Correct completed words while typing",
      automaticEnabledDescription:
        "After a space or punctuation mark, only the last word is checked. Passwords, URLs, and technical terms are excluded.",
      permissionNote:
        "Your browser will request site access when this mode is enabled. Access is used only to detect completed words and is removed when the mode is disabled.",
      automaticTypoTitle: "Correct one typo automatically",
      automaticTypoDescription: "This does not affect manual correction.",
      automaticUnknownTitle: "Convert unknown words automatically",
      automaticUnknownDescription:
        "Disabled by default to avoid changing names and terms without clear dictionary evidence.",
      automaticLevelTitle: "Automatic correction level",
      automaticLevelDescription: "Safe evaluation is used by default.",
      automaticMinimumTitle: "Minimum automatic word length",
      automaticMinimumDescription:
        "Defaults to 3 letters; allowed range is 1 to 12.",
      exceptionsHeading: "Exceptions and sites",
      storedOnDevice: "Stored on this device",
      protectedTermsTitle: "Words and names that must not be changed",
      protectedTermsDescription:
        "Enter one word or phrase per line, for example ExampleTerm or Local Project.",
      protectedTermsPlaceholder: "ExampleTerm\nLocal Project",
      allowedSitesTitle: "Allowed sites for automatic correction",
      allowedSitesDescription:
        "Leave empty to allow all sites. A domain also includes its subdomains.",
      allowedSitesPlaceholder: "docs.example.com",
      blockedSitesTitle: "Blocked sites",
      blockedSitesDescription:
        "This list takes priority over allowed sites.",
      blockedSitesPlaceholder: "bank.example",
      privacyNote:
        "Text is never transmitted. Only mode preferences are synchronized between devices; exceptions remain on this device.",
      appearanceAndLanguage: "Theme and language",
      allSettings: "Open all settings",
      fixSelectedText: "Fix selected text",
      quickSettings: "Quick settings",
      popupAutomaticTitle: "Correct while typing",
      popupAutomaticDescription: "Check a word after a space",
      popupTyposTitle: "Correct typos",
      popupTyposDescription: "One typo after switching layouts",
      popupUnknownTitle: "Names and unknown words",
      popupUnknownDescription: "Convert a plausible result",
      safe: "Safe",
      balanced: "Balanced",
      aggressive: "Aggressive",
      switchToLight: "Switch to light theme",
      switchToDark: "Switch to dark theme",
      switchToEnglish: "Switch to English",
      switchToRussian: "Switch to Russian",
      siteAccessDenied: "Site access was not granted",
      settingsSaved: "Settings saved",
      saved: "Saved",
      loadSettingsFailed: "Could not load settings",
      saveSettingsFailed: "Could not save settings",
      saveFailed: "Could not save",
      activeTabUnavailable: "The active tab is unavailable",
      commandFailed: "The command could not run",
      selectionCheckStarted: "Selected text is being checked"
    }),
    ru: Object.freeze({
      extensionName: "Qswapp",
      optionsDocumentTitle: "Настройки — Qswapp",
      popupDocumentTitle: "Qswapp",
      settingsTitle: "Настройки",
      settingsIntro:
        "Выберите, насколько активно расширение должно исправлять текст. Все вычисления выполняются офлайн.",
      manualHeading: "Ручное исправление",
      enabledByDefault: "Включено по умолчанию",
      manualTypoTitle: "Исправлять одну опечатку после смены раскладки",
      manualTypoDescription:
        "Например, ghbdtm превращается в привет. При неоднозначности слово не меняется.",
      manualUnknownTitle: "Преобразовывать вероятные имена и неизвестные слова",
      manualUnknownDescription:
        "Разрешает смену раскладки, когда результата ещё нет в словаре, но он выглядит правдоподобнее исходного текста.",
      manualLevelTitle: "Уровень ручного исправления",
      manualLevelDescription:
        "Безопасный режим чаще отказывается от сомнительной замены.",
      minimumWordTitle: "Минимальная длина слова",
      minimumWordDescription: "От 1 до 12 букв.",
      automaticHeading: "Автоматическое исправление",
      whileTyping: "При наборе",
      automaticEnabledTitle: "Исправлять завершённые слова во время набора",
      automaticEnabledDescription:
        "После пробела или знака препинания проверяется только последнее слово. Пароли, URL и технические термины исключены.",
      permissionNote:
        "При включении браузер запросит доступ к сайтам. Он нужен только для определения завершённых слов и отзывается при выключении режима.",
      automaticTypoTitle: "Автоматически исправлять одну опечатку",
      automaticTypoDescription: "Не влияет на ручное исправление.",
      automaticUnknownTitle: "Автоматически преобразовывать неизвестные слова",
      automaticUnknownDescription:
        "По умолчанию выключено, чтобы не менять имена и термины без явного словарного подтверждения.",
      automaticLevelTitle: "Уровень автоматического исправления",
      automaticLevelDescription:
        "По умолчанию используется безопасная оценка.",
      automaticMinimumTitle: "Минимальная длина слова для авторежима",
      automaticMinimumDescription:
        "По умолчанию 3 буквы; допустимый диапазон — от 1 до 12.",
      exceptionsHeading: "Исключения и сайты",
      storedOnDevice: "На этом устройстве",
      protectedTermsTitle: "Слова и названия, которые нельзя изменять",
      protectedTermsDescription:
        "Введите по одному слову или выражению на строку, например ExampleTerm или Local Project.",
      protectedTermsPlaceholder: "ExampleTerm\nLocal Project",
      allowedSitesTitle: "Разрешённые сайты для авторежима",
      allowedSitesDescription:
        "Оставьте список пустым, чтобы разрешить все сайты. Домен включает и свои поддомены.",
      allowedSitesPlaceholder: "docs.example.com",
      blockedSitesTitle: "Запрещённые сайты",
      blockedSitesDescription:
        "Этот список имеет приоритет над разрешёнными сайтами.",
      blockedSitesPlaceholder: "bank.example",
      privacyNote:
        "Текст не отправляется. Между устройствами синхронизируются только настройки режимов; исключения остаются на этом устройстве.",
      appearanceAndLanguage: "Тема и язык",
      allSettings: "Открыть все настройки",
      fixSelectedText: "Исправить выделенный текст",
      quickSettings: "Быстрые настройки",
      popupAutomaticTitle: "Исправлять при наборе",
      popupAutomaticDescription: "Проверять слово после пробела",
      popupTyposTitle: "Исправлять опечатки",
      popupTyposDescription: "Одна опечатка после смены раскладки",
      popupUnknownTitle: "Имена и неизвестные слова",
      popupUnknownDescription: "Преобразовывать вероятный результат",
      safe: "Безопасный",
      balanced: "Сбалансированный",
      aggressive: "Агрессивный",
      switchToLight: "Переключить на светлую тему",
      switchToDark: "Переключить на тёмную тему",
      switchToEnglish: "Переключить на английский",
      switchToRussian: "Переключить на русский",
      siteAccessDenied: "Доступ к сайтам не предоставлен",
      settingsSaved: "Настройки сохранены",
      saved: "Сохранено",
      loadSettingsFailed: "Не удалось загрузить настройки",
      saveSettingsFailed: "Не удалось сохранить настройки",
      saveFailed: "Не удалось сохранить",
      activeTabUnavailable: "Активная вкладка недоступна",
      commandFailed: "Не удалось выполнить команду",
      selectionCheckStarted: "Проверка выделенного текста запущена"
    })
  });

  function resolveLanguage(preference, browserLanguage = "") {
    if (preference === "en" || preference === "ru") {
      return preference;
    }

    return /^ru(?:[-_]|$)/iu.test(String(browserLanguage)) ? "ru" : "en";
  }

  function translate(language, key) {
    const resolved = resolveLanguage(language);
    return TRANSLATIONS[resolved][key] ?? TRANSLATIONS.en[key] ?? key;
  }

  function applyLanguage(
    preference,
    documentObject = globalThis.document,
    browserLanguage =
      documentObject?.defaultView?.navigator?.language ?? ""
  ) {
    const normalized = ["en", "ru", "system"].includes(preference)
      ? preference
      : "system";
    const resolved = resolveLanguage(normalized, browserLanguage);
    const root = documentObject?.documentElement;

    if (root?.dataset) {
      root.dataset.language = resolved;
      root.dataset.languagePreference = normalized;
      root.lang = resolved;
    }

    for (const element of documentObject?.querySelectorAll?.(
      "[data-i18n]"
    ) ?? []) {
      element.textContent = translate(resolved, element.dataset.i18n);
    }

    for (const element of documentObject?.querySelectorAll?.(
      "[data-i18n-title]"
    ) ?? []) {
      element.title = translate(resolved, element.dataset.i18nTitle);
    }

    for (const element of documentObject?.querySelectorAll?.(
      "[data-i18n-aria-label]"
    ) ?? []) {
      element.setAttribute(
        "aria-label",
        translate(resolved, element.dataset.i18nAriaLabel)
      );
    }

    for (const element of documentObject?.querySelectorAll?.(
      "[data-i18n-placeholder]"
    ) ?? []) {
      element.placeholder = translate(
        resolved,
        element.dataset.i18nPlaceholder
      );
    }

    return resolved;
  }

  return {
    TRANSLATIONS,
    applyLanguage,
    resolveLanguage,
    translate
  };
});
