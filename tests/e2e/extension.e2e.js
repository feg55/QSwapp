const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright-core");

const EXTENSION_ROOT = path.resolve(__dirname, "../..");
const SCREENSHOT_DIRECTORY =
  process.env.LAYOUT_FIXER_SCREENSHOTS_DIR || "";
const BROWSER_EXECUTABLES = [
  process.env.LAYOUT_FIXER_BROWSER,
  "/opt/homebrew/bin/chromium",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
].filter(Boolean);

function browserExecutable() {
  return BROWSER_EXECUTABLES.find((candidate) => fs.existsSync(candidate));
}

async function saveUiScreenshot(page, filename) {
  if (!SCREENSHOT_DIRECTORY) {
    return;
  }

  fs.mkdirSync(SCREENSHOT_DIRECTORY, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIRECTORY, filename),
    fullPage: true
  });
}

async function launchExtension() {
  const executablePath = browserExecutable();

  if (!executablePath) {
    throw new Error(
      "A compatible browser was not found. Set LAYOUT_FIXER_BROWSER."
    );
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "layout-fixer-e2e-")
  );
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: true,
    colorScheme: "dark",
    locale: "en-US",
    args: [
      `--disable-extensions-except=${EXTENSION_ROOT}`,
      `--load-extension=${EXTENSION_ROOT}`
    ]
  });
  let [serviceWorker] = context.serviceWorkers();

  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }

  return {
    context,
    extensionId: new URL(serviceWorker.url()).host,
    serviceWorker,
    async close() {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  };
}

test("assigns system appearance once and loads the settings page", async () => {
  const extension = await launchExtension();

  try {
    const page = await extension.context.newPage();
    await page.goto(
      `chrome-extension://${extension.extensionId}/options.html`
    );

    assert.equal(await page.locator("h1").textContent(), "Settings");
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "dark"
    );
    assert.equal(
      await page.locator("html").getAttribute("data-language"),
      "en"
    );
    assert.equal(await page.locator("#theme").count(), 0);
    assert.equal(await page.locator("#themeToggle").count(), 1);
    assert.equal(await page.locator("#languageToggle").count(), 1);
    const themeButtonBox =
      await page.locator("#themeToggle").boundingBox();
    assert.equal(Math.round(themeButtonBox.width), 40);
    assert.equal(Math.round(themeButtonBox.height), 40);
    assert.equal(
      await page.locator("#manualAutocorrectTypos").isChecked(),
      true
    );
    assert.equal(
      await page.locator("#manualConvertLikelyUnknown").isChecked(),
      true
    );
    assert.equal(
      await page.locator("#dynamicEnabled").isChecked(),
      false
    );
    await page.waitForFunction(async () => {
      const stored = await chrome.storage.sync.get(null);
      return (
        stored.appearance?.theme === "dark" &&
        stored.appearance?.language === "en"
      );
    });
    await saveUiScreenshot(page, "options-dark.png");

    await page.emulateMedia({ colorScheme: "light" });
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "dark"
    );

    await page.locator("#languageToggle").click();
    await page.waitForFunction(
      () => document.documentElement.dataset.language === "ru"
    );
    assert.equal(await page.locator("h1").textContent(), "Настройки");
    await saveUiScreenshot(page, "options-russian.png");
  } finally {
    await extension.close();
  }
});

test("opens compact settings with square theme and language buttons", async () => {
  const extension = await launchExtension();

  try {
    const page = await extension.context.newPage();
    await page.goto(
      `chrome-extension://${extension.extensionId}/popup.html`
    );
    const manifest = await extension.serviceWorker.evaluate(
      () => chrome.runtime.getManifest()
    );

    assert.equal(manifest.action.default_popup, "popup.html");
    assert.equal(
      await page.locator("h1").textContent(),
      "Layout Fixer"
    );
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "dark"
    );
    assert.equal(
      await page.locator("html").getAttribute("data-language"),
      "en"
    );
    assert.equal(
      await page.locator("#popupAutocorrectTypos").isChecked(),
      true
    );
    assert.equal(
      await page.locator("#popupConvertUnknown").isChecked(),
      true
    );
    assert.equal(
      await page.locator("#popupDynamicEnabled").isChecked(),
      false
    );
    assert.equal(
      Math.round((await page.locator("body").boundingBox()).width),
      360
    );
    assert.equal(await page.locator("#popupTheme").count(), 0);
    const popupThemeButtonBox =
      await page.locator("#popupThemeToggle").boundingBox();
    const popupLanguageButtonBox =
      await page.locator("#popupLanguageToggle").boundingBox();
    assert.equal(Math.round(popupThemeButtonBox.width), 34);
    assert.equal(Math.round(popupThemeButtonBox.height), 34);
    assert.equal(Math.round(popupLanguageButtonBox.width), 34);
    assert.equal(Math.round(popupLanguageButtonBox.height), 34);
    await saveUiScreenshot(page, "popup-dark.png");

    await page.emulateMedia({ colorScheme: "light" });
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "dark"
    );

    await page.locator("#popupLanguageToggle").click();
    await page.waitForFunction(
      () => document.documentElement.dataset.language === "ru"
    );
    assert.equal(
      await page.locator("h1").textContent(),
      "Layout Fixer"
    );
    assert.equal(
      await page.locator('[data-i18n="popupAutomaticTitle"]').textContent(),
      "Исправлять при наборе"
    );

    await page.locator("#popupThemeToggle").click();
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light"
    );
    await page.waitForFunction(async () => {
      const stored = await chrome.storage.sync.get(null);
      return (
        stored.appearance?.theme === "light" &&
        stored.appearance?.language === "ru"
      );
    });
    await saveUiScreenshot(page, "popup-russian-light.png");
  } finally {
    await extension.close();
  }
});

test("preserves formatting during a real contenteditable replacement", async () => {
  const extension = await launchExtension();

  try {
    const page = await extension.context.newPage();
    await page.goto(
      `chrome-extension://${extension.extensionId}/tests/browser-fixture.html`
    );

    const result = await page.evaluate(() => {
      const host = document.getElementById("formatted-editable");
      const first = host.querySelector("b").firstChild;
      const last = host.querySelector("a").firstChild;
      const range = document.createRange();

      range.setStart(first, 0);
      range.setEnd(last, last.data.length);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      host.focus();

      return window.LayoutFixer.replaceSelectedText(document);
    });

    assert.deepEqual(result, {
      ok: true,
      changed: true,
      correctedText: "привет"
    });
    assert.equal(
      await page.locator("#formatted-editable b").textContent(),
      "при"
    );
    assert.equal(
      await page.locator("#formatted-editable a").textContent(),
      "вет"
    );
    assert.equal(
      await page.locator("#formatted-editable a").getAttribute("href"),
      "#"
    );
  } finally {
    await extension.close();
  }
});

test("corrects a completed word dynamically in a real browser", async () => {
  const extension = await launchExtension();

  try {
    await extension.serviceWorker.evaluate(async () => {
      await chrome.storage.sync.set({
        manual: {
          autocorrectTypos: true,
          convertLikelyUnknown: true,
          minimumLength: 1,
          aggressiveness: "balanced"
        },
        dynamic: {
          enabled: true,
          autocorrectTypos: true,
          convertLikelyUnknown: true,
          minimumLength: 1,
          aggressiveness: "balanced"
        }
      });
    });

    const page = await extension.context.newPage();
    await page.goto(
      `chrome-extension://${extension.extensionId}/tests/browser-fixture.html`
    );
    await page.evaluate(() => window.LayoutFixerDynamic.ready);
    const input = page.locator("#dynamic-input");

    await input.focus();
    await input.pressSequentially("ghbdtn ");
    await page.waitForFunction(
      () => document.getElementById("dynamic-input").value === "привет "
    );
    assert.equal(await input.inputValue(), "привет ");
    assert.equal(await page.locator("#password").inputValue(), "ghbdtn");
  } finally {
    await extension.close();
  }
});

test("supports open Shadow DOM and protects custom password widgets", async () => {
  const extension = await launchExtension();

  try {
    await extension.serviceWorker.evaluate(async () => {
      await chrome.storage.sync.set({
        dynamic: {
          enabled: true,
          autocorrectTypos: true,
          convertLikelyUnknown: true,
          minimumLength: 1,
          aggressiveness: "balanced"
        }
      });
    });
    const page = await extension.context.newPage();
    await page.goto(
      `chrome-extension://${extension.extensionId}/tests/browser-fixture.html`
    );
    await page.evaluate(() => window.LayoutFixerDynamic.ready);

    const manualResult = await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "shadow-manual";
      const shadow = host.attachShadow({ mode: "open" });
      const input = document.createElement("input");
      input.value = "ghbdtn";
      shadow.appendChild(input);
      document.body.appendChild(host);
      input.focus();
      input.setSelectionRange(0, input.value.length);

      return window.LayoutFixer.replaceSelectedText(document);
    });

    assert.deepEqual(manualResult, {
      ok: true,
      changed: true,
      correctedText: "привет"
    });
    assert.equal(
      await page
        .locator("#shadow-manual")
        .locator("input")
        .inputValue(),
      "привет"
    );

    const protectedResult = await page.evaluate(() => {
      const widget = document.createElement("div");
      widget.contentEditable = "true";
      widget.setAttribute("autocomplete", "current-password");
      widget.textContent = "ghbdtn";
      document.body.appendChild(widget);
      const range = document.createRange();
      range.selectNodeContents(widget);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      widget.focus();

      return window.LayoutFixer.replaceSelectedText(document);
    });

    assert.deepEqual(protectedResult, {
      ok: false,
      reason: "protected-field"
    });

    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "shadow-dynamic";
      const shadow = host.attachShadow({ mode: "open" });
      const input = document.createElement("input");
      shadow.appendChild(input);
      document.body.appendChild(host);
    });
    const dynamicInput = page
      .locator("#shadow-dynamic")
      .locator("input");
    await dynamicInput.focus();
    await dynamicInput.pressSequentially("ghbdtn ");
    await page.waitForFunction(
      () =>
        document
          .getElementById("shadow-dynamic")
          .shadowRoot.querySelector("input").value === "привет "
    );
    assert.equal(await dynamicInput.inputValue(), "привет ");
  } finally {
    await extension.close();
  }
});

test("applies local site lists and protected terms without reload", async () => {
  const extension = await launchExtension();

  try {
    await extension.serviceWorker.evaluate(
      async ({ extensionId }) => {
        await chrome.storage.sync.set({
          dynamic: {
            enabled: true,
            autocorrectTypos: true,
            convertLikelyUnknown: true,
            minimumLength: 1,
            aggressiveness: "balanced"
          }
        });
        await chrome.storage.local.set({
          blockedSites: [extensionId],
          protectedTerms: []
        });
      },
      { extensionId: extension.extensionId }
    );
    const page = await extension.context.newPage();
    await page.goto(
      `chrome-extension://${extension.extensionId}/tests/browser-fixture.html`
    );
    await page.evaluate(() => window.LayoutFixerDynamic.ready);
    const input = page.locator("#dynamic-input");

    await input.pressSequentially("ghbdtn ");
    assert.equal(await input.inputValue(), "ghbdtn ");

    await extension.serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        blockedSites: [],
        protectedTerms: ["привет"]
      });
    });
    await input.fill("");
    await input.pressSequentially("ghbdtn ");
    assert.equal(await input.inputValue(), "ghbdtn ");

    await extension.serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({ protectedTerms: [] });
    });
    await input.fill("");
    await input.pressSequentially("ghbdtn ");
    await page.waitForFunction(
      () => document.getElementById("dynamic-input").value === "привет "
    );
  } finally {
    await extension.close();
  }
});
