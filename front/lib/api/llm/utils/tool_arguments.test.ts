import { describe, expect, it } from "vitest";

import { fixCorruptedUnicode, parseToolArguments } from "./tool_arguments";

describe("fixCorruptedUnicode", () => {
  describe("corrupted Latin-1 Supplement characters", () => {
    it("should fix common French accented characters", () => {
      // é (U+00E9)
      expect(fixCorruptedUnicode("g\x00e9n\x00e9rative")).toBe("générative");

      // à (U+00E0)
      expect(fixCorruptedUnicode("\x00e0 propos")).toBe("à propos");

      // è (U+00E8)
      expect(fixCorruptedUnicode("tr\x00e8s")).toBe("très");

      // ç (U+00E7)
      expect(fixCorruptedUnicode("fran\x00e7ais")).toBe("français");

      // ê (U+00EA)
      expect(fixCorruptedUnicode("for\x00eat")).toBe("forêt");

      // ù (U+00F9)
      expect(fixCorruptedUnicode("o\x00f9")).toBe("où");

      // û (U+00FB)
      expect(fixCorruptedUnicode("s\x00fbr")).toBe("sûr");
    });

    it("should fix uppercase accented characters", () => {
      // É (U+00C9)
      expect(fixCorruptedUnicode("\x00c9cole")).toBe("École");

      // À (U+00C0)
      expect(fixCorruptedUnicode("\x00c0 Paris")).toBe("À Paris");
    });

    it("should fix special Latin-1 characters", () => {
      // × (U+00D7) multiplication sign
      expect(fixCorruptedUnicode("2\x00d73")).toBe("2×3");

      // · (U+00B7) middle dot
      expect(fixCorruptedUnicode("A\x00b7B")).toBe("A·B");

      // « (U+00AB) left-pointing double angle quotation mark
      expect(fixCorruptedUnicode("\x00abBonjour\x00bb")).toBe("«Bonjour»");

      // ¿ (U+00BF) inverted question mark
      expect(fixCorruptedUnicode("\x00bfQu\x00e9?")).toBe("¿Qué?");

      // ñ (U+00F1)
      expect(fixCorruptedUnicode("espa\x00f1ol")).toBe("español");

      // ä (U+00E4)
      expect(fixCorruptedUnicode("M\x00e4dchen")).toBe("Mädchen");

      // ö (U+00F6)
      expect(fixCorruptedUnicode("sch\x00f6n")).toBe("schön");
    });

    it("should fix characters at range boundaries", () => {
      // U+0080 (first character in Latin-1 Supplement)
      expect(fixCorruptedUnicode("\x0080")).toBe("\u0080");

      // ÿ (U+00FF) (last character in Latin-1 Supplement)
      expect(fixCorruptedUnicode("\x00ff")).toBe("ÿ");
    });

    it("should handle uppercase hex digits", () => {
      expect(fixCorruptedUnicode("\x00E9")).toBe("é");
      expect(fixCorruptedUnicode("\x00C9")).toBe("É");
      expect(fixCorruptedUnicode("\x00Ab")).toBe("«");
    });
  });

  describe("multiple corruptions", () => {
    it("should fix multiple corrupted characters in sequence", () => {
      expect(fixCorruptedUnicode("\x00e9\x00e0")).toBe("éà");
    });

    it("should fix multiple corrupted characters in a sentence", () => {
      expect(
        fixCorruptedUnicode(
          "Acme Corp IA g\x00e9n\x00e9rative relances clients"
        )
      ).toBe("Acme Corp IA générative relances clients");
    });

    it("should fix real GPT-5 corruption examples", () => {
      // Example 1
      expect(
        fixCorruptedUnicode(
          "Acme Corp IA g\x00e9n\x00e9rative relances clients factures IA"
        )
      ).toBe("Acme Corp IA générative relances clients factures IA");

      // Example 2
      expect(
        fixCorruptedUnicode(
          "AutoInsure Co - ton \x00e9ditorial et voix de marque pour contenus daitoriel assurance et services, " +
            "style p\x00e9dagogique, accessible, rassurant, orient\x00e9 grand public. Points \x00e0 respecter : " +
            "clart\x00e9, phrases courtes, vocabulaire simple mais pr\x00e9cis, posture experte et bienveillante, " +
            "ancrage assurance auto / habitation, neutralit\x00e9 commerciale, conseils pratiques. " +
            "Mots \x00e0 privil\x00e9gier / \x00e9viter ? Longueur attendue Q&A 80-150 mots. " +
            'Angle H3 : "Devis gratuit ou payant : que dit la loi ?" dans H2 "Questions fr\x00e9quentes".'
        )
      ).toBe(
        "AutoInsure Co - ton éditorial et voix de marque pour contenus daitoriel assurance et services, " +
          "style pédagogique, accessible, rassurant, orienté grand public. Points à respecter : " +
          "clarté, phrases courtes, vocabulaire simple mais précis, posture experte et bienveillante, " +
          "ancrage assurance auto / habitation, neutralité commerciale, conseils pratiques. " +
          "Mots à privilégier / éviter ? Longueur attendue Q&A 80-150 mots. " +
          'Angle H3 : "Devis gratuit ou payant : que dit la loi ?" dans H2 "Questions fréquentes".'
      );

      // Example 3
      expect(
        fixCorruptedUnicode(
          "TaxConsult France IA g\x00e9n\x00e9rative fiscalit\x00e9 copilot"
        )
      ).toBe("TaxConsult France IA générative fiscalité copilot");

      // Example 4
      expect(
        fixCorruptedUnicode(
          "AccountPro IA g\x00e9n\x00e9rative experts\x00d7\x00b7comptables France"
        )
      ).toBe("AccountPro IA générative experts×·comptables France");
    });
  });

  describe("no corruption cases", () => {
    it("should not modify strings without corruption", () => {
      expect(fixCorruptedUnicode("Hello World")).toBe("Hello World");
      expect(fixCorruptedUnicode("Bonjour")).toBe("Bonjour");
      expect(fixCorruptedUnicode("Simple text")).toBe("Simple text");
    });

    it("should not modify already-correct Unicode characters", () => {
      expect(fixCorruptedUnicode("café")).toBe("café");
      expect(fixCorruptedUnicode("École")).toBe("École");
      expect(fixCorruptedUnicode("très bien")).toBe("très bien");
    });

    it("should handle empty string", () => {
      expect(fixCorruptedUnicode("")).toBe("");
    });

    it("should handle strings with regular hex-like patterns", () => {
      expect(fixCorruptedUnicode("0xe9")).toBe("0xe9");
      expect(fixCorruptedUnicode("hex: ab cd ef")).toBe("hex: ab cd ef");
    });
  });

  describe("null byte edge cases", () => {
    it("should not modify null byte followed by non-hex characters", () => {
      expect(fixCorruptedUnicode("\x00xyz")).toBe("\x00xyz");
      expect(fixCorruptedUnicode("\x00gh")).toBe("\x00gh");
    });

    it("should not modify null byte with only one hex digit", () => {
      expect(fixCorruptedUnicode("\x00e")).toBe("\x00e");
      expect(fixCorruptedUnicode("\x00a")).toBe("\x00a");
    });

    it("should not modify null byte with no following characters", () => {
      expect(fixCorruptedUnicode("\x00")).toBe("\x00");
    });

    it("should fix only the first 2 hex digits after null byte", () => {
      expect(fixCorruptedUnicode("\x00e9a")).toBe("éa");
      expect(fixCorruptedUnicode("\x00abcdef")).toBe("«cdef");
    });

    it("should handle null byte with 3 or more hex digits", () => {
      // Only first 2 hex digits should be considered
      expect(fixCorruptedUnicode("\x00e9e0")).toBe("ée0");
      expect(fixCorruptedUnicode("\x00abcdef")).toBe("«cdef");
    });
  });

  describe("ASCII range protection", () => {
    it("should NOT fix null byte followed by ASCII range hex (0x00-0x7F)", () => {
      // These should NOT be fixed because they're in ASCII range
      expect(fixCorruptedUnicode("\x0000")).toBe("\x0000"); // NULL
      expect(fixCorruptedUnicode("\x0020")).toBe("\x0020"); // SPACE
      expect(fixCorruptedUnicode("\x0041")).toBe("\x0041"); // A
      expect(fixCorruptedUnicode("\x0061")).toBe("\x0061"); // a
      expect(fixCorruptedUnicode("\x007f")).toBe("\x007f"); // DEL
      expect(fixCorruptedUnicode("\x007e")).toBe("\x007e"); // ~
    });
  });

  describe("mixed content", () => {
    it("should fix corrupted characters while preserving normal text", () => {
      expect(fixCorruptedUnicode("Hello g\x00e9n\x00e9rative world")).toBe(
        "Hello générative world"
      );
    });

    it("should handle mix of corrupted and correct Unicode", () => {
      expect(fixCorruptedUnicode("café et th\x00e9")).toBe("café et thé");
    });

    it("should preserve numbers, symbols, and special characters", () => {
      expect(fixCorruptedUnicode("123 test@example.com $100 #tag \x00e9")).toBe(
        "123 test@example.com $100 #tag é"
      );
    });
  });

  describe("complex real-world scenarios", () => {
    it("should handle JSON-like strings with corruption", () => {
      const input = '{"query":"Acme Corp IA g\x00e9n\x00e9rative"}';
      const expected = '{"query":"Acme Corp IA générative"}';
      expect(fixCorruptedUnicode(input)).toBe(expected);
    });

    it("should handle long text with multiple corruption patterns", () => {
      const input =
        "L\x00e9ducation nationale fran\x00e7aise est tr\x00e8s pr\x00e9cise sur la qualit\x00e9 " +
        "de l\x00e9ducation \x00e0 fournir. Les \x00e9l\x00e8ves doivent \x00eatre bien pr\x00e9par\x00e9s.";
      const expected =
        "Léducation nationale française est très précise sur la qualité " +
        "de léducation à fournir. Les élèves doivent être bien préparés.";
      expect(fixCorruptedUnicode(input)).toBe(expected);
    });

    it("should handle consecutive null bytes", () => {
      expect(fixCorruptedUnicode("\x00\x00e9")).toBe("\x00é");
      expect(fixCorruptedUnicode("\x00e9\x00e0")).toBe("éà");
    });

    it("should preserve newlines, tabs, and other whitespace", () => {
      expect(fixCorruptedUnicode("Line1\x00e9\nLine2\x00e0\tTab")).toBe(
        "Line1é\nLine2à\tTab"
      );
    });
  });
});

describe("parseToolArguments", () => {
  describe("with corrupted Unicode", () => {
    it("should parse JSON with corrupted Unicode characters", () => {
      const input =
        '{"query":"Acme Corp IA g\x00e9n\x00e9rative relances clients factures IA"}';
      const result = parseToolArguments(input, "test_tool");
      expect(result).toEqual({
        query: "Acme Corp IA générative relances clients factures IA",
      });
    });

    it("should parse complex JSON with multiple corrupted fields", () => {
      const input =
        '{"query":"TaxConsult France IA g\x00e9n\x00e9rative fiscalit\x00e9","relativeTimeFrame":"all"}';
      const result = parseToolArguments(input, "test_tool");
      expect(result).toEqual({
        query: "TaxConsult France IA générative fiscalité",
        relativeTimeFrame: "all",
      });
    });

    it("should handle nested objects with corruption", () => {
      const input = '{"data":{"text":"tr\x00e8s bien","count":42}}';
      const result = parseToolArguments(input, "test_tool");
      expect(result).toEqual({
        data: {
          text: "très bien",
          count: 42,
        },
      });
    });

    it("should handle arrays with corrupted strings", () => {
      const input = '{"items":["caf\x00e9","th\x00e9","cr\x00e8me"]}';
      const result = parseToolArguments(input, "test_tool");
      expect(result).toEqual({
        items: ["café", "thé", "crème"],
      });
    });
  });

  describe("without corruption", () => {
    it("should parse normal JSON correctly", () => {
      const input = '{"query":"Hello World","count":5}';
      const result = parseToolArguments(input, "test_tool");
      expect(result).toEqual({
        query: "Hello World",
        count: 5,
      });
    });

    it("should parse already-correct Unicode", () => {
      const input = '{"query":"café et thé"}';
      const result = parseToolArguments(input, "test_tool");
      expect(result).toEqual({
        query: "café et thé",
      });
    });

    it("should return empty object for empty string", () => {
      const result = parseToolArguments("", "test_tool");
      expect(result).toEqual({});
    });

    it("should return empty object for whitespace-only string", () => {
      const result = parseToolArguments("  \n  ", "test_tool");
      expect(result).toEqual({});
    });
  });

  describe("error cases", () => {
    it("should throw on invalid JSON", () => {
      expect(() => parseToolArguments('{"invalid": }', "test_tool")).toThrow(
        /Failed to parse arguments in call to tool 'test_tool'/
      );
    });

    it("should throw on non-object JSON", () => {
      expect(() => parseToolArguments('"just a string"', "test_tool")).toThrow(
        /Tool call arguments must be an object/
      );

      expect(() => parseToolArguments("123", "test_tool")).toThrow(
        /Tool call arguments must be an object/
      );

      expect(() => parseToolArguments('["array"]', "test_tool")).toThrow(
        /Tool call arguments must be an object/
      );
    });

    it("should throw on null", () => {
      expect(() => parseToolArguments("null", "test_tool")).toThrow(
        /Tool call arguments must be an object/
      );
    });
  });

  describe("integration with real GPT-5 examples", () => {
    it("should handle Example 1", () => {
      const input =
        '{"query":"Acme Corp IA g\x00e9n\x00e9rative relances clients factures IA"}';
      const result = parseToolArguments(input, "search_tool");
      expect(result.query).toBe(
        "Acme Corp IA générative relances clients factures IA"
      );
    });

    it("should handle Example 2", () => {
      const input =
        '{"query":"AutoInsure Co - ton \x00e9ditorial et voix de marque pour contenus daitoriel assurance et services, ' +
        "style p\x00e9dagogique, accessible, rassurant, orient\x00e9 grand public. Points \x00e0 respecter : " +
        "clart\x00e9, phrases courtes, vocabulaire simple mais pr\x00e9cis, posture experte et bienveillante, " +
        "ancrage assurance auto / habitation, neutralit\x00e9 commerciale, conseils pratiques. " +
        "Mots \x00e0 privil\x00e9gier / \x00e9viter ? Longueur attendue Q&A 80-150 mots. " +
        'Angle H3 : \\"Devis gratuit ou payant : que dit la loi ?\\" dans H2 \\"Questions fr\x00e9quentes\\".",' +
        '"relativeTimeFrame":"all"}';
      const result = parseToolArguments(input, "search_tool");
      expect(result.query).toContain("pédagogique");
      expect(result.query).toContain("orienté");
      expect(result.query).toContain("à respecter");
      expect(result.query).toContain("clarté");
      expect(result.query).toContain("précis");
      expect(result.query).toContain("neutralité");
      expect(result.query).toContain("privilégier");
      expect(result.query).toContain("éviter");
      expect(result.query).toContain("fréquentes");
    });

    it("should handle Example 3", () => {
      const input =
        '{"query":"TaxConsult France IA g\x00e9n\x00e9rative fiscalit\x00e9 copilot"}';
      const result = parseToolArguments(input, "search_tool");
      expect(result.query).toBe(
        "TaxConsult France IA générative fiscalité copilot"
      );
    });

    it("should handle Example 4", () => {
      const input =
        '{"query":"AccountPro IA g\x00e9n\x00e9rative experts\x00d7\x00b7comptables France"}';
      const result = parseToolArguments(input, "search_tool");
      expect(result.query).toBe(
        "AccountPro IA générative experts×·comptables France"
      );
    });
  });
});
