(function initializeFieldSafety(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.QswappFieldSafety = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createFieldSafety() {
  "use strict";

  const PASSWORD_AUTOCOMPLETE = new Set([
    "current-password",
    "new-password"
  ]);
  const ONE_TIME_CODE_AUTOCOMPLETE = new Set(["one-time-code"]);
  const PAYMENT_AUTOCOMPLETE = new Set([
    "cc-name",
    "cc-given-name",
    "cc-additional-name",
    "cc-family-name",
    "cc-number",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
    "cc-csc",
    "cc-type",
    "transaction-currency",
    "transaction-amount"
  ]);
  const PASSWORD_PATTERN = /password|passwd|\bpwd\b|парол/ui;
  const ONE_TIME_CODE_PATTERN =
    /passcode|pin(?:\s|_|-)?code|\botp\b|one(?:\s|_|-)?time|verification(?:\s|_|-)?code|recovery(?:\s|_|-)?code|backup(?:\s|_|-)?code|security(?:\s|_|-)?code|пин|одноразов|код(?:\s|_|-)?(?:доступа|подтверждения|восстановления|безопасности)|резервн(?:ый|ого)?(?:\s|_|-)?код/ui;
  const API_SECRET_PATTERN =
    /api(?:\s|_|-)?key|access(?:\s|_|-)?token|auth(?:\s|_|-)?token|client(?:\s|_|-)?secret|private(?:\s|_|-)?key|\bsecret\b|секрет/ui;
  const PAYMENT_PATTERN =
    /credit(?:\s|_|-)?card|card(?:\s|_|-)?(?:number|holder)|\bcc(?:\s|_|-)?(?:number|csc|exp)\b|\bcvv\b|\bcvc\b|\biban\b|bank(?:\s|_|-)?account|payment|номер(?:\s|_|-)?карт|банковск|плат[её]ж/ui;
  const STRICT_TEXT_PATTERN =
    /\b(?:url|uri|website|domain|hostname|host|email|e-mail|code|source|terminal|console)\b|сайт|домен|почт|адрес|код|терминал/ui;
  const DEFAULT_AUTOMATIC_EXCLUSIONS = new Set([
    "passwords",
    "apiSecrets",
    "oneTimeCodes",
    "payment",
  ]);

  function elementForNode(node) {
    return node?.nodeType === 1 ? node : node?.parentElement || null;
  }

  function composedParent(element) {
    if (element?.parentElement) {
      return element.parentElement;
    }

    const root = element?.getRootNode?.();
    return root?.host || null;
  }

  function composedAncestors(node, maximum = 8) {
    const ancestors = [];
    let element = elementForNode(node);

    while (element && ancestors.length < maximum) {
      ancestors.push(element);
      element = composedParent(element);
    }

    return ancestors;
  }

  function attribute(element, name) {
    return String(element?.getAttribute?.(name) || "").toLocaleLowerCase();
  }

  function descriptor(element) {
    const values = [
      element?.type,
      element?.name,
      element?.id,
      element?.className,
      attribute(element, "aria-label"),
      attribute(element, "aria-description"),
      attribute(element, "placeholder"),
      attribute(element, "data-testid"),
      attribute(element, "data-field-type"),
      attribute(element, "aria-labelledby"),
      attribute(element, "aria-describedby")
    ];
    const referencedIds = [
      attribute(element, "aria-labelledby"),
      attribute(element, "aria-describedby")
    ]
      .join(" ")
      .split(/\s+/u)
      .filter(Boolean);

    for (const id of referencedIds) {
      const referenced =
        element?.getRootNode?.()?.getElementById?.(id) ||
        element?.ownerDocument?.getElementById?.(id);

      if (referenced) {
        values.push(
          referenced.textContent,
          referenced.id,
          referenced.className,
          attribute(referenced, "aria-label")
        );
      }
    }

    try {
      for (const label of Array.from(element?.labels || [])) {
        values.push(
          label.textContent,
          label.id,
          label.className,
          attribute(label, "aria-label")
        );
      }
    } catch {
      // Some custom elements expose a non-iterable labels property.
    }

    const wrappingLabel = element?.closest?.("label");

    if (wrappingLabel && wrappingLabel !== element) {
      values.push(
        wrappingLabel.textContent,
        wrappingLabel.id,
        wrappingLabel.className,
        attribute(wrappingLabel, "aria-label")
      );
    }

    return values
      .filter((value) => typeof value === "string")
      .join(" ")
      .slice(0, 2048)
      .toLocaleLowerCase();
  }

  function autocompleteTokens(element) {
    return new Set(
      attribute(element, "autocomplete")
        .split(/\s+/u)
        .filter(Boolean)
    );
  }

  function hasMaskedTextStyle(element) {
    const view = element?.ownerDocument?.defaultView;

    try {
      const style = view?.getComputedStyle?.(element);
      const textSecurity =
        style?.webkitTextSecurity ||
        style?.getPropertyValue?.("-webkit-text-security");
      return Boolean(textSecurity && textSecurity !== "none");
    } catch {
      return false;
    }
  }

  function fieldCategories(node) {
    const categories = new Set();

    for (const element of composedAncestors(node)) {
      const type = String(element.type || "").toLocaleLowerCase();
      const autocomplete = autocompleteTokens(element);
      const description = descriptor(element);

      if (
        type === "password" ||
        Array.from(autocomplete).some((token) =>
          PASSWORD_AUTOCOMPLETE.has(token)
        ) ||
        PASSWORD_PATTERN.test(description) ||
        hasMaskedTextStyle(element)
      ) {
        categories.add("passwords");
      }

      if (
        Array.from(autocomplete).some((token) =>
          ONE_TIME_CODE_AUTOCOMPLETE.has(token)
        ) ||
        ONE_TIME_CODE_PATTERN.test(description)
      ) {
        categories.add("oneTimeCodes");
      }

      if (
        attribute(element, "aria-secret") === "true" ||
        attribute(element, "data-sensitive") === "true" ||
        API_SECRET_PATTERN.test(description)
      ) {
        categories.add("apiSecrets");
      }

      if (
        Array.from(autocomplete).some((token) =>
          PAYMENT_AUTOCOMPLETE.has(token)
        ) ||
        PAYMENT_PATTERN.test(description)
      ) {
        categories.add("payment");
      }

    }

    return Array.from(categories);
  }

  function isSensitiveField(node) {
    const categories = fieldCategories(node);
    return categories.some((category) =>
      ["passwords", "apiSecrets", "oneTimeCodes", "payment"].includes(
        category
      )
    );
  }

  function shouldSkipAutomaticField(node, excludedCategories) {
    const categories = fieldCategories(node);

    const exclusions = new Set(
      Array.isArray(excludedCategories)
        ? excludedCategories
        : DEFAULT_AUTOMATIC_EXCLUSIONS
    );

    return categories.some((category) => exclusions.has(category));
  }

  function isStrictTextField(node) {
    return composedAncestors(node).some((element) => {
      const type = String(element.type || "").toLocaleLowerCase();
      const inputMode = attribute(element, "inputmode");
      const autocomplete = autocompleteTokens(element);

      return (
        type === "url" ||
        type === "email" ||
        inputMode === "url" ||
        inputMode === "email" ||
        autocomplete.has("url") ||
        autocomplete.has("email") ||
        STRICT_TEXT_PATTERN.test(descriptor(element))
      );
    });
  }

  function correctionOptionsForField(options = {}, node) {
    if (!isStrictTextField(node)) {
      return options;
    }

    return {
      ...options,
      bareDomainPolicy: "strict"
    };
  }

  return {
    autocompleteTokens,
    composedAncestors,
    correctionOptionsForField,
    descriptor,
    fieldCategories,
    isSensitiveField,
    isStrictTextField,
    shouldSkipAutomaticField
  };
});
