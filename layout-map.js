(function initializeLayoutMap(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.Qswapp = Object.assign(root.Qswapp || {}, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createLayoutMap() {
  "use strict";

  const ENGLISH_LOWER = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./\\";
  const RUSSIAN_LOWER = "ёйцукенгшщзхъфывапролджэячсмитьбю.\\";
  const ENGLISH_UPPER = '~QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?|';
  const RUSSIAN_UPPER = 'ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,/';

  function createCharacterMap(from, to) {
    const source = Array.from(from);
    const target = Array.from(to);

    if (source.length !== target.length) {
      throw new Error("Keyboard layout tables have different lengths");
    }

    return new Map(source.map((character, index) => [character, target[index]]));
  }

  const enToRuMap = createCharacterMap(
    ENGLISH_LOWER + ENGLISH_UPPER,
    RUSSIAN_LOWER + RUSSIAN_UPPER
  );
  const ruToEnMap = createCharacterMap(
    RUSSIAN_LOWER + RUSSIAN_UPPER,
    ENGLISH_LOWER + ENGLISH_UPPER
  );

  function convertKeyboardLayout(text, direction) {
    const map = direction === "en-to-ru" ? enToRuMap : ruToEnMap;
    return Array.from(String(text), (character) => map.get(character) ?? character).join("");
  }

  function detectAlphabet(value) {
    const letters = String(value).replace(/['’]/g, "");

    if (letters && /^[a-z]+$/i.test(letters)) {
      return "en";
    }

    if (letters && /^[а-яё]+$/i.test(letters)) {
      return "ru";
    }

    if (/[a-z]/i.test(letters) && /[а-яё]/i.test(letters)) {
      return "mixed";
    }

    return "unknown";
  }

  return {
    convertKeyboardLayout,
    detectAlphabet
  };
});
