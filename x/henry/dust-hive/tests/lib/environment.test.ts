import { describe, expect, it } from "bun:test";
import { validateEnvName } from "../../src/lib/environment";

describe("environment", () => {
  describe("validateEnvName", () => {
    it("accepts valid names", () => {
      expect(validateEnvName("test")).toEqual({ valid: true });
      expect(validateEnvName("my-feature")).toEqual({ valid: true });
      expect(validateEnvName("feature123")).toEqual({ valid: true });
      expect(validateEnvName("a")).toEqual({ valid: true });
    });

    it("rejects empty names", () => {
      const result = validateEnvName("");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects names starting with numbers", () => {
      const result = validateEnvName("123test");
      expect(result.valid).toBe(false);
    });

    it("rejects names starting with hyphens", () => {
      const result = validateEnvName("-test");
      expect(result.valid).toBe(false);
    });

    it("rejects names with uppercase letters", () => {
      const result = validateEnvName("Test");
      expect(result.valid).toBe(false);
    });

    it("rejects names with special characters", () => {
      expect(validateEnvName("test_feature").valid).toBe(false);
      expect(validateEnvName("test.feature").valid).toBe(false);
      expect(validateEnvName("test/feature").valid).toBe(false);
    });

    it("rejects names longer than 32 characters", () => {
      const longName = "a".repeat(33);
      const result = validateEnvName(longName);
      expect(result.valid).toBe(false);
    });

    it("accepts names exactly 32 characters", () => {
      const maxName = "a".repeat(32);
      expect(validateEnvName(maxName).valid).toBe(true);
    });
  });
});
