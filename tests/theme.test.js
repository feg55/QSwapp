const test = require("node:test");
const assert = require("node:assert/strict");

const { applyTheme, resolveTheme } = require("../theme");

test("resolves a system theme to one concrete value", () => {
  assert.equal(resolveTheme("dark"), "dark");
  assert.equal(resolveTheme("light"), "light");
  assert.equal(
    resolveTheme("system", {
      matchMedia() {
        return { matches: true };
      }
    }),
    "light"
  );
});

test("applies the resolved theme without a light startup flash", () => {
  const documentObject = {
    documentElement: { dataset: {} },
    defaultView: {
      matchMedia() {
        return { matches: false };
      }
    }
  };

  assert.equal(applyTheme("system", documentObject), "dark");
  assert.deepEqual(documentObject.documentElement.dataset, {
    theme: "dark",
    themePreference: "system"
  });
  assert.equal(applyTheme("unexpected", documentObject), "dark");
  assert.equal(
    documentObject.documentElement.dataset.themePreference,
    "dark"
  );
});
