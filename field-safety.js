(function initializeFieldSafety(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.QswappFieldSafety = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createFieldSafety() {
  "use strict";

  const SENSITIVE_AUTOCOMPLETE = new Set([
    "current-password",
    "new-password",
    "one-time-code",
    "cc-number",
    "cc-csc"
  ]);
  const SENSITIVE_PATTERN =
    /password|passcode|passwd|pwd|pin(?:\s|_|-)?code|secret|security(?:\s|_|-)?code|api(?:\s|_|-)?key|access(?:\s|_|-)?token|парол|пин|код(?:\s|_|-)?доступа|секрет/ui;
  const STRICT_TEXT_PATTERN =
    /\b(?:url|uri|website|domain|hostname|host|email|e-mail|code|source|terminal|console)\b|сайт|домен|почт|адрес|код|терминал/ui;

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
    return [
      element?.type,
      element?.name,
      element?.id,
      element?.className,
      attribute(element, "aria-label"),
      attribute(element, "aria-description"),
      attribute(element, "placeholder"),
      attribute(element, "data-testid"),
      attribute(element, "data-field-type")
    ]
      .filter((value) => typeof value === "string")
      .join(" ")
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

  function isSensitiveField(node) {
    return composedAncestors(node).some((element) => {
      const type = String(element.type || "").toLocaleLowerCase();
      const autocomplete = autocompleteTokens(element);

      return (
        type === "password" ||
        Array.from(autocomplete).some((token) =>
          SENSITIVE_AUTOCOMPLETE.has(token)
        ) ||
        attribute(element, "aria-secret") === "true" ||
        attribute(element, "data-sensitive") === "true" ||
        SENSITIVE_PATTERN.test(descriptor(element)) ||
        hasMaskedTextStyle(element)
      );
    });
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
    isSensitiveField,
    isStrictTextField
  };
});
