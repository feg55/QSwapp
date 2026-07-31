const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  TRANSLATIONS,
  applyLanguage,
  resolveLanguage,
  translate
} = require("../i18n");

test("assigns the browser language only when preference is still system", () => {
  assert.equal(resolveLanguage("system", "ru-RU"), "ru");
  assert.equal(resolveLanguage("system", "en-US"), "en");
  assert.equal(resolveLanguage("en", "ru-RU"), "en");
  assert.equal(resolveLanguage("ru", "en-US"), "ru");
});

test("applies translated text and accessible labels", () => {
  const label = {
    dataset: { i18n: "settingsTitle" },
    textContent: ""
  };
  const button = {
    dataset: { i18nAriaLabel: "allSettings" },
    setAttribute(name, value) {
      this[name] = value;
    }
  };
  const documentObject = {
    documentElement: { dataset: {}, lang: "" },
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") {
        return [label];
      }

      if (selector === "[data-i18n-aria-label]") {
        return [button];
      }

      return [];
    }
  };

  assert.equal(applyLanguage("ru", documentObject), "ru");
  assert.equal(documentObject.documentElement.lang, "ru");
  assert.equal(label.textContent, "Настройки");
  assert.equal(button["aria-label"], "Открыть все настройки");
  assert.equal(translate("en", "settingsTitle"), "Settings");
});

test("contains both translations for every interface key", () => {
  const root = path.resolve(__dirname, "..");
  const markup = ["options.html", "popup.html"]
    .map((filename) => fs.readFileSync(path.join(root, filename), "utf8"))
    .join("\n");
  const keys = Array.from(
    markup.matchAll(
      /data-i18n(?:-title|-aria-label|-placeholder)?="([^"]+)"/gu
    ),
    (match) => match[1]
  );

  for (const key of keys) {
    assert.equal(typeof TRANSLATIONS.en[key], "string", `en.${key}`);
    assert.equal(typeof TRANSLATIONS.ru[key], "string", `ru.${key}`);
  }
});
