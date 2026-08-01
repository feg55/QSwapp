const test = require("node:test");
const assert = require("node:assert/strict");

const {
  correctionOptionsForField,
  fieldCategories,
  isSensitiveField,
  isStrictTextField,
  shouldSkipAutomaticField
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

test("reads associated labels and applies configurable automatic exclusions", () => {
  const verificationLabel = createElement({ id: "verification-label" });
  verificationLabel.textContent = "Код подтверждения";
  const verificationField = createElement({
    "aria-labelledby": "verification-label"
  });
  verificationField.ownerDocument = {
    getElementById(id) {
      return id === "verification-label" ? verificationLabel : null;
    }
  };
  const paymentField = createElement({ autocomplete: "cc-number" });
  const personalField = createElement({ "aria-label": "E-mail" });
  const technicalField = createElement({ className: "source-code-editor" });

  assert.deepEqual(
    fieldCategories(verificationField),
    ["credentials", "technical"]
  );
  assert.equal(shouldSkipAutomaticField(verificationField, []), true);
  assert.equal(shouldSkipAutomaticField(paymentField, ["payment"]), true);
  assert.equal(shouldSkipAutomaticField(paymentField, []), false);
  assert.equal(shouldSkipAutomaticField(personalField, ["personal"]), true);
  assert.equal(shouldSkipAutomaticField(personalField, []), false);
  assert.equal(
    shouldSkipAutomaticField(technicalField, ["technical"]),
    true
  );
});
