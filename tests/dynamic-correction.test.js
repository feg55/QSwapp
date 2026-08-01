const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findCompletedTokenRange,
  processInputEvent,
  shouldInspectInput
} = require("../dynamic-correction");

class FakeEvent {
  constructor(type, options) {
    this.type = type;
    Object.assign(this, options);
  }
}

function createDocument() {
  class FakeInput {}
  class FakeTextarea {}

  return {
    defaultView: {
      Event: FakeEvent,
      InputEvent: FakeEvent,
      HTMLInputElement: FakeInput,
      HTMLTextAreaElement: FakeTextarea,
      getSelection() {
        return null;
      }
    }
  };
}

function createControl(value, caret, type = "text", attributes = {}) {
  const documentObject = createDocument();
  const events = [];
  const control = {
    nodeType: 1,
    tagName: "INPUT",
    type,
    name: attributes.name || "",
    id: attributes.id || "",
    className: attributes.className || "",
    value,
    selectionStart: caret,
    selectionEnd: caret,
    ownerDocument: documentObject,
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
    setRangeText(replacement, start, end) {
      const difference = replacement.length - (end - start);
      this.value = this.value.slice(0, start) + replacement + this.value.slice(end);
      this.selectionStart += difference;
      this.selectionEnd += difference;
    }
  };

  return { control, documentObject, events };
}

test("finds only the completed token before the caret", () => {
  assert.deepEqual(findCompletedTokenRange("До ghbdtn ", 10), {
    start: 3,
    end: 9,
    text: "ghbdtn"
  });
  assert.equal(
    findCompletedTokenRange(`${"q".repeat(65)} `, 66),
    null
  );
});

test("runs dynamic correction after whitespace", async () => {
  const { control, documentObject, events } = createControl(
    "До ghbdtn ",
    10
  );
  const result = await processInputEvent(
    {
      target: control,
      inputType: "insertText",
      data: " ",
      defaultPrevented: false,
      isComposing: false
    },
    {
      autocorrectTypos: true,
      convertLikelyUnknown: true,
      dynamicCorrection: true
    },
    documentObject
  );

  assert.deepEqual(result, {
    changed: true,
    originalText: "ghbdtn",
    correctedText: "привет"
  });
  assert.equal(control.value, "До привет ");
  assert.equal(control.selectionStart, 10);
  assert.deepEqual(events.map((event) => event.type), [
    "beforeinput",
    "input"
  ]);
});

test("does not inspect partial input, disabled mode or password fields", async () => {
  assert.equal(
    shouldInspectInput({
      inputType: "insertText",
      data: "n",
      defaultPrevented: false,
      isComposing: false
    }),
    false
  );

  const disabled = createControl("ghbdtn ", 7);
  assert.equal(
    (await processInputEvent(
      {
        target: disabled.control,
        inputType: "insertText",
        data: " ",
        defaultPrevented: false,
        isComposing: false
      },
      { dynamicCorrection: false },
      disabled.documentObject
    )).changed,
    false
  );

  const password = createControl("ghbdtn ", 7, "password");
  assert.deepEqual(
    await processInputEvent(
      {
        target: password.control,
        inputType: "insertText",
        data: " ",
        defaultPrevented: false,
        isComposing: false
      },
      { dynamicCorrection: true },
      password.documentObject
    ),
    { changed: false, reason: "protected-field" }
  );
  assert.equal(password.control.value, "ghbdtn ");
});

test("uses local field categories for automatic exclusions", async () => {
  const excluded = createControl("ghbdtn ", 7, "text", {
    "aria-label": "E-mail"
  });
  const allowed = createControl("ghbdtn ", 7, "text", {
    "aria-label": "E-mail"
  });
  const eventFor = (target) => ({
    target,
    inputType: "insertText",
    data: " ",
    defaultPrevented: false,
    isComposing: false
  });

  assert.deepEqual(
    await processInputEvent(
      eventFor(excluded.control),
      {
        dynamicCorrection: true,
        excludedFieldCategories: ["personal"]
      },
      excluded.documentObject
    ),
    { changed: false, reason: "protected-field" }
  );
  assert.equal(excluded.control.value, "ghbdtn ");

  assert.equal(
    (
      await processInputEvent(
        eventFor(allowed.control),
        {
          dynamicCorrection: true,
          convertLikelyUnknown: true,
          excludedFieldCategories: []
        },
        allowed.documentObject
      )
    ).changed,
    true
  );
  assert.equal(allowed.control.value, "привет ");
});

test("corrects a completed token in a simple contenteditable text node", async () => {
  const events = [];
  const host = {
    isContentEditable: true,
    ownerDocument: null,
    getAttribute() {
      return "true";
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
  const textNode = {
    nodeType: 3,
    data: "ghbdtn ",
    parentElement
  };
  const range = {
    startContainer: textNode,
    endContainer: textNode,
    startOffset: 7,
    setStart(node, offset) {
      this.startContainer = node;
      this.endContainer = node;
      this.startOffset = offset;
    },
    collapse() {}
  };
  const selection = {
    rangeCount: 1,
    isCollapsed: true,
    getRangeAt() {
      return range;
    },
    removeAllRanges() {},
    addRange() {}
  };
  const documentObject = createDocument();
  documentObject.defaultView.getSelection = () => selection;
  host.ownerDocument = documentObject;

  const result = await processInputEvent(
    {
      target: host,
      inputType: "insertText",
      data: " ",
      defaultPrevented: false,
      isComposing: false
    },
    {
      autocorrectTypos: true,
      convertLikelyUnknown: true,
      dynamicCorrection: true
    },
    documentObject
  );

  assert.equal(result.changed, true);
  assert.equal(textNode.data, "привет ");
  assert.equal(range.startOffset, 7);
  assert.deepEqual(events.map((event) => event.type), [
    "beforeinput",
    "input"
  ]);
});
