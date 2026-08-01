(function initializeSelectionReplacement(root, factory) {
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
    root.Qswapp = Object.assign(root.Qswapp || {}, api);
    api.runManualCorrection().then((result) => {
      root.Qswapp.lastResult = result;
    }).catch((error) => {
      const result = { ok: false, reason: "unexpected-error" };
      root.Qswapp.lastResult = result;
      api.showFeedback(result);
      console.warn("Could not correct the selection:", error);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createSelectionReplacement(
  analyzer,
  settingsApi,
  fieldSafety
) {
  "use strict";

  function getDeepActiveElement(documentObject) {
    let element = documentObject.activeElement;

    while (element?.shadowRoot?.activeElement) {
      element = element.shadowRoot.activeElement;
    }

    return element;
  }

  function getSelectionForDocument(documentObject) {
    const activeElement = getDeepActiveElement(documentObject);
    const activeRoot = activeElement?.getRootNode?.();

    return (
      activeRoot?.getSelection?.() ||
      documentObject.defaultView.getSelection()
    );
  }

  function dispatchInputEvent(element, insertedText) {
    const view = element.ownerDocument?.defaultView ?? globalThis;

    try {
      element.dispatchEvent(
        new view.InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: insertedText
        })
      );
    } catch {
      element.dispatchEvent(
        new view.Event("input", { bubbles: true, composed: true })
      );
    }
  }

  function dispatchBeforeInputEvent(element, insertedText) {
    const view = element.ownerDocument?.defaultView ?? globalThis;

    try {
      return element.dispatchEvent(
        new view.InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true,
          inputType: "insertText",
          data: insertedText
        })
      );
    } catch {
      return element.dispatchEvent(
        new view.Event("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true
        })
      );
    }
  }

  async function replaceInTextControl(element, options = {}) {
    if (
      String(element.type || "").toLowerCase() === "password" ||
      fieldSafety?.isSensitiveField?.(element)
    ) {
      return { ok: false, reason: "protected-field" };
    }

    const start = element.selectionStart;
    const end = element.selectionEnd;

    if (typeof start !== "number" || typeof end !== "number" || start === end) {
      return { ok: false, reason: "no-selection" };
    }

    const originalValue = element.value;
    const selectedText = element.value.slice(start, end);
    const effectiveOptions =
      fieldSafety?.correctionOptionsForField?.(options, element) ?? options;
    const correctedText = await analyzer.correctText(
      selectedText,
      effectiveOptions
    );

    if (
      element.value !== originalValue ||
      element.selectionStart !== start ||
      element.selectionEnd !== end
    ) {
      return { ok: false, reason: "selection-changed" };
    }

    if (correctedText !== selectedText) {
      if (!dispatchBeforeInputEvent(element, correctedText)) {
        return { ok: false, reason: "beforeinput-cancelled" };
      }

      element.setRangeText(correctedText, start, end, "select");
      dispatchInputEvent(element, correctedText);
    }

    return {
      ok: true,
      changed: correctedText !== selectedText,
      correctedText
    };
  }

  function nearestEditableHost(node, documentObject) {
    const element =
      node?.nodeType === documentObject.defaultView.Node.ELEMENT_NODE
        ? node
        : node?.parentElement;
    const boundary = element?.closest?.("[contenteditable]");

    if (
      !boundary ||
      boundary.getAttribute?.("contenteditable")?.toLowerCase() === "false" ||
      !boundary.isContentEditable
    ) {
      return null;
    }

    return boundary;
  }

  function editableHostForSelection(selection, documentObject) {
    const anchorHost = nearestEditableHost(
      selection.anchorNode,
      documentObject
    );
    const focusHost = nearestEditableHost(selection.focusNode, documentObject);

    if (!anchorHost || anchorHost !== focusHost) {
      return null;
    }

    return anchorHost;
  }

  function textNodeData(node) {
    return typeof node.data === "string" ? node.data : node.nodeValue || "";
  }

  function setTextNodeData(node, value) {
    if (typeof node.data === "string") {
      node.data = value;
    } else {
      node.nodeValue = value;
    }
  }

  function collectSelectedTextSegments(
    documentObject,
    editableHost,
    range
  ) {
    const view = documentObject.defaultView;
    const showText = view.NodeFilter?.SHOW_TEXT ?? 4;
    const walker = documentObject.createTreeWalker(editableHost, showText);
    const segments = [];
    let node = walker.nextNode();

    while (node) {
      let intersects = false;

      try {
        intersects = range.intersectsNode(node);
      } catch {
        intersects = false;
      }

      if (intersects) {
        const nearestBoundary = node.parentElement?.closest?.("[contenteditable]");

        if (nearestBoundary && nearestBoundary !== editableHost) {
          return { ok: false, reason: "protected-editable-region" };
        }

        const data = textNodeData(node);
        const start =
          node === range.startContainer
            ? Math.max(0, Math.min(range.startOffset, data.length))
            : 0;
        const end =
          node === range.endContainer
            ? Math.max(start, Math.min(range.endOffset, data.length))
            : data.length;

        if (end > start) {
          segments.push({
            node,
            start,
            end,
            text: data.slice(start, end)
          });
        }
      }

      node = walker.nextNode();
    }

    return segments.length
      ? { ok: true, segments }
      : { ok: false, reason: "unsupported-selection" };
  }

  function distributeReplacement(segments, replacementText) {
    let offset = 0;

    return segments.map((segment, index) => {
      if (index === segments.length - 1) {
        return replacementText.slice(offset);
      }

      const originalLength = segment.end - segment.start;
      const replacement = replacementText.slice(
        offset,
        offset + originalLength
      );
      offset += replacement.length;
      return replacement;
    });
  }

  function replaceTextSegments(segments, replacementText) {
    const replacements = distributeReplacement(segments, replacementText);

    segments.forEach((segment, index) => {
      const data = textNodeData(segment.node);
      setTextNodeData(
        segment.node,
        data.slice(0, segment.start) +
          replacements[index] +
          data.slice(segment.end)
      );
    });

    return replacements;
  }

  async function replaceTextSegmentsIndividually(segments, options = {}) {
    const replacements = await Promise.all(
      segments.map((segment) =>
        analyzer.correctText(segment.text, options)
      )
    );

    segments.forEach((segment, index) => {
      const data = textNodeData(segment.node);
      setTextNodeData(
        segment.node,
        data.slice(0, segment.start) +
          replacements[index] +
          data.slice(segment.end)
      );
    });

    return replacements;
  }

  async function replaceInContentEditable(documentObject, options = {}) {
    const selection = getSelectionForDocument(documentObject);

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { ok: false, reason: "no-selection" };
    }

    const selectedText = selection.toString();
    const initialRange = selection.getRangeAt(0);
    const initialBoundary = {
      startContainer: initialRange.startContainer,
      startOffset: initialRange.startOffset,
      endContainer: initialRange.endContainer,
      endOffset: initialRange.endOffset
    };
    const editableHost = editableHostForSelection(selection, documentObject);

    if (!selectedText || !editableHost) {
      return {
        ok: false,
        reason: selectedText ? "cross-editable-selection" : "no-selection"
      };
    }

    if (fieldSafety?.isSensitiveField?.(editableHost)) {
      return { ok: false, reason: "protected-field" };
    }

    const effectiveOptions =
      fieldSafety?.correctionOptionsForField?.(options, editableHost) ??
      options;
    const correctedText = await analyzer.correctText(
      selectedText,
      effectiveOptions
    );

    if (
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      selection.toString() !== selectedText
    ) {
      return { ok: false, reason: "selection-changed" };
    }

    const range = selection.getRangeAt(0);

    if (
      range.startContainer !== initialBoundary.startContainer ||
      range.startOffset !== initialBoundary.startOffset ||
      range.endContainer !== initialBoundary.endContainer ||
      range.endOffset !== initialBoundary.endOffset
    ) {
      return { ok: false, reason: "selection-changed" };
    }

    if (correctedText === selectedText) {
      return { ok: true, changed: false, correctedText };
    }

    const collected = collectSelectedTextSegments(
      documentObject,
      editableHost,
      range
    );

    if (!collected.ok) {
      return collected;
    }

    if (!dispatchBeforeInputEvent(editableHost, correctedText)) {
      return { ok: false, reason: "beforeinput-cancelled" };
    }

    const segments = collected.segments;
    const selectedNodeText = segments.map((segment) => segment.text).join("");
    const replacements =
      selectedNodeText === selectedText
        ? replaceTextSegments(segments, correctedText)
        : await replaceTextSegmentsIndividually(segments, effectiveOptions);
    const selectionRange = documentObject.createRange();
    const first = segments[0];
    const last = segments[segments.length - 1];

    selectionRange.setStart(first.node, first.start);
    selectionRange.setEnd(
      last.node,
      last.start + replacements[replacements.length - 1].length
    );
    selection.removeAllRanges();
    selection.addRange(selectionRange);
    dispatchInputEvent(editableHost, correctedText);

    return { ok: true, changed: true, correctedText };
  }

  async function replaceSelectedText(
    documentObject = globalThis.document,
    options = {}
  ) {
    if (!documentObject?.defaultView) {
      return { ok: false, reason: "no-document" };
    }

    const view = documentObject.defaultView;
    const activeElement = getDeepActiveElement(documentObject);

    if (
      activeElement instanceof view.HTMLInputElement ||
      activeElement instanceof view.HTMLTextAreaElement
    ) {
      return replaceInTextControl(activeElement, options);
    }

    return replaceInContentEditable(documentObject, options);
  }

  function feedbackMessage(result) {
    if (result?.ok && result.changed) {
      return "Keyboard layout fixed";
    }

    if (result?.ok) {
      return "No changes found";
    }

    const messages = {
      "beforeinput-cancelled": "The editor cancelled the replacement",
      "cross-editable-selection": "Select text within a single field",
      "no-selection": "Select some text first",
      "protected-editable-region": "The protected editor region was not changed",
      "protected-field": "Password fields are never changed",
      "selection-changed": "The selection changed while it was being checked",
      "unsupported-selection": "This selection cannot be replaced safely"
    };

    return messages[result?.reason] || "Could not correct the selection";
  }

  function showFeedback(result, documentObject = globalThis.document) {
    if (!documentObject?.body?.appendChild || !documentObject.createElement) {
      return false;
    }

    const notice = documentObject.createElement("div");
    notice.textContent = feedbackMessage(result);
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    Object.assign(notice.style, {
      position: "fixed",
      zIndex: "2147483647",
      right: "18px",
      bottom: "18px",
      maxWidth: "320px",
      padding: "10px 14px",
      borderRadius: "8px",
      background: result?.ok ? "#17202a" : "#7b241c",
      color: "#fff",
      boxShadow: "0 4px 18px rgba(0, 0, 0, 0.28)",
      font: "13px/1.4 system-ui, sans-serif",
      pointerEvents: "none"
    });
    documentObject.body.appendChild(notice);

    const view = documentObject.defaultView ?? globalThis;
    view.setTimeout?.(() => notice.remove(), 1800);
    return notice;
  }

  async function runManualCorrection(
    documentObject = globalThis.document,
    chromeObject = globalThis.chrome
  ) {
    let options = {};

    try {
      if (settingsApi?.loadSettings) {
        const [settings, localSettings] = await Promise.all([
          settingsApi.loadSettings(chromeObject?.storage?.sync),
          settingsApi.loadLocalSettings?.(chromeObject?.storage?.local) ??
            Promise.resolve({})
        ]);
        options = settingsApi.manualCorrectionOptions(
          settings,
          localSettings
        );
      }
    } catch {
      options = {};
    }

    const result = await replaceSelectedText(documentObject, options);
    showFeedback(result, documentObject);
    return result;
  }

  return {
    collectSelectedTextSegments,
    dispatchBeforeInputEvent,
    dispatchInputEvent,
    editableHostForSelection,
    feedbackMessage,
    getSelectionForDocument,
    replaceInContentEditable,
    replaceInTextControl,
    replaceSelectedText,
    replaceTextSegments,
    replaceTextSegmentsIndividually,
    runManualCorrection,
    showFeedback
  };
});
