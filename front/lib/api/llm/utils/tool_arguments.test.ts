import { describe, expect, it } from "vitest";

import { parseToolArguments } from "./tool_arguments";

describe("parseToolArguments", () => {
  describe("basic parsing", () => {
    it("should parse valid JSON tool arguments", () => {
      const result = parseToolArguments(
        '{"query":"test","limit":10}',
        "search"
      );
      expect(result).toEqual({ query: "test", limit: 10 });
    });

    it("should return empty object for empty string", () => {
      const result = parseToolArguments("", "search");
      expect(result).toEqual({});
    });

    it("should return empty object for whitespace-only string", () => {
      const result = parseToolArguments("   ", "search");
      expect(result).toEqual({});
    });

    it("should throw error for invalid JSON", () => {
      expect(() =>
        parseToolArguments("{invalid json}", "search")
      ).toThrowError(/Failed to parse arguments in call to tool 'search'/);
    });

    it("should throw error for non-object JSON", () => {
      expect(() => parseToolArguments('"string"', "search")).toThrowError(
        /Tool call arguments must be an object/
      );
      expect(() => parseToolArguments("[]", "search")).toThrowError(
        /Tool call arguments must be an object/
      );
      expect(() => parseToolArguments("123", "search")).toThrowError(
        /Tool call arguments must be an object/
      );
    });
  });

  describe("Unicode corruption fix", () => {
    describe("corrupted Latin-1 Supplement characters", () => {
      it("should fix common French accented characters", () => {
        const result = parseToolArguments(
          '{"text":"g\\u0000e9n\\u0000e9rative"}',
          "test"
        );
        expect(result).toEqual({ text: "générative" });
      });

      it("should fix à (U+00E0)", () => {
        const result = parseToolArguments('{"text":"\\u0000e0 propos"}', "test");
        expect(result).toEqual({ text: "à propos" });
      });

      it("should fix è (U+00E8)", () => {
        const result = parseToolArguments('{"text":"tr\\u0000e8s"}', "test");
        expect(result).toEqual({ text: "très" });
      });

      it("should fix ç (U+00E7)", () => {
        const result = parseToolArguments(
          '{"text":"fran\\u0000e7ais"}',
          "test"
        );
        expect(result).toEqual({ text: "français" });
      });

      it("should fix ê (U+00EA)", () => {
        const result = parseToolArguments('{"text":"for\\u0000eat"}', "test");
        expect(result).toEqual({ text: "forêt" });
      });

      it("should fix ù (U+00F9)", () => {
        const result = parseToolArguments('{"text":"o\\u0000f9"}', "test");
        expect(result).toEqual({ text: "où" });
      });

      it("should fix û (U+00FB)", () => {
        const result = parseToolArguments('{"text":"s\\u0000fbr"}', "test");
        expect(result).toEqual({ text: "sûr" });
      });
    });

    describe("uppercase accented characters", () => {
      it("should fix É (U+00C9)", () => {
        const result = parseToolArguments('{"text":"\\u0000c9cole"}', "test");
        expect(result).toEqual({ text: "École" });
      });

      it("should fix À (U+00C0)", () => {
        const result = parseToolArguments(
          '{"text":"\\u0000c0 Paris"}',
          "test"
        );
        expect(result).toEqual({ text: "À Paris" });
      });
    });

    describe("special Latin-1 characters", () => {
      it("should fix × (U+00D7) multiplication sign", () => {
        const result = parseToolArguments('{"text":"2\\u0000d73"}', "test");
        expect(result).toEqual({ text: "2×3" });
      });

      it("should fix · (U+00B7) middle dot", () => {
        const result = parseToolArguments('{"text":"A\\u0000b7B"}', "test");
        expect(result).toEqual({ text: "A·B" });
      });

      it("should fix « » quotation marks", () => {
        const result = parseToolArguments(
          '{"text":"\\u0000abBonjour\\u0000bb"}',
          "test"
        );
        expect(result).toEqual({ text: "«Bonjour»" });
      });

      it("should fix ñ (U+00F1)", () => {
        const result = parseToolArguments('{"text":"espa\\u0000f1ol"}', "test");
        expect(result).toEqual({ text: "español" });
      });

      it("should fix ä (U+00E4)", () => {
        const result = parseToolArguments(
          '{"text":"M\\u0000e4dchen"}',
          "test"
        );
        expect(result).toEqual({ text: "Mädchen" });
      });

      it("should fix ö (U+00F6)", () => {
        const result = parseToolArguments('{"text":"sch\\u0000f6n"}', "test");
        expect(result).toEqual({ text: "schön" });
      });
    });

    describe("range boundaries", () => {
      it("should fix U+0080 (first character in Latin-1 Supplement)", () => {
        const result = parseToolArguments('{"text":"\\u000080"}', "test");
        expect(result).toEqual({ text: "\u0080" });
      });

      it("should fix ÿ (U+00FF) (last character in Latin-1 Supplement)", () => {
        const result = parseToolArguments('{"text":"\\u0000ff"}', "test");
        expect(result).toEqual({ text: "ÿ" });
      });
    });

    describe("case insensitivity", () => {
      it("should handle uppercase hex digits", () => {
        const result = parseToolArguments(
          '{"a":"\\u0000E9","b":"\\u0000C9","c":"\\u0000Ab"}',
          "test"
        );
        expect(result).toEqual({ a: "é", b: "É", c: "«" });
      });
    });
  });

  describe("multiple corruptions", () => {
    it("should fix multiple corrupted characters in a field", () => {
      const result = parseToolArguments(
        '{"text":"Acme Corp IA g\\u0000e9n\\u0000e9rative"}',
        "test"
      );
      expect(result).toEqual({ text: "Acme Corp IA générative" });
    });

    it("should fix real GPT-5 corruption examples", () => {
      const result = parseToolArguments(
        '{"query":"Ornikar ton p\\u0000e9dagogique grand public, assurance auto et habitation, simulateur de devis en ligne, personnalisation imm\\u0000e9diate, voix de marque Ornikar Assurance, style SEO clair et accessible, paragraphe 120-200 mots, angle unique outil interactif","relativeTimeFrame":"all"}',
        "web_search"
      );
      expect(result).toEqual({
        query:
          "Ornikar ton pédagogique grand public, assurance auto et habitation, simulateur de devis en ligne, personnalisation immédiate, voix de marque Ornikar Assurance, style SEO clair et accessible, paragraphe 120-200 mots, angle unique outil interactif",
        relativeTimeFrame: "all",
      });
    });

    it("should fix corruption in multiple fields", () => {
      const result = parseToolArguments(
        '{"title":"Caf\\u0000e9","description":"Tr\\u0000e8s bon"}',
        "test"
      );
      expect(result).toEqual({ title: "Café", description: "Très bon" });
    });
  });

  describe("no corruption cases", () => {
    it("should not modify strings without corruption", () => {
      const result = parseToolArguments(
        '{"text":"Hello World","query":"Simple text"}',
        "test"
      );
      expect(result).toEqual({ text: "Hello World", query: "Simple text" });
    });

    it("should not modify already-correct Unicode characters", () => {
      const result = parseToolArguments(
        '{"text":"café École très bien"}',
        "test"
      );
      expect(result).toEqual({ text: "café École très bien" });
    });

    it("should handle strings with regular hex-like patterns", () => {
      const result = parseToolArguments(
        '{"text":"0xe9","hex":"ab cd ef"}',
        "test"
      );
      expect(result).toEqual({ text: "0xe9", hex: "ab cd ef" });
    });
  });

  describe("ASCII range protection", () => {
    it("should NOT fix \\u0000 followed by ASCII range hex (0x00-0x7F)", () => {
      // These should NOT be fixed because they're in ASCII range
      const result = parseToolArguments(
        '{"a":"\\u000000","b":"\\u000020","c":"\\u000041","d":"\\u000061","e":"\\u00007f"}',
        "test"
      );
      // These should remain as null bytes + hex in the parsed result
      expect(result).toEqual({
        a: "\u000000",
        b: "\u000020",
        c: "\u000041",
        d: "\u000061",
        e: "\u00007f",
      });
    });
  });

  describe("complex nested structures", () => {
    it("should fix corruption in nested objects", () => {
      const result = parseToolArguments(
        '{"user":{"name":"Fran\\u0000e7ois","city":"Gen\\u0000e8ve"},"count":5}',
        "test"
      );
      expect(result).toEqual({
        user: { name: "François", city: "Genève" },
        count: 5,
      });
    });

    it("should fix corruption in arrays", () => {
      const result = parseToolArguments(
        '{"items":["caf\\u0000e9","th\\u0000e9","cr\\u0000eape"]}',
        "test"
      );
      expect(result).toEqual({ items: ["café", "thé", "crêpe"] });
    });

    it("should preserve types while fixing corruption", () => {
      const result = parseToolArguments(
        '{"text":"g\\u0000e9n\\u0000e9rative","count":42,"active":true,"ratio":3.14,"empty":null}',
        "test"
      );
      expect(result).toEqual({
        text: "générative",
        count: 42,
        active: true,
        ratio: 3.14,
        empty: null,
      });
    });
  });

  describe("edge cases", () => {
    it("should handle corruption at start and end of string", () => {
      const result = parseToolArguments(
        '{"text":"\\u0000e9start middle end\\u0000e0"}',
        "test"
      );
      expect(result).toEqual({ text: "éstart middle endà" });
    });

    it("should handle very long strings with multiple corruptions", () => {
      const longText =
        "L\\u0000e9ducation nationale fran\\u0000e7aise est tr\\u0000e8s pr\\u0000e9cise sur la qualit\\u0000e9 de l\\u0000e9ducation \\u0000e0 fournir. Les \\u0000e9l\\u0000e8ves doivent \\u0000eatre bien pr\\u0000e9par\\u0000e9s.";
      const result = parseToolArguments(`{"text":"${longText}"}`, "test");
      expect(result).toEqual({
        text: "Léducation nationale française est très précise sur la qualité de léducation à fournir. Les élèves doivent être bien préparés.",
      });
    });
  });
});
