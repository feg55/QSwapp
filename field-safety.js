(function initializeFieldSafety(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.QswappFieldSafety = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createFieldSafety() {
  "use strict";

  const CREDENTIAL_AUTOCOMPLETE = new Set([
    "current-password",
    "new-password",
    "one-time-code"
  ]);
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
  const PERSONAL_AUTOCOMPLETE = new Set([
    "name",
    "honorific-prefix",
    "given-name",
    "additional-name",
    "family-name",
    "honorific-suffix",
    "nickname",
    "email",
    "tel",
    "tel-country-code",
    "tel-national",
    "tel-area-code",
    "tel-local",
    "street-address",
    "address-line1",
    "address-line2",
    "address-line3",
    "address-level1",
    "address-level2",
    "address-level3",
    "address-level4",
    "country",
    "country-name",
    "postal-code"
  ]);
  const CREDENTIAL_PATTERN =
    /password|passcode|passwd|pwd|pin(?:\s|_|-)?code|\botp\b|one(?:\s|_|-)?time|verification(?:\s|_|-)?code|recovery(?:\s|_|-)?code|backup(?:\s|_|-)?code|secret|security(?:\s|_|-)?code|api(?:\s|_|-)?key|access(?:\s|_|-)?token|парол|пин|одноразов|код(?:\s|_|-)?(?:доступа|подтверждения|восстановления|безопасности)|резервн(?:ый|ого)?(?:\s|_|-)?код|секрет/ui;
  const PAYMENT_PATTERN =
    /credit(?:\s|_|-)?card|card(?:\s|_|-)?(?:number|holder)|\bcc(?:\s|_|-)?(?:number|csc|exp)\b|\bcvv\b|\bcvc\b|\biban\b|bank(?:\s|_|-)?account|payment|номер(?:\s|_|-)?карт|банковск|плат[её]ж/ui;
  const PERSONAL_PATTERN =
    /full(?:\s|_|-)?name|first(?:\s|_|-)?name|last(?:\s|_|-)?name|given(?:\s|_|-)?name|family(?:\s|_|-)?name|e-?mail|phone|telephone|postal|address|passport|\bssn\b|фио|имя|фамили|почт|телефон|адрес|паспорт/ui;
  const STRICT_TEXT_PATTERN =
    /\b(?:url|uri|website|domain|hostname|host|email|e-mail|code|source|terminal|console)\b|сайт|домен|почт|адрес|код|терминал/ui;
  const TECHNICAL_PATTERN =
    /\b(?:url|uri|website|domain|hostname|host|code|source|terminal|console|command|query|script)\b|сайт|домен|код|терминал|команд|скрипт/ui;
  const DEFAULT_AUTOMATIC_EXCLUSIONS = new Set([
    "payment",
    "personal",
    "technical"
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
          CREDENTIAL_AUTOCOMPLETE.has(token)
        ) ||
        attribute(element, "aria-secret") === "true" ||
        attribute(element, "data-sensitive") === "true" ||
        CREDENTIAL_PATTERN.test(description) ||
        hasMaskedTextStyle(element)
      ) {
        categories.add("credentials");
      }

      if (
        Array.from(autocomplete).some((token) =>
          PAYMENT_AUTOCOMPLETE.has(token)
        ) ||
        PAYMENT_PATTERN.test(description)
      ) {
        categories.add("payment");
      }

      if (
        ["email", "tel"].includes(type) ||
        ["email", "tel"].includes(attribute(element, "inputmode")) ||
        Array.from(autocomplete).some((token) =>
          PERSONAL_AUTOCOMPLETE.has(token)
        ) ||
        PERSONAL_PATTERN.test(description)
      ) {
        categories.add("personal");
      }

      if (
        type === "url" ||
        attribute(element, "inputmode") === "url" ||
        autocomplete.has("url") ||
        TECHNICAL_PATTERN.test(description)
      ) {
        categories.add("technical");
      }
    }

    return Array.from(categories);
  }

  function isSensitiveField(node) {
    const categories = fieldCategories(node);
    return (
      categories.includes("credentials") || categories.includes("payment")
    );
  }

  function shouldSkipAutomaticField(node, excludedCategories) {
    const categories = fieldCategories(node);

    if (categories.includes("credentials")) {
      return true;
    }

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
