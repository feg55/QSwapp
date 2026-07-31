(function initializeWordAnalyzer(root, factory) {
  const layoutMap =
    typeof module === "object" && module.exports
      ? require("./layout-map")
      : root.Qswapp;
  const dictionaries =
    typeof module === "object" && module.exports
      ? require("./dictionaries")
      : root.QswappDictionaries;
  const api = factory(layoutMap, dictionaries);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.Qswapp = Object.assign(root.Qswapp || {}, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createWordAnalyzer(
  layoutMap,
  dictionaries
) {
  "use strict";

  if (!layoutMap || !dictionaries) {
    throw new Error("The analyzer loaded without a keyboard map or dictionaries");
  }

  const TOKEN_PATTERN =
    /[A-Za-z`~\[\]{};:'",.<>]+|[А-Яа-яЁё]+/g;
  const ENGLISH_LAYOUT_TOKEN_PATTERN =
    /^[A-Za-z`~\[\]{};:'",.<>]+$/;
  const ALPHABETS = {
    en: Array.from("abcdefghijklmnopqrstuvwxyz'"),
    ru: Array.from("абвгдеёжзийклмнопрстуфхцчшщъыьэюя")
  };
  const VOWELS = {
    en: new Set(Array.from("aeiouy")),
    ru: new Set(Array.from("аеёиоуыэюя"))
  };
  const COMMON_BIGRAMS = {
    en: new Set(
      (
        "th he in er an re on at en nd ti es or te of ed is it al ar st to nt " +
        "ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce li ch ll be " +
        "ma si om ur sh el lo bu us ss la di fo ho pe ec pr no ct wi tr ly wh " +
        "et ut ge ee so un ca wa ai pa ie po we ei"
      ).split(" ")
    ),
    ru: new Set(
      (
        "ст но то на ен ов ни ра во ко ро по ос пр го ал ли ре от та ор ка те " +
        "ет ит ар ан ти ер ес ва ил не да ме ви ол ог ле ел де ый ий ая ое ие " +
        "ых ой ьн ск ла ьс пе тр че ри ве ив ет ми ир ру уд ну из за ты бы вы " +
        "до со об мо же чи ши ющ ят ль ек кс са нд др"
      ).split(" ")
    )
  };
  const PROTECTED_TECHNICAL_TERMS = new Set(
    (
      "npm api url uri css html sql jwt tls ssl ui ux id js ts jsx tsx http " +
      "https json xml yaml cli sdk cpu gpu ram ssh git dns tcp udp ip cd ci " +
      "os db dev prod qa gh zsh"
    ).split(" ")
  );
  const KEYBOARD_ROWS = {
    en: ["qwertyuiop", "asdfghjkl;'", "zxcvbnm,."],
    ru: ["йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"]
  };
  const SHORT_SOURCE_OVERRIDE_RATIO = 40;
  const MAX_AUTOCORRECT_LENGTH = 64;
  const COMPETING_OPERATION_FREQUENCY_RATIO = 40;
  const MIN_DOTTED_LAYOUT_WORD_FREQUENCY = 100;

  function normalizeCorrectionOptions(options = {}) {
    const minimumLength = Number.parseInt(options.minimumLength, 10);
    const protectedTerms = Array.isArray(options.protectedTerms)
      ? Array.from(
          new Set(
            options.protectedTerms
              .map((term) => String(term).trim().toLocaleLowerCase())
              .filter(Boolean)
          )
        )
      : [];

    return {
      autocorrectTypos: options.autocorrectTypos !== false,
      convertLikelyUnknown: options.convertLikelyUnknown !== false,
      minimumLength: Number.isFinite(minimumLength)
        ? Math.max(1, Math.min(12, minimumLength))
        : 1,
      aggressiveness: ["safe", "balanced", "aggressive"].includes(
        options.aggressiveness
      )
        ? options.aggressiveness
        : "balanced",
      bareDomainPolicy:
        options.bareDomainPolicy === "strict" ? "strict" : "balanced",
      protectedTerms
    };
  }

  function normalizeWord(word) {
    return String(word).toLocaleLowerCase().replace(/’/g, "'");
  }

  function dictionaryFor(language) {
    return language === "en" ? dictionaries.english : dictionaries.russian;
  }

  function detectTokenLanguage(value) {
    const detected = layoutMap.detectAlphabet(value);

    if (detected !== "unknown") {
      return detected;
    }

    if (
      /[a-z]/i.test(value) &&
      !/[а-яё]/i.test(value) &&
      ENGLISH_LAYOUT_TOKEN_PATTERN.test(value)
    ) {
      return "en";
    }

    return "unknown";
  }

  function frequencyStrength(frequency, maximum) {
    if (!frequency || !maximum) {
      return 0;
    }

    return Math.log1p(frequency) / Math.log1p(maximum);
  }

  function hasVowel(word, language) {
    return Array.from(word).some((letter) => VOWELS[language].has(letter));
  }

  function createKeyboardNeighbors(rows) {
    const positions = new Map();
    const offsets = [0, 0.35, 0.8];

    rows.forEach((row, rowIndex) => {
      Array.from(row).forEach((letter, columnIndex) => {
        positions.set(letter, {
          x: columnIndex + offsets[rowIndex],
          y: rowIndex
        });
      });
    });

    const neighbors = new Map();

    for (const [letter, position] of positions) {
      const nearby = new Set();

      for (const [candidate, candidatePosition] of positions) {
        if (
          candidate !== letter &&
          Math.abs(candidatePosition.y - position.y) <= 1 &&
          Math.abs(candidatePosition.x - position.x) <= 1.15
        ) {
          nearby.add(candidate);
        }
      }

      neighbors.set(letter, nearby);
    }

    return neighbors;
  }

  const KEYBOARD_NEIGHBORS = {
    en: createKeyboardNeighbors(KEYBOARD_ROWS.en),
    ru: createKeyboardNeighbors(KEYBOARD_ROWS.ru)
  };
  KEYBOARD_NEIGHBORS.ru.set(
    "ё",
    new Set(["й", ...(KEYBOARD_NEIGHBORS.ru.get("ё") ?? [])])
  );

  function longestConsonantRun(letters, language) {
    let current = 0;
    let longest = 0;

    for (const letter of letters) {
      if (VOWELS[language].has(letter)) {
        current = 0;
      } else {
        current += 1;
        longest = Math.max(longest, current);
      }
    }

    return longest;
  }

  function orthographicPlausibility(word, language) {
    const normalized = normalizeWord(word).replace(/['’]/g, "");
    const expectedAlphabet =
      language === "en" ? /^[a-z]+$/ : /^[а-яё]+$/;

    if (!expectedAlphabet.test(normalized)) {
      return 0;
    }

    const letters = Array.from(normalized);
    const vowelCount = letters.filter((letter) =>
      VOWELS[language].has(letter)
    ).length;
    const vowelRatio = vowelCount / letters.length;
    const consonantRun = longestConsonantRun(letters, language);
    let commonBigrams = 0;

    for (let index = 0; index < letters.length - 1; index += 1) {
      if (
        COMMON_BIGRAMS[language].has(
          letters[index] + letters[index + 1]
        )
      ) {
        commonBigrams += 1;
      }
    }

    const bigramRatio =
      letters.length > 1 ? commonBigrams / (letters.length - 1) : 0.5;
    let score = 0.2 + bigramRatio * 0.55;

    if (vowelCount > 0 && vowelRatio >= 0.15 && vowelRatio <= 0.75) {
      score += 0.2;
    } else if (vowelCount === 0 && letters.length >= 4) {
      score -= 0.45;
    }

    if (consonantRun >= 6) {
      score -= 0.4;
    } else if (consonantRun === 5) {
      score -= 0.25;
    } else if (consonantRun === 4) {
      score -= 0.08;
    }

    if (/(.)\1\1/u.test(normalized)) {
      score -= 0.25;
    }

    if (
      language === "ru" &&
      /(?:ов|ев|ин|ын|ский|ская|цкий|цкая|енко|ян|ич|ова|ева|ина)$/u.test(
        normalized
      )
    ) {
      score += 0.08;
    }

    return Math.max(0, Math.min(1, score));
  }

  function caseStyle(word) {
    const letters = String(word).replace(/[^a-zа-яё]/gi, "");

    if (letters.length > 1 && letters === letters.toLocaleUpperCase()) {
      return "upper";
    }

    if (
      letters.length > 1 &&
      letters[0] === letters[0].toLocaleUpperCase() &&
      letters.slice(1) === letters.slice(1).toLocaleLowerCase()
    ) {
      return "capitalized";
    }

    if (letters === letters.toLocaleLowerCase()) {
      return "lower";
    }

    return "mixed";
  }

  function applyCaseStyle(word, source) {
    const style = caseStyle(source);

    if (style === "upper") {
      return word.toLocaleUpperCase();
    }

    if (style === "capitalized") {
      const characters = Array.from(word);
      return (
        (characters[0]?.toLocaleUpperCase() ?? "") +
        characters.slice(1).join("").toLocaleLowerCase()
      );
    }

    return word.toLocaleLowerCase();
  }

  function formatConvertedWord(word, source, layoutVariant) {
    if (normalizeWord(word) === normalizeWord(layoutVariant)) {
      return layoutVariant;
    }

    return applyCaseStyle(word, source);
  }

  function unchangedAnalysis(word, layoutVariant, direction, reason, confidence = 0) {
    return {
      original: word,
      converted: layoutVariant,
      layoutVariant,
      direction,
      confidence,
      shouldReplace: false,
      typoCorrected: false,
      reason
    };
  }

  function findSingleEditCandidates(word, language) {
    const dictionary = dictionaryFor(language);
    const alphabet = ALPHABETS[language];
    const characters = Array.from(word);
    const candidates = new Map();

    if (characters.length > MAX_AUTOCORRECT_LENGTH) {
      return [];
    }

    function consider(candidate, operation, operationBonus) {
      if (candidate === word) {
        return;
      }

      const frequency = dictionary.words.get(candidate) ?? 0;

      if (frequency === 0) {
        return;
      }

      const score = Math.log1p(frequency) + operationBonus;
      const existing = candidates.get(candidate);

      if (!existing || score > existing.score) {
        candidates.set(candidate, {
          word: candidate,
          frequency,
          operation,
          score
        });
      }
    }

    // Лишняя буква в набранном слове.
    for (let index = 0; index < characters.length; index += 1) {
      consider(
        characters.slice(0, index).concat(characters.slice(index + 1)).join(""),
        "deletion",
        0.55
      );
    }

    // Одна неправильная буква.
    for (let index = 0; index < characters.length; index += 1) {
      for (const letter of alphabet) {
        if (letter === characters[index]) {
          continue;
        }

        const candidate = characters.slice();
        candidate[index] = letter;
        const isNeighbor = KEYBOARD_NEIGHBORS[language]
          .get(characters[index])
          ?.has(letter);
        consider(
          candidate.join(""),
          isNeighbor ? "neighbor-substitution" : "substitution",
          isNeighbor ? 1 : 0.2
        );
      }
    }

    // Одна пропущенная буква.
    for (let index = 0; index <= characters.length; index += 1) {
      for (const letter of alphabet) {
        consider(
          characters
            .slice(0, index)
            .concat(letter, characters.slice(index))
            .join(""),
          "insertion",
          0.55
        );
      }
    }

    // Переставленные соседние буквы.
    for (let index = 0; index < characters.length - 1; index += 1) {
      if (characters[index] === characters[index + 1]) {
        continue;
      }

      const candidate = characters.slice();
      [candidate[index], candidate[index + 1]] = [
        candidate[index + 1],
        candidate[index]
      ];
      consider(candidate.join(""), "transposition", 1.15);
    }

    return Array.from(candidates.values()).sort(
      (left, right) =>
        right.score - left.score ||
        right.frequency - left.frequency ||
        left.word.localeCompare(right.word)
    );
  }

  function findBestSingleEditCandidate(word, language) {
    return findSingleEditCandidates(word, language)[0] ?? null;
  }

  function findConfidentSingleEditCandidate(
    word,
    language,
    options = {}
  ) {
    const correctionOptions = normalizeCorrectionOptions(options);
    const candidates = findSingleEditCandidates(word, language);
    const best = candidates[0];
    const second = candidates[1];

    if (!best) {
      return null;
    }

    if (!second) {
      return {
        ...best,
        scoreGap: Infinity,
        frequencyRatio: Infinity
      };
    }

    const scoreGap = best.score - second.score;
    const frequencyRatio = best.frequency / second.frequency;
    const competingRatio =
      correctionOptions.aggressiveness === "safe"
        ? Infinity
        : correctionOptions.aggressiveness === "aggressive"
          ? 8
          : COMPETING_OPERATION_FREQUENCY_RATIO;
    const competingOperation = candidates.find(
      (candidate) =>
        candidate.operation !== best.operation &&
        (competingRatio === Infinity ||
          candidate.frequency * competingRatio >= best.frequency)
    );
    const minimumGap =
      correctionOptions.aggressiveness === "safe"
        ? word.length <= 3
          ? 2
          : 1.6
        : correctionOptions.aggressiveness === "aggressive"
          ? 0.7
          : word.length <= 3
            ? 1.6
            : 1.15;
    const minimumRatio =
      correctionOptions.aggressiveness === "safe"
        ? word.length <= 3
          ? 12
          : 6
        : correctionOptions.aggressiveness === "aggressive"
          ? 2
          : word.length <= 3
            ? 8
            : 4;
    const confident =
      !competingOperation &&
      (scoreGap >= minimumGap ||
        frequencyRatio >= minimumRatio ||
        (best.operation === "transposition" &&
          second.operation !== "transposition" &&
          scoreGap >= 0.75));

    if (!confident) {
      return null;
    }

    return {
      ...best,
      scoreGap,
      frequencyRatio
    };
  }

  function resolveTargetWord(layoutVariant, targetLanguage, options) {
    const normalized = normalizeWord(layoutVariant);
    const dictionary = dictionaryFor(targetLanguage);
    const exactFrequency = dictionary.words.get(normalized) ?? 0;

    // Точное целевое слово всегда побеждает. Автокоррекция запускается только
    // тогда, когда прямого словарного совпадения нет.
    if (exactFrequency > 0) {
      return {
        word: normalized,
        frequency: exactFrequency,
        exactFrequency,
        typoCorrected: false
      };
    }

    if (!options.autocorrectTypos) {
      return null;
    }

    const typoCandidate = findConfidentSingleEditCandidate(
      normalized,
      targetLanguage,
      options
    );

    if (typoCandidate) {
      return {
        word: typoCandidate.word,
        frequency: typoCandidate.frequency,
        exactFrequency: 0,
        typoCorrected: true,
        operation: typoCandidate.operation,
        scoreGap: typoCandidate.scoreGap,
        frequencyRatio: typoCandidate.frequencyRatio
      };
    }

    return null;
  }

  function resolveOrthographicFallback(
    original,
    layoutVariant,
    sourceLanguage,
    targetLanguage,
    options
  ) {
    const correctionOptions = normalizeCorrectionOptions(options);
    const normalizedTarget = normalizeWord(layoutVariant);
    const sourcePlausibility = orthographicPlausibility(
      original,
      sourceLanguage
    );
    const targetPlausibility = orthographicPlausibility(
      normalizedTarget,
      targetLanguage
    );
    const plausibilityGain = targetPlausibility - sourcePlausibility;

    const thresholds =
      correctionOptions.aggressiveness === "safe"
        ? { target: 0.82, source: 0.34, gain: 0.42 }
        : correctionOptions.aggressiveness === "aggressive"
          ? { target: 0.58, source: 0.5, gain: 0.2 }
          : { target: 0.7, source: 0.42, gain: 0.32 };

    if (
      targetPlausibility >= thresholds.target &&
      sourcePlausibility <= thresholds.source &&
      plausibilityGain >= thresholds.gain
    ) {
      return {
        word: normalizedTarget,
        sourcePlausibility,
        targetPlausibility,
        plausibilityGain
      };
    }

    return null;
  }

  function analyzeWord(word, options = {}) {
    const correctionOptions = normalizeCorrectionOptions(options);
    const original = String(word);
    const language = detectTokenLanguage(original);

    if (language !== "en" && language !== "ru") {
      return unchangedAnalysis(
        original,
        original,
        null,
        "unsupported-or-mixed-alphabet"
      );
    }

    const direction = language === "en" ? "en-to-ru" : "ru-to-en";
    const targetLanguage = language === "en" ? "ru" : "en";
    const layoutVariant = layoutMap.convertKeyboardLayout(original, direction);
    const normalizedOriginal = normalizeWord(original);
    const sourceDictionary = dictionaryFor(language);
    const sourceFrequency = sourceDictionary.words.get(normalizedOriginal) ?? 0;
    const letterCount = normalizedOriginal.replace(/[^a-zа-яё]/gi, "").length;

    if (
      correctionOptions.protectedTerms.includes(normalizedOriginal) ||
      correctionOptions.protectedTerms.includes(
        normalizeWord(layoutVariant)
      )
    ) {
      return unchangedAnalysis(
        original,
        layoutVariant,
        direction,
        "user-protected-term",
        0.99
      );
    }

    if (PROTECTED_TECHNICAL_TERMS.has(normalizedOriginal)) {
      return unchangedAnalysis(
        original,
        layoutVariant,
        direction,
        "protected-technical-term",
        0.99
      );
    }

    if (letterCount < correctionOptions.minimumLength) {
      return unchangedAnalysis(
        original,
        layoutVariant,
        direction,
        "below-minimum-length"
      );
    }

    // Для слов длиннее трёх букв точное совпадение исходного языка решает
    // вопрос сразу и не запускает более дорогой поиск опечатки.
    if (sourceFrequency > 0 && letterCount > 3) {
      return unchangedAnalysis(
        original,
        layoutVariant,
        direction,
        "known-source-word",
        0.99
      );
    }

    // Короткие заглавные токены чаще являются API, UI, ID и другими
    // сокращениями. Длинные GHBDTN по-прежнему можно исправить в ПРИВЕТ.
    if (caseStyle(original) === "upper" && letterCount <= 4) {
      return unchangedAnalysis(
        original,
        layoutVariant,
        direction,
        "short-uppercase-abbreviation"
      );
    }

    const target = resolveTargetWord(
      layoutVariant,
      targetLanguage,
      correctionOptions
    );
    const shortOverrideRatio =
      correctionOptions.aggressiveness === "aggressive"
        ? 10
        : SHORT_SOURCE_OVERRIDE_RATIO;
    const shortTargetIsClearlyStronger =
      correctionOptions.aggressiveness !== "safe" &&
      sourceFrequency > 0 &&
      letterCount <= 3 &&
      !hasVowel(normalizedOriginal, language) &&
      target &&
      !target.typoCorrected &&
      target.frequency >= sourceFrequency * shortOverrideRatio;

    // Настоящее исходное слово имеет приоритет. Исключение — короткие шумовые
    // токены из частотного корпуса вроде ns/bp/cj, когда вариант другой
    // раскладки как минимум в 40 раз частотнее.
    if (sourceFrequency > 0 && !shortTargetIsClearlyStronger) {
      return unchangedAnalysis(
        original,
        layoutVariant,
        direction,
        "known-source-word",
        0.99
      );
    }

    const fallback =
      sourceFrequency === 0 && correctionOptions.convertLikelyUnknown
        ? resolveOrthographicFallback(
            original,
            layoutVariant,
            language,
            targetLanguage,
            correctionOptions
          )
        : null;
    const fallbackIsBetterThanRareTypo =
      fallback &&
      target?.typoCorrected &&
      target.frequency < 1000 &&
      fallback.targetPlausibility >= 0.9;

    // Правдоподобное неизвестное имя не подгоняем под редкую соседнюю форму
    // из корпуса: Иванов должен остаться Иванов, а не стать Иванова.
    if (fallback && (!target || fallbackIsBetterThanRareTypo)) {
      const confidence =
        0.7 +
        fallback.targetPlausibility * 0.18 +
        fallback.plausibilityGain * 0.1;

      return {
        original,
          converted: formatConvertedWord(
            fallback.word,
            original,
            layoutVariant
          ),
        layoutVariant,
        direction,
        confidence: Number(Math.min(0.94, confidence).toFixed(3)),
        shouldReplace: true,
        typoCorrected: false,
        reason: "plausible-converted-word",
        evidence: {
          sourceFrequency,
          targetFrequency: 0,
          exactTargetFrequency: 0,
          sourcePlausibility: Number(
            fallback.sourcePlausibility.toFixed(3)
          ),
          targetPlausibility: Number(
            fallback.targetPlausibility.toFixed(3)
          )
        }
      };
    }

    // Ни прямого слова, ни словарного варианта с одной опечаткой — возвращаем
    // исходное слово без изменений.
    if (!target) {
      return unchangedAnalysis(
        original,
        layoutVariant,
        direction,
        "unknown-converted-word"
      );
    }

    const targetDictionary = dictionaryFor(targetLanguage);
    const converted = formatConvertedWord(
      target.word,
      original,
      layoutVariant
    );
    const confidence = target.typoCorrected
      ? 0.82 +
        frequencyStrength(target.frequency, targetDictionary.maximumFrequency) *
          0.16
      : 0.99;

    return {
      original,
      converted,
      layoutVariant,
      direction,
      confidence: Number(Math.min(0.99, confidence).toFixed(3)),
      shouldReplace: true,
      typoCorrected: target.typoCorrected,
      reason: shortTargetIsClearlyStronger
        ? "converted-word-much-more-common"
        : target.typoCorrected
          ? "converted-word-autocorrected"
          : "known-converted-word",
      evidence: {
        sourceFrequency,
        targetFrequency: target.frequency,
        exactTargetFrequency: target.exactFrequency
      }
    };
  }

  function addRange(ranges, start, end) {
    if (start >= 0 && end > start) {
      ranges.push([start, end]);
    }
  }

  function collectPatternRanges(text, pattern, ranges) {
    for (const match of text.matchAll(pattern)) {
      addRange(ranges, match.index, match.index + match[0].length);
    }
  }

  function collectCodeRanges(text, ranges) {
    let lineStart = 0;

    for (const line of text.split(/\n/)) {
      if (looksLikeCode(line)) {
        const quotedRanges = [];

        collectPatternRanges(
          line,
          /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
          quotedRanges
        );

        for (const match of line.matchAll(/[$_\p{L}][$_\p{L}\p{N}]*/gu)) {
          const start = match.index;
          const end = start + match[0].length;
          const insideString = quotedRanges.some(
            ([quoteStart, quoteEnd]) => start >= quoteStart && end <= quoteEnd
          );

          if (!insideString) {
            addRange(ranges, lineStart + start, lineStart + end);
          }
        }
      }

      lineStart += line.length + 1;
    }
  }

  function looksLikeCode(line) {
    const declaration =
      /(?:^|\s)(?:const|let|var|class|function|def|import|export)\s+[$_\p{L}]/u.test(
        line
      );
    const controlWithParentheses =
      /(?:^|\s)(?:if|for|while|switch|catch)\s*\(/u.test(line);
    const operator =
      /=>|={1,3}|!={1,2}|<=|>=|\+=|-=|\*=|\/=|\+\+|--|[{}]/.test(line);
    const functionCall = /[$_\p{L}][$_\p{L}\p{N}]*\([^)]*\)/u.test(line);

    return (
      declaration ||
      controlWithParentheses ||
      operator ||
      functionCall
    );
  }

  function dottedTokenIsKnownLayoutWord(token, options = {}) {
    const correctionOptions = normalizeCorrectionOptions(options);

    if (
      correctionOptions.bareDomainPolicy === "strict" ||
      token.includes("/") ||
      token.includes(":") ||
      (token.match(/\./g) || []).length !== 1
    ) {
      return false;
    }

    const converted = normalizeWord(
      layoutMap.convertKeyboardLayout(token, "en-to-ru")
    );

    if (!/^[а-яё]+$/u.test(converted)) {
      return false;
    }

    return (
      (dictionaries.russian.words.get(converted) ?? 0) >=
      MIN_DOTTED_LAYOUT_WORD_FREQUENCY
    );
  }

  function collectBareDomainRanges(text, ranges, options) {
    const pattern =
      /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:\/[^\s<>"']*)?/gi;

    for (const match of text.matchAll(pattern)) {
      if (!dottedTokenIsKnownLayoutWord(match[0], options)) {
        addRange(ranges, match.index, match.index + match[0].length);
      }
    }
  }

  function collectUserProtectedRanges(text, ranges, options) {
    const correctionOptions = normalizeCorrectionOptions(options);
    const source = String(text);
    const normalizedSource = source.toLocaleLowerCase();

    for (const term of correctionOptions.protectedTerms) {
      let offset = 0;

      while (offset < normalizedSource.length) {
        const index = normalizedSource.indexOf(term, offset);

        if (index === -1) {
          break;
        }

        const end = index + term.length;
        const before = index > 0 ? source[index - 1] : "";
        const after = end < source.length ? source[end] : "";
        const startsWithWord = /^[\p{L}\p{N}]/u.test(term);
        const endsWithWord = /[\p{L}\p{N}]$/u.test(term);
        const validStart =
          !startsWithWord || !/[\p{L}\p{N}]/u.test(before);
        const validEnd = !endsWithWord || !/[\p{L}\p{N}]/u.test(after);

        if (validStart && validEnd) {
          addRange(ranges, index, end);
        }

        offset = index + Math.max(1, term.length);
      }
    }
  }

  function protectedRanges(text, options = {}) {
    const ranges = [];

    collectUserProtectedRanges(text, ranges, options);
    collectPatternRanges(
      text,
      /(?=[\p{L}]*[A-Za-z])(?=[\p{L}]*[А-Яа-яЁё])[\p{L}]+/gu,
      ranges
    );
    collectPatternRanges(
      text,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      ranges
    );
    collectPatternRanges(
      text,
      /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"']+/gi,
      ranges
    );
    collectBareDomainRanges(text, ranges, options);
    collectPatternRanges(
      text,
      /\blocalhost(?::\d{1,5})?(?:\/[^\s<>"']*)?/gi,
      ranges
    );
    collectPatternRanges(
      text,
      /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^\s<>"']*)?/g,
      ranges
    );
    collectPatternRanges(
      text,
      /\b[\p{L}\p{N}_.-]+(?:\/[\p{L}\p{N}_.-]+)+\/?/gu,
      ranges
    );
    collectPatternRanges(
      text,
      /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|~?\.{0,2}\/)[^\s"'()]+/gm,
      ranges
    );
    collectPatternRanges(text, /[@#][\p{L}\p{N}_-]+/gu, ranges);
    for (const match of text.matchAll(/[$_\p{L}][$_\p{L}\p{N}]*/gu)) {
      if (/[\d_$]/u.test(match[0])) {
        addRange(ranges, match.index, match.index + match[0].length);
      }
    }
    collectCodeRanges(text, ranges);

    return ranges.sort((left, right) => left[0] - right[0]);
  }

  function rangeIsProtected(start, end, ranges) {
    return ranges.some(
      ([protectedStart, protectedEnd]) =>
        start < protectedEnd && end > protectedStart
    );
  }

  function isLetter(character) {
    return /[a-zа-яё]/i.test(character);
  }

  function sourceFrequencyForToken(token) {
    const language = detectTokenLanguage(token);

    if (language !== "en" && language !== "ru") {
      return { frequency: 0, maximumFrequency: 0 };
    }

    const dictionary = dictionaryFor(language);
    return {
      frequency: dictionary.words.get(normalizeWord(token)) ?? 0,
      maximumFrequency: dictionary.maximumFrequency
    };
  }

  function tokenCandidateScore(
    core,
    analysis,
    edgePunctuationCount,
    plausibleInitialKeyCount
  ) {
    if (analysis.shouldReplace) {
      const targetLanguage = analysis.direction === "en-to-ru" ? "ru" : "en";
      const dictionary = dictionaryFor(targetLanguage);
      const targetFrequency = analysis.evidence?.targetFrequency ?? 0;
      const frequencyScore =
        frequencyStrength(targetFrequency, dictionary.maximumFrequency) * 300;

      if (analysis.typoCorrected) {
        return 600 + frequencyScore;
      }

      if (analysis.reason === "plausible-converted-word") {
        const targetPlausibility =
          analysis.evidence?.targetPlausibility ?? 0;
        const sourcePlausibility =
          analysis.evidence?.sourcePlausibility ?? 0;
        return (
          500 +
          targetPlausibility * 300 -
          sourcePlausibility * 100 +
          plausibleInitialKeyCount * 40
        );
      }

      return 800 + frequencyScore + edgePunctuationCount * 150;
    }

    if (analysis.reason === "known-source-word") {
      const source = sourceFrequencyForToken(core);
      return (
        900 +
        frequencyStrength(source.frequency, source.maximumFrequency) * 300
      );
    }

    if (analysis.reason === "short-uppercase-abbreviation") {
      return 1300;
    }

    return 0;
  }

  function correctToken(token, options = {}) {
    const characters = Array.from(token);
    const firstLetter = characters.findIndex(isLetter);

    if (firstLetter === -1) {
      return token;
    }

    let lastLetter = characters.length - 1;

    while (lastLetter >= 0 && !isLetter(characters[lastLetter])) {
      lastLetter -= 1;
    }

    const starts = Array.from(
      { length: firstLetter + 1 },
      (_, index) => index
    );
    const ends = Array.from(
      { length: characters.length - lastLetter },
      (_, index) => characters.length - index
    );
    let best = { output: token, score: 0 };

    for (const start of starts) {
      for (const end of ends) {
        if (start > lastLetter || end <= start) {
          continue;
        }

        const core = characters.slice(start, end).join("");
        const analysis = analyzeWord(core, options);
        const edgePunctuationCount =
          characters
            .slice(start, firstLetter)
            .filter((character) => !isLetter(character)).length +
          characters
            .slice(lastLetter + 1, end)
            .filter((character) => !isLetter(character)).length;
        const edgeCharacters = characters
          .slice(start, firstLetter)
          .concat(characters.slice(lastLetter + 1, end));
        const plausibleInitialKeyCount = edgeCharacters.filter((character) =>
          /[,.<>]/.test(character)
        ).length;
        const score = tokenCandidateScore(
          core,
          analysis,
          edgePunctuationCount,
          plausibleInitialKeyCount
        );
        const replacement = analysis.shouldReplace
          ? analysis.converted
          : core;
        const output =
          characters.slice(0, start).join("") +
          replacement +
          characters.slice(end).join("");

        if (score > best.score) {
          best = { output, score };
        }
      }
    }

    return best.output;
  }

  function correctText(text, options = {}) {
    const source = String(text);

    if (!source.trim()) {
      return source;
    }

    const ranges = protectedRanges(source, options);

    return source.replace(TOKEN_PATTERN, (token, offset) => {
      if (rangeIsProtected(offset, offset + token.length, ranges)) {
        return token;
      }

      return correctToken(token, options);
    });
  }

  return {
    analyzeWord,
    correctToken,
    correctText,
    findBestSingleEditCandidate,
    findConfidentSingleEditCandidate,
    findSingleEditCandidates,
    dottedTokenIsKnownLayoutWord,
    looksLikeCode,
    normalizeCorrectionOptions,
    orthographicPlausibility,
    protectedRanges
  };
});
