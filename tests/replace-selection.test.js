const test = require("node:test");
const assert = require("node:assert/strict");

const {
  feedbackMessage,
  replaceInTextControl,
  replaceSelectedText,
  replaceTextSegments,
  showFeedback
} = require("../replace-selection");

class FakeEvent {
  constructor(type, options) {
    this.type = type;
    Object.assign(this, options);
  }
}

function createTextControl(value, selectionStart, selectionEnd, type = "text") {
  const events = [];
  const control = {
    nodeType: 1,
    type,
    value,
    selectionStart,
    selectionEnd,
    ownerDocument: {
      defaultView: {
        Event: FakeEvent,
        InputEvent: FakeEvent
      }
    },
    getAttribute() {
      return null;
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
    setRangeText(replacement, start, end) {
      this.value = this.value.slice(0, start) + replacement + this.value.slice(end);
      this.selectionStart = start;
      this.selectionEnd = start + replacement.length;
    }
  };

  return { control, events };
}

test("replaces only the selected part of an input and emits input", async () => {
  const { control, events } = createTextControl(
    "До ghbdtn после",
    3,
    9
  );
  const result = await replaceInTextControl(control);

  assert.deepEqual(result, {
    ok: true,
    changed: true,
    correctedText: "привет"
  });
  assert.equal(control.value, "До привет после");
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "beforeinput");
  assert.equal(events[0].cancelable, true);
  assert.equal(events[1].type, "input");
  assert.equal(events[1].inputType, "insertText");
  assert.equal(events[1].data, "привет");
  assert.equal(events[0].bubbles, true);
  assert.equal(events[0].composed, true);
});

test("does not emit input when the selected source word is already valid", async () => {
  const { control, events } = createTextControl("business", 0, 8);
  const result = await replaceInTextControl(control);

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(control.value, "business");
  assert.equal(events.length, 0);
});

test("reports an empty selection without changing the control", async () => {
  const { control, events } = createTextControl("ghbdtn", 2, 2);

  assert.deepEqual(await replaceInTextControl(control), {
    ok: false,
    reason: "no-selection"
  });
  assert.equal(control.value, "ghbdtn");
  assert.equal(events.length, 0);
});

test("does not change a password field", async () => {
  const { control, events } = createTextControl("ghbdtn", 0, 6, "password");

  assert.deepEqual(await replaceInTextControl(control), {
    ok: false,
    reason: "protected-field"
  });
  assert.equal(control.value, "ghbdtn");
  assert.equal(events.length, 0);
});

test("does not change a custom field marked as a current password", async () => {
  const { control, events } = createTextControl("ghbdtn", 0, 6);
  control.getAttribute = (name) =>
    name === "autocomplete" ? "current-password" : null;

  assert.deepEqual(await replaceInTextControl(control), {
    ok: false,
    reason: "protected-field"
  });
  assert.equal(control.value, "ghbdtn");
  assert.equal(events.length, 0);
});

test("honors a cancelled beforeinput event", async () => {
  const { control, events } = createTextControl("ghbdtn", 0, 6);
  control.dispatchEvent = (event) => {
    events.push(event);
    return event.type !== "beforeinput";
  };

  assert.deepEqual(await replaceInTextControl(control), {
    ok: false,
    reason: "beforeinput-cancelled"
  });
  assert.equal(control.value, "ghbdtn");
  assert.deepEqual(events.map((event) => event.type), ["beforeinput"]);
});

test("replaces text segments without merging their formatting nodes", () => {
  const boldText = { data: "ghb" };
  const linkedText = { data: "dtn" };
  const replacements = replaceTextSegments(
    [
      { node: boldText, start: 0, end: 3 },
      { node: linkedText, start: 0, end: 3 }
    ],
    "привет"
  );

  assert.deepEqual(replacements, ["при", "вет"]);
  assert.equal(boldText.data, "при");
  assert.equal(linkedText.data, "вет");
});

test("replaces a contenteditable selection while preserving its text nodes", async () => {
  const events = [];
  const calls = [];
  const host = {
    isContentEditable: true,
    getAttribute(name) {
      return name === "contenteditable" ? "true" : null;
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    }
  };
  const parentElement = {
    closest() {
      return host;
    }
  };
  const firstTextNode = { nodeType: 3, parentElement, data: "ghb" };
  const secondTextNode = { nodeType: 3, parentElement, data: "dtn" };
  const range = {
    startContainer: firstTextNode,
    startOffset: 0,
    endContainer: secondTextNode,
    endOffset: 3,
    intersectsNode(node) {
      return node === firstTextNode || node === secondTextNode;
    }
  };
  const selection = {
    anchorNode: firstTextNode,
    focusNode: secondTextNode,
    rangeCount: 1,
    isCollapsed: false,
    toString() {
      return "ghbdtn";
    },
    getRangeAt() {
      return range;
    },
    removeAllRanges() {
      calls.push("remove-ranges");
    },
    addRange() {
      calls.push("add-range");
    }
  };
  class FakeInput {}
  class FakeTextarea {}
  const view = {
    Event: FakeEvent,
    InputEvent: FakeEvent,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextarea,
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4 },
    getSelection() {
      return selection;
    }
  };
  const documentObject = {
    activeElement: host,
    defaultView: view,
    createTreeWalker() {
      const nodes = [firstTextNode, secondTextNode];
      let index = 0;

      return {
        nextNode() {
          return nodes[index++] || null;
        }
      };
    },
    createRange() {
      return {
        setStart(node, offset) {
          calls.push(["start", node, offset]);
        },
        setEnd(node, offset) {
          calls.push(["end", node, offset]);
        }
      };
    }
  };
  host.ownerDocument = documentObject;

  assert.deepEqual(await replaceSelectedText(documentObject), {
    ok: true,
    changed: true,
    correctedText: "привет"
  });
  assert.equal(firstTextNode.data, "при");
  assert.equal(secondTextNode.data, "вет");
  assert.deepEqual(calls, [
    ["start", firstTextNode, 0],
    ["end", secondTextNode, 3],
    "remove-ranges",
    "add-range"
  ]);
  assert.deepEqual(events.map((event) => event.type), [
    "beforeinput",
    "input"
  ]);
  assert.equal(events[1].data, "привет");
});

test("provides clear feedback messages for the result", () => {
  assert.equal(
    feedbackMessage({ ok: true, changed: true }),
    "Keyboard layout fixed"
  );
  assert.equal(
    feedbackMessage({ ok: true, changed: false }),
    "No changes found"
  );
  assert.equal(
    feedbackMessage({ ok: false, reason: "protected-field" }),
    "Password fields are never changed"
  );
});

test("shows feedback without deleting a page element with a matching id", () => {
  let existingElementRemoved = false;
  let idLookupCount = 0;
  let timeoutCallback;
  const appended = [];
  const existingElement = {
    remove() {
      existingElementRemoved = true;
    }
  };
  const documentObject = {
    body: {
      appendChild(element) {
        appended.push(element);
      }
    },
    defaultView: {
      setTimeout(callback) {
        timeoutCallback = callback;
      }
    },
    getElementById() {
      idLookupCount += 1;
      return existingElement;
    },
    createElement() {
      return {
        style: {},
        attributes: {},
        removed: false,
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        remove() {
          this.removed = true;
        }
      };
    }
  };

  const notice = showFeedback(
    { ok: true, changed: true },
    documentObject
  );

  assert.equal(appended.length, 1);
  assert.equal(appended[0], notice);
  assert.equal(notice.id, undefined);
  assert.equal(notice.textContent, "Keyboard layout fixed");
  assert.equal(idLookupCount, 0);
  assert.equal(existingElementRemoved, false);

  timeoutCallback();
  assert.equal(notice.removed, true);
});
