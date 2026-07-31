const test = require("node:test");
const assert = require("node:assert/strict");

const dictionaries = require("../dictionaries");
const { convertKeyboardLayout } = require("../layout-map");
const {
  analyzeWord,
  correctText,
  findConfidentSingleEditCandidate,
  protectedRanges
} = require("../word-analyzer");

test("bundles the full offline frequency lists for both languages", () => {
  assert.equal(dictionaries.english.size, 46717);
  assert.equal(dictionaries.russian.size, 48249);
  assert.ok(dictionaries.english.words.has("business"));
  assert.ok(dictionaries.russian.words.has("привет"));
  assert.ok(dictionaries.russian.words.has("ещё"));
  assert.ok(dictionaries.russian.words.has("москва"));
  assert.deepEqual(dictionaries.source, {
    repository: "https://github.com/hermitdave/FrequencyWords",
    commit: "525f9b560de45753a5ea01069454e72e9aa541c6",
    license: "CC-BY-SA-4.0"
  });
});

test("keeps correct words and fixes wrong-layout words", () => {
  const cases = new Map([
    ["business", "business"],
    ["игыштуыы", "business"],
    ["hello", "hello"],
    ["руддщ", "hello"],
    ["привет", "привет"],
    ["ghbdtn", "привет"]
  ]);

  for (const [source, expected] of cases) {
    assert.equal(correctText(source), expected, source);
  }
});

test("analyzes each word independently in mixed text", () => {
  const cases = new Map([
    ["Это business", "Это business"],
    ["Это игыштуыы", "Это business"],
    ["Я написал ghbdtn для business", "Я написал привет для business"],
    ["Hello, мир!", "Hello, мир!"],
    ["игыштуыы и ghbdtn", "business и привет"]
  ]);

  for (const [source, expected] of cases) {
    assert.equal(correctText(source), expected, source);
  }
});

test("accepts valid converted names without a separate name heuristic", () => {
  assert.equal(correctText("vjcrdf"), "москва");
  assert.equal(correctText("Vjcrdf"), "Москва");
  assert.equal(correctText("fylhtq"), "андрей");
  assert.equal(correctText("Fylhtq"), "Андрей");
  assert.equal(correctText("bdfyjd"), "иванов");
  assert.equal(correctText('",bdfyjd"'), '"биванов"');
});

test("converts punctuation keys when they are initials", () => {
  assert.equal(correctText(",.bdfyjd"), "бюиванов");
  assert.equal(correctText("<>Bdfyjd"), "БЮИванов");
  assert.equal(correctText('",.bdfyjd"'), '"бюиванов"');
});

test("converts short unknown tokens when the other-layout word exists", () => {
  assert.equal(correctText("df"), "ва");
  assert.equal(correctText("ns"), "ты");
  assert.equal(correctText("bp"), "из");
  assert.equal(correctText("cj"), "со");
  assert.equal(correctText("ghb"), "при");
  assert.equal(correctText("lf"), "да");
  assert.equal(correctText("d"), "в");
  assert.equal(correctText("c"), "с");
  assert.equal(correctText("nt"), "те");
  assert.equal(correctText("фе"), "фе");
  assert.equal(correctText("рук"), "рук");
  assert.equal(correctText("лун"), "лун");
  assert.equal(correctText("a"), "a");
  assert.equal(correctText("я"), "я");
});

test("autocorrects one typo after changing the layout", () => {
  const cases = new Map([
    ["ghbdtm", "привет"],
    ["ghbdt", "привет"],
    ["ghbdtnn", "привет"],
    ["ghbdnt", "привет"],
    ["руддф", "hella"],
    ["игыштуыщ", "business"],
    ["игышутыы", "business"]
  ]);

  for (const [source, expected] of cases) {
    assert.equal(correctText(source), expected, source);
  }
});

test("keeps an exact target dictionary word instead of autocorrecting it", () => {
  const cases = new Map([
    ["сщву", "code"],
    ["рукщ", "hero"],
    ["цшдв", "wild"],
    ["pyfr", "знак"],
    ["vty.", "меню"],
    ["ctnm", "сеть"]
  ]);

  for (const [source, expected] of cases) {
    assert.equal(correctText(source), expected, source);
  }
});

test("rejects ambiguous typo candidates", () => {
  assert.equal(findConfidentSingleEditCandidate("tht", "en"), null);
  assert.equal(findConfidentSingleEditCandidate("быо", "ru"), null);
  assert.equal(findConfidentSingleEditCandidate("thnk", "en"), null);
  assert.equal(
    findConfidentSingleEditCandidate("привеь", "ru").word,
    "привет"
  );
});

test("rejects ambiguous corrections through the complete layout path", () => {
  const cases = [
    ["ths", "en"],
    ["thre", "en"],
    ["donw", "en"],
    ["этго", "ru"],
    ["одн", "ru"],
    ["чео", "ru"]
  ];

  for (const [targetTypo, language] of cases) {
    const source = convertKeyboardLayout(
      targetTypo,
      language === "en" ? "en-to-ru" : "ru-to-en"
    );

    assert.equal(correctText(source), source, targetTypo);
  }
});

test("allows typo and unknown-word behavior to be configured independently", () => {
  assert.equal(
    correctText("ghbdtm", { autocorrectTypos: false }),
    "привеь"
  );
  assert.equal(
    correctText("ghbdtm", {
      autocorrectTypos: false,
      convertLikelyUnknown: false
    }),
    "ghbdtm"
  );
  assert.equal(correctText("ghbdtm", { autocorrectTypos: true }), "привет");

  assert.equal(
    correctText("Bdfyjd", {
      autocorrectTypos: false,
      convertLikelyUnknown: false
    }),
    "Bdfyjd"
  );
  assert.equal(
    correctText("Bdfyjd", {
      autocorrectTypos: false,
      convertLikelyUnknown: true
    }),
    "Иванов"
  );
});

test("protects technical terms without disabling aggressive short-word conversion", () => {
  for (const source of [
    "npm",
    "api",
    "url",
    "css",
    "html",
    "sql",
    "jwt",
    "tls",
    "gh",
    "zsh"
  ]) {
    assert.equal(correctText(source), source, source);
  }

  assert.equal(correctText("ns"), "ты");
});

test("honors user-protected words and multi-word names", () => {
  const options = {
    protectedTerms: ["Hello", "Б.Ю. Иванов"]
  };

  assert.equal(correctText("руддщ", options), "руддщ");
  assert.equal(
    correctText("Б.Ю. Иванов и ghbdtn", options),
    "Б.Ю. Иванов и привет"
  );
});

test("skips expensive typo generation for unusually long tokens", () => {
  const source = "q".repeat(1500);
  const startedAt = performance.now();

  assert.equal(correctText(source), source);
  assert.ok(
    performance.now() - startedAt < 500,
    "long token should be processed in under 500 ms"
  );
});

test("protects bare domains, localhost and IP addresses", () => {
  const unchanged = [
    "ghbdtn.com",
    "ghbdtn.dev/path",
    "localhost:3000/ghbdtn",
    "127.0.0.1:8080/ghbdtn"
  ];

  for (const source of unchanged) {
    assert.equal(correctText(source), source, source);
  }
});

test("distinguishes bare domains from dots typed as the Russian letter ю", () => {
  assert.equal(correctText("k.lb"), "люди");
  assert.equal(correctText("rjvgm.nth"), "компьютер");
  assert.equal(
    correctText("k.lb", { bareDomainPolicy: "strict" }),
    "k.lb"
  );
  assert.equal(correctText("test.ru"), "test.ru");
  assert.equal(correctText("example.com"), "example.com");
});

test("does not mistake ordinary prose keywords for code", () => {
  assert.equal(correctText("Please return ghbdtn"), "Please return привет");
  assert.equal(correctText("I work for ghbdtn"), "I work for привет");
  assert.equal(
    correctText('const ghbdtn = "ghbdtn";'),
    'const ghbdtn = "привет";'
  );
  assert.equal(
    correctText("if (ghbdtn) return true;"),
    "if (ghbdtn) return true;"
  );
});

test("preserves punctuation, whitespace, line breaks, quotes and hyphens", () => {
  assert.equal(correctText('"ghbdtn!"'), '"привет!"');
  assert.equal(correctText("ghbdtn;"), "привет;");
  assert.equal(correctText("(игыштуыы)"), "(business)");
  assert.equal(
    correctText("ghbdtn,\n  игыштуыы-business"),
    "привет,\n  business-business"
  );
  assert.equal(correctText(""), "");
  assert.equal(correctText(" \n\t "), " \n\t ");
});

test("recognizes punctuation keys that represent Russian letters", () => {
  const cases = new Map([
    ["nt,z", "тебя"],
    ["pyf.", "знаю"],
    ["dc`", "всё"],
    ["b[", "их"],
    ["[jhjij", "хорошо"],
    [";t", "же"],
    [",sk", "был"],
    ["ye;yj", "нужно"],
    ["cgfcb,j", "спасибо"]
  ]);

  for (const [source, expected] of cases) {
    assert.equal(correctText(source), expected, source);
  }
});

test("distinguishes layout keys from ordinary punctuation", () => {
  assert.equal(correctText("ghbdtn,"), "привет,");
  assert.equal(correctText("ghbdtn."), "привет.");
  assert.equal(correctText("hello,"), "hello,");
  assert.equal(correctText("he,"), "he,");
  assert.equal(correctText("business."), "business.");
  assert.equal(correctText("ghbdtn,мир"), "привет,мир");
});

test("preserves case style through the keyboard mapping", () => {
  assert.equal(correctText("Ghbdtn"), "Привет");
  assert.equal(correctText("GHBDTN"), "ПРИВЕТ");
  assert.equal(correctText("Игыштуыы"), "Business");
  assert.equal(correctText("АШДУ"), "FILE");
  assert.equal(correctText("BUSINESS"), "BUSINESS");
  assert.equal(correctText("API"), "API");
});

test("does not touch protected tokens and valid source words", () => {
  const unchanged = [
    "test@example.com",
    "https://example.com/business",
    "www.example.com/ghbdtn",
    "@ghbdtn",
    "#ghbdtn",
    "foo/bar/ghbdtn",
    "./src/ghbdtn.js",
    "variable_ghbdtn",
    "release2ghbdtn",
    "12345",
    "ghпривет",
    "florbaz",
    "OpenAI"
  ];

  for (const source of unchanged) {
    assert.equal(correctText(source), source, source);
  }
});

test("protects code identifiers but analyzes text inside string literals", () => {
  assert.equal(
    correctText('const business = "ghbdtn"'),
    'const business = "привет"'
  );
  assert.equal(
    correctText('const ghbdtn = "ghbdtn";'),
    'const ghbdtn = "привет";'
  );
  assert.ok(protectedRanges('const ghbdtn = "ghbdtn";').length > 0);
});

test("returns transparent evidence from analyzeWord", () => {
  assert.deepEqual(
    analyzeWord("игыштуыы"),
    {
      original: "игыштуыы",
      converted: "business",
      layoutVariant: "business",
      direction: "ru-to-en",
      confidence: 0.99,
      shouldReplace: true,
      typoCorrected: false,
      reason: "known-converted-word",
      evidence: {
        sourceFrequency: 0,
        targetFrequency: 215855,
        exactTargetFrequency: 215855
      }
    }
  );

  const autocorrected = analyzeWord("ghbdtm");
  assert.equal(autocorrected.converted, "привет");
  assert.equal(autocorrected.layoutVariant, "привеь");
  assert.equal(autocorrected.typoCorrected, true);
  assert.equal(autocorrected.reason, "converted-word-autocorrected");

  const knownWord = analyzeWord("business");
  assert.equal(knownWord.shouldReplace, false);
  assert.equal(knownWord.reason, "known-source-word");
});
