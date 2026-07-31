const test = require("node:test");
const assert = require("node:assert/strict");

const {
  correctionOptionsForField,
  isSensitiveField,
  isStrictTextField
} = require("../field-safety");

function createElement(attributes = {}, parentElement = null) {
  return {
    nodeType: 1,
    parentElement,
    type: attributes.type || "",
    name: attributes.name || "",
    id: attributes.id || "",
    className: attributes.className || "",
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    getRootNode() {
      return { host: null };
    }
  };
}

test("detects native and custom sensitive fields", () => {
  assert.equal(isSensitiveField(createElement({ type: "password" })), true);
  assert.equal(
    isSensitiveField(
      createElement({
        contenteditable: "true",
        autocomplete: "current-password"
      })
    ),
    true
  );
  assert.equal(
    isSensitiveField(
      createElement({
        contenteditable: "true",
        "aria-label": "Новый пароль"
      })
    ),
    true
  );
  assert.equal(
    isSensitiveField(
      createElement({
        contenteditable: "true",
        "data-sensitive": "true"
      })
    ),
    true
  );
  assert.equal(
    isSensitiveField(createElement({ "aria-label": "Комментарий" })),
    false
  );
});

test("inherits sensitive and technical context through ancestors", () => {
  const passwordWrapper = createElement({
    className: "account-password-editor"
  });
  const passwordEditor = createElement(
    { contenteditable: "true" },
    passwordWrapper
  );
  const codeWrapper = createElement({ className: "monaco-code-editor" });
  const codeEditor = createElement(
    { contenteditable: "true" },
    codeWrapper
  );

  assert.equal(isSensitiveField(passwordEditor), true);
  assert.equal(isStrictTextField(codeEditor), true);
  assert.deepEqual(correctionOptionsForField({}, codeEditor), {
    bareDomainPolicy: "strict"
  });
});

test("uses strict domain protection for URL and email fields", () => {
  assert.equal(isStrictTextField(createElement({ type: "url" })), true);
  assert.equal(
    isStrictTextField(createElement({ inputmode: "email" })),
    true
  );
  assert.equal(isStrictTextField(createElement({ type: "text" })), false);
});
