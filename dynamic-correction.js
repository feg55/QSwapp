(function initializeDynamicCorrectionModule(root, factory) {
  const analyzer =
    typeof module === "object" && module.exports
      ? require("./word-analyzer")
      : root.QswappAnalysisClient;
  const settingsApi =
    typeof module === "object" && module.exports
      ? require("./settings")
      : root.QswappSettings;
  const fieldSafety =
    typeof module === "object" && module.exports
      ? require("./field-safety")
      : root.QswappFieldSafety;
  const api = factory(analyzer, settingsApi, fieldSafety);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.QswappDynamic?.disposeDynamicCorrection?.();
    root.QswappDynamic = api;
    root.QswappDynamic.ready = api.initializeDynamicCorrection();
    root.QswappDynamic.ready.catch((error) => {
      console.warn("Could not start automatic correction:", error);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDynamicCorrection(
  analyzer,
  settingsApi,
  fieldSafety
) {
  "use strict";

  const MAX_DYNAMIC_TOKEN_LENGTH = 64;
  const ALLOWED_INPUT_TYPES = new Set(["", "text", "search"]);
  let activeCleanup = null;

  function shouldSkipField(node, options = {}) {
    if (fieldSafety?.shouldSkipAutomaticField) {
      return fieldSafety.shouldSkipAutomaticField(
        node,
        options.excludedFieldCategories
      );
    }

    return Boolean(fieldSafety?.isSensitiveField?.(node));
  }

  function shouldInspectInput(event) {
    if (
      !event ||
      event.defaultPrevented ||
      event.isComposing ||
      !String(event.inputType || "").startsWith("insert")
    ) {
      return false;
    }

    if (event.inputType === "insertLineBreak") {
      return true;
    }

    return typeof event.data === "string" && /\s/u.test(event.data);
  }

  function findCompletedTokenRange(text, caret) {
    const value = String(text);
    let end = Math.max(0, Math.min(Number(caret) || 0, value.length));

    while (end > 0 && /\s/u.test(value[end - 1])) {
      end -= 1;
    }

    let start = end;

    while (start > 0 && !/\s/u.test(value[start - 1])) {
      start -= 1;
    }

    if (end === start || end - start > MAX_DYNAMIC_TOKEN_LENGTH) {
      return null;
    }

    return {
      start,
      end,
      text: value.slice(start, end)
    };
  }

  function dispatchReplacementEvent(
    element,
    type,
    replacement,
    cancelable
  ) {
    const view = element.ownerDocument?.defaultView ?? globalThis;

    try {
      return element.dispatchEvent(
        new view.InputEvent(type, {
          bubbles: true,
          composed: true,
          cancelable,
          inputType: "insertReplacementText",
          data: replacement
        })
      );
    } catch {
      return element.dispatchEvent(
        new view.Event(type, {
          bubbles: true,
          composed: true,
          cancelable
        })
      );
    }
  }

  function isSupportedTextControl(element, view, options = {}) {
    const isTextarea =
      (view.HTMLTextAreaElement && element instanceof view.HTMLTextAreaElement) ||
      String(element?.tagName || "").toLowerCase() === "textarea";
    const isInput =
      (view.HTMLInputElement && element instanceof view.HTMLInputElement) ||
      String(element?.tagName || "").toLowerCase() === "input";

    if (isTextarea) {
      return true;
    }

    if (!isInput) {
      return false;
    }

    const type = String(element.type || "").toLowerCase();

    return (
      ALLOWED_INPUT_TYPES.has(type) ||
      (type === "password" && !shouldSkipField(element, options))
    );
  }

  function isAnyTextControl(element, view) {
    return Boolean(
      (view.HTMLTextAreaElement &&
        element instanceof view.HTMLTextAreaElement) ||
        (view.HTMLInputElement && element instanceof view.HTMLInputElement) ||
        ["textarea", "input"].includes(
          String(element?.tagName || "").toLowerCase()
        )
    );
  }

  async function correctTextControl(element, options) {
    const start = element.selectionStart;
    const end = element.selectionEnd;

    if (
      typeof start !== "number" ||
      start !== end ||
      shouldSkipField(element, options)
    ) {
      return { changed: false, reason: "unsupported-control" };
    }

    const token = findCompletedTokenRange(element.value, start);

    if (!token) {
      return { changed: false, reason: "no-completed-token" };
    }

    const originalValue = element.value;
    const effectiveOptions =
      fieldSafety?.correctionOptionsForField?.(options, element) ?? options;
    const correctedText = await analyzer.correctText(
      token.text,
      effectiveOptions
    );

    if (
      element.value !== originalValue ||
      element.selectionStart !== start ||
      element.selectionEnd !== end
    ) {
      return { changed: false, reason: "selection-changed" };
    }

    if (correctedText === token.text) {
      return { changed: false, reason: "unchanged" };
    }

    if (
      !dispatchReplacementEvent(
        element,
        "beforeinput",
        correctedText,
        true
      )
    ) {
      return { changed: false, reason: "beforeinput-cancelled" };
    }

    element.setRangeText(
      correctedText,
      token.start,
      token.end,
      "preserve"
    );
    dispatchReplacementEvent(element, "input", correctedText, false);

    return {
      changed: true,
      originalText: token.text,
      correctedText
    };
  }

  function contentEditableHost(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    const host = element?.closest?.("[contenteditable]");

    if (
      !host ||
      host.getAttribute?.("contenteditable")?.toLowerCase() === "false" ||
      !host.isContentEditable
    ) {
      return null;
    }

    return host;
  }

  async function correctContentEditable(documentObject, eventTarget, options) {
    const selectionRoot = eventTarget?.getRootNode?.();
    const selection =
      selectionRoot?.getSelection?.() ||
      documentObject.defaultView.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed
    ) {
      return { changed: false, reason: "unsupported-selection" };
    }

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode?.nodeType !== 3 || range.startContainer !== range.endContainer) {
      return { changed: false, reason: "unsupported-selection" };
    }

    const host = contentEditableHost(textNode);

    if (
      !host ||
      shouldSkipField(host, options) ||
      (eventTarget !== host && !host.contains?.(eventTarget))
    ) {
      return { changed: false, reason: "unsupported-control" };
    }

    const token = findCompletedTokenRange(textNode.data, range.startOffset);

    if (!token) {
      return { changed: false, reason: "no-completed-token" };
    }

    const originalData = textNode.data;
    const originalOffset = range.startOffset;
    const effectiveOptions =
      fieldSafety?.correctionOptionsForField?.(options, host) ?? options;
    const correctedText = await analyzer.correctText(
      token.text,
      effectiveOptions
    );

    if (
      textNode.data !== originalData ||
      selection.rangeCount === 0 ||
      selection.getRangeAt(0).startContainer !== textNode ||
      selection.getRangeAt(0).startOffset !== originalOffset
    ) {
      return { changed: false, reason: "selection-changed" };
    }

    if (correctedText === token.text) {
      return { changed: false, reason: "unchanged" };
    }

    if (
      !dispatchReplacementEvent(host, "beforeinput", correctedText, true)
    ) {
      return { changed: false, reason: "beforeinput-cancelled" };
    }

    const previousLength = token.end - token.start;
    textNode.data =
      textNode.data.slice(0, token.start) +
      correctedText +
      textNode.data.slice(token.end);

    const caret =
      range.startOffset + correctedText.length - previousLength;
    range.setStart(textNode, caret);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    dispatchReplacementEvent(host, "input", correctedText, false);

    return {
      changed: true,
      originalText: token.text,
      correctedText
    };
  }

  async function processInputEvent(
    event,
    options,
    documentObject = globalThis.document
  ) {
    if (!options?.dynamicCorrection || !shouldInspectInput(event)) {
      return { changed: false, reason: "disabled-or-incomplete" };
    }

    const view = documentObject.defaultView;
    const target = event.composedPath?.()[0] || event.target;

    if (shouldSkipField(target, options)) {
      return { changed: false, reason: "protected-field" };
    }

    if (isSupportedTextControl(target, view, options)) {
      return correctTextControl(target, options);
    }

    if (isAnyTextControl(target, view)) {
      return { changed: false, reason: "unsupported-control" };
    }

    return correctContentEditable(documentObject, target, options);
  }

  async function initializeDynamicCorrection(
    documentObject = globalThis.document,
    chromeObject = globalThis.chrome
  ) {
    if (!documentObject?.addEventListener) {
      return false;
    }

    activeCleanup?.();

    const [loadedSettings, loadedLocalSettings] = await Promise.all([
      settingsApi.loadSettings(chromeObject?.storage?.sync),
      settingsApi.loadLocalSettings?.(chromeObject?.storage?.local) ??
        Promise.resolve({})
    ]);
    let settings = loadedSettings;
    let localSettings = loadedLocalSettings;
    const currentLocation =
      documentObject.location || documentObject.defaultView?.location;
    const createOptions = () => ({
      ...settingsApi.dynamicCorrectionOptions(settings, localSettings),
      dynamicCorrection:
        settings.dynamic.enabled &&
        (settingsApi.isSiteAllowed?.(currentLocation, localSettings) ??
          true)
    });
    let options = createOptions();
    let applyingCorrection = false;

    const handleInput = async (event) => {
      if (applyingCorrection) {
        return;
      }

      applyingCorrection = true;

      try {
        await processInputEvent(event, options, documentObject);
      } catch (error) {
        console.warn("Could not check the completed word:", error);
      } finally {
        applyingCorrection = false;
      }
    };
    const handleStorageChange = (changes, areaName) => {
      if (areaName === "sync") {
        settings = settingsApi.normalizeSettings({
          ...settings,
          ...Object.fromEntries(
            Object.entries(changes).map(([key, change]) => [
              key,
              change.newValue
            ])
          )
        });
      } else if (areaName === "local") {
        localSettings = settingsApi.normalizeLocalSettings({
          ...localSettings,
          ...Object.fromEntries(
            Object.entries(changes).map(([key, change]) => [
              key,
              change.newValue
            ])
          )
        });
      } else {
        return;
      }

      options = createOptions();
    };

    documentObject.addEventListener("input", handleInput, true);
    chromeObject?.storage?.onChanged?.addListener(handleStorageChange);
    activeCleanup = () => {
      documentObject.removeEventListener?.("input", handleInput, true);
      chromeObject?.storage?.onChanged?.removeListener?.(
        handleStorageChange
      );
      activeCleanup = null;
    };

    return true;
  }

  function disposeDynamicCorrection() {
    if (!activeCleanup) {
      return false;
    }

    activeCleanup();
    return true;
  }

  return {
    MAX_DYNAMIC_TOKEN_LENGTH,
    correctContentEditable,
    correctTextControl,
    disposeDynamicCorrection,
    findCompletedTokenRange,
    initializeDynamicCorrection,
    isAnyTextControl,
    isSupportedTextControl,
    processInputEvent,
    shouldInspectInput
  };
});
