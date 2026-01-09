import { describe, expect, it } from "bun:test";
import {
  type EnvironmentMetadata,
  getEnvSlug,
  isEnvironmentMetadata,
  validateEnvName,
} from "../../src/lib/environment";

describe("environment", () => {
  describe("getEnvSlug", () => {
    it("returns name unchanged when no slashes", () => {
      expect(getEnvSlug("test")).toBe("test");
      expect(getEnvSlug("my-feature")).toBe("my-feature");
    });

    it("replaces slashes with hyphens", () => {
      expect(getEnvSlug("feature/auth")).toBe("feature-auth");
      expect(getEnvSlug("fix/bug-123")).toBe("fix-bug-123");
      expect(getEnvSlug("a/b/c")).toBe("a-b-c");
    });
  });

  describe("validateEnvName", () => {
    it("accepts valid names", () => {
      expect(validateEnvName("test")).toEqual({ valid: true });
      expect(validateEnvName("my-feature")).toEqual({ valid: true });
      expect(validateEnvName("feature123")).toEqual({ valid: true });
      expect(validateEnvName("a")).toEqual({ valid: true });
      expect(validateEnvName("feature/auth")).toEqual({ valid: true });
      expect(validateEnvName("fix/bug-123")).toEqual({ valid: true });
      expect(validateEnvName("a/b/c")).toEqual({ valid: true });
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

    it("rejects names with special characters (except slashes and hyphens)", () => {
      expect(validateEnvName("test_feature").valid).toBe(false);
      expect(validateEnvName("test.feature").valid).toBe(false);
      expect(validateEnvName("test@feature").valid).toBe(false);
    });

    it("rejects names with consecutive slashes", () => {
      expect(validateEnvName("test//feature").valid).toBe(false);
      expect(validateEnvName("a//b//c").valid).toBe(false);
    });

    it("rejects names ending with a slash", () => {
      expect(validateEnvName("test/").valid).toBe(false);
      expect(validateEnvName("feature/auth/").valid).toBe(false);
    });

    it("rejects names where slug is longer than 26 characters", () => {
      const longName = "a".repeat(27);
      const result = validateEnvName(longName);
      expect(result.valid).toBe(false);
    });

    it("accepts names where slug is exactly 26 characters", () => {
      const maxName = "a".repeat(26);
      expect(validateEnvName(maxName).valid).toBe(true);
    });

    it("checks slug length not original length for names with slashes", () => {
      // "feature/a" has slug "feature-a" (9 chars) - should be valid
      expect(validateEnvName("feature/a").valid).toBe(true);
      // A name with slashes that produces a 26-char slug should be valid
      expect(validateEnvName(`${"a".repeat(13)}/${"b".repeat(12)}`).valid).toBe(true);
      // A name with slashes that produces a 27-char slug should be invalid
      expect(validateEnvName(`${"a".repeat(13)}/${"b".repeat(13)}`).valid).toBe(false);
    });
  });

  describe("isEnvironmentMetadata", () => {
    const validMetadata: EnvironmentMetadata = {
      name: "test",
      baseBranch: "main",
      workspaceBranch: "test-workspace",
      createdAt: "2024-01-01T00:00:00Z",
      repoRoot: "/path/to/repo",
    };

    it("returns true for valid metadata", () => {
      expect(isEnvironmentMetadata(validMetadata)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isEnvironmentMetadata(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isEnvironmentMetadata(undefined)).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isEnvironmentMetadata(42)).toBe(false);
      expect(isEnvironmentMetadata("string")).toBe(false);
      expect(isEnvironmentMetadata(true)).toBe(false);
    });

    it("returns false when name is missing", () => {
      const { name, ...rest } = validMetadata;
      expect(isEnvironmentMetadata(rest)).toBe(false);
    });

    it("returns false when name is number instead of string", () => {
      const invalid = { ...validMetadata, name: 123 };
      expect(isEnvironmentMetadata(invalid)).toBe(false);
    });

    it("returns false when baseBranch is missing", () => {
      const { baseBranch, ...rest } = validMetadata;
      expect(isEnvironmentMetadata(rest)).toBe(false);
    });

    it("returns false when workspaceBranch is missing", () => {
      const { workspaceBranch, ...rest } = validMetadata;
      expect(isEnvironmentMetadata(rest)).toBe(false);
    });

    it("returns false when createdAt is missing", () => {
      const { createdAt, ...rest } = validMetadata;
      expect(isEnvironmentMetadata(rest)).toBe(false);
    });

    it("returns false when repoRoot is missing", () => {
      const { repoRoot, ...rest } = validMetadata;
      expect(isEnvironmentMetadata(rest)).toBe(false);
    });

    it("allows extra properties", () => {
      const extended = { ...validMetadata, extraField: "value" };
      expect(isEnvironmentMetadata(extended)).toBe(true);
    });
  });
});
