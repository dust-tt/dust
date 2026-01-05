import { describe, expect, it } from "vitest";

import { validateSeedConfig } from "./seed_dev_user";

describe("seed_dev_user", () => {
  describe("validateSeedConfig", () => {
    it("returns true for valid config with all required fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(true);
    });

    it("returns true for valid config with optional fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
        lastName: "User",
        sId: "custom-sid",
        username: "testuser",
        workOSUserId: "workos-123",
        provider: "google",
        providerId: "google-123",
        imageUrl: "https://example.com/image.png",
      };
      expect(validateSeedConfig(config)).toBe(true);
    });

    it("returns false for null", () => {
      expect(validateSeedConfig(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(validateSeedConfig(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(validateSeedConfig("string")).toBe(false);
      expect(validateSeedConfig(123)).toBe(false);
      expect(validateSeedConfig(true)).toBe(false);
    });

    it("returns false when email is missing", () => {
      const config = {
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when name is missing", () => {
      const config = {
        email: "test@example.com",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when firstName is missing", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when workspaceName is missing", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when email is not a string", () => {
      const config = {
        email: 123,
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns false when name is not a string", () => {
      const config = {
        email: "test@example.com",
        name: { first: "Test" },
        firstName: "Test",
        workspaceName: "Test Workspace",
      };
      expect(validateSeedConfig(config)).toBe(false);
    });

    it("returns true with null optional fields", () => {
      const config = {
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        workspaceName: "Test Workspace",
        lastName: null,
        workOSUserId: null,
      };
      expect(validateSeedConfig(config)).toBe(true);
    });
  });
});
