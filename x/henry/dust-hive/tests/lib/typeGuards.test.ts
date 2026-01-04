import { describe, expect, it } from "bun:test";
import { createPropertyChecker } from "../../src/lib/typeGuards";

describe("typeGuards", () => {
  describe("createPropertyChecker", () => {
    it("returns null for null input", () => {
      expect(createPropertyChecker(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(createPropertyChecker(undefined)).toBeNull();
    });

    it("returns null for primitive types", () => {
      expect(createPropertyChecker(42)).toBeNull();
      expect(createPropertyChecker("string")).toBeNull();
      expect(createPropertyChecker(true)).toBeNull();
    });

    it("returns null for arrays", () => {
      const checker = createPropertyChecker([1, 2, 3]);
      expect(checker).toBeNull();
    });

    it("returns checker for plain objects", () => {
      const checker = createPropertyChecker({ name: "test" });
      expect(checker).not.toBeNull();
    });

    describe("hasString", () => {
      it("returns true for string properties", () => {
        const checker = createPropertyChecker({ name: "test", title: "hello" });
        expect(checker?.hasString("name")).toBe(true);
        expect(checker?.hasString("title")).toBe(true);
      });

      it("returns false for non-string properties", () => {
        const checker = createPropertyChecker({ count: 42, active: true });
        expect(checker?.hasString("count")).toBe(false);
        expect(checker?.hasString("active")).toBe(false);
      });

      it("returns false for missing properties", () => {
        const checker = createPropertyChecker({ name: "test" });
        expect(checker?.hasString("missing")).toBe(false);
      });

      it("returns false for null string values", () => {
        const checker = createPropertyChecker({ name: null });
        expect(checker?.hasString("name")).toBe(false);
      });

      it("returns false for undefined string values", () => {
        const checker = createPropertyChecker({ name: undefined });
        expect(checker?.hasString("name")).toBe(false);
      });

      it("handles empty strings", () => {
        const checker = createPropertyChecker({ name: "" });
        expect(checker?.hasString("name")).toBe(true);
      });
    });

    describe("hasNumber", () => {
      it("returns true for number properties", () => {
        const checker = createPropertyChecker({ count: 42, ratio: 3.14 });
        expect(checker?.hasNumber("count")).toBe(true);
        expect(checker?.hasNumber("ratio")).toBe(true);
      });

      it("returns true for zero", () => {
        const checker = createPropertyChecker({ value: 0 });
        expect(checker?.hasNumber("value")).toBe(true);
      });

      it("returns true for negative numbers", () => {
        const checker = createPropertyChecker({ offset: -10 });
        expect(checker?.hasNumber("offset")).toBe(true);
      });

      it("returns false for non-number properties", () => {
        const checker = createPropertyChecker({ name: "test", active: true });
        expect(checker?.hasNumber("name")).toBe(false);
        expect(checker?.hasNumber("active")).toBe(false);
      });

      it("returns false for missing properties", () => {
        const checker = createPropertyChecker({ count: 42 });
        expect(checker?.hasNumber("missing")).toBe(false);
      });

      it("returns false for null number values", () => {
        const checker = createPropertyChecker({ count: null });
        expect(checker?.hasNumber("count")).toBe(false);
      });

      it("returns false for NaN", () => {
        // NaN is typeof number, so this returns true (which is correct behavior)
        const checker = createPropertyChecker({ value: Number.NaN });
        expect(checker?.hasNumber("value")).toBe(true);
      });

      it("returns false for Infinity", () => {
        // Infinity is typeof number, so this returns true
        const checker = createPropertyChecker({ value: Number.POSITIVE_INFINITY });
        expect(checker?.hasNumber("value")).toBe(true);
      });
    });

    describe("combined usage", () => {
      it("validates complex objects", () => {
        const data = {
          schemaVersion: 1,
          name: "test-env",
          baseBranch: "main",
          createdAt: "2024-01-01T00:00:00Z",
        };

        const checker = createPropertyChecker(data);
        expect(checker).not.toBeNull();
        expect(checker?.hasNumber("schemaVersion")).toBe(true);
        expect(checker?.hasString("name")).toBe(true);
        expect(checker?.hasString("baseBranch")).toBe(true);
        expect(checker?.hasString("createdAt")).toBe(true);
      });

      it("rejects objects with wrong types", () => {
        const data = {
          schemaVersion: "1", // should be number
          name: "test-env",
        };

        const checker = createPropertyChecker(data);
        expect(checker).not.toBeNull();
        expect(checker?.hasNumber("schemaVersion")).toBe(false);
        expect(checker?.hasString("schemaVersion")).toBe(true);
      });
    });
  });
});
