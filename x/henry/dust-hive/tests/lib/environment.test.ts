import { describe, expect, it } from "bun:test";
import {
  detectEnvironmentFromMetadata,
  type EnvironmentMetadata,
  getEnvironmentWorktreeDir,
  isEnvironmentMetadata,
  validateEnvName,
} from "../../src/lib/environment";

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

    it("rejects names longer than 26 characters", () => {
      const longName = "a".repeat(27);
      const result = validateEnvName(longName);
      expect(result.valid).toBe(false);
    });

    it("accepts names exactly 26 characters", () => {
      const maxName = "a".repeat(26);
      expect(validateEnvName(maxName).valid).toBe(true);
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

    it("allows externally owned worktree metadata", () => {
      const adoptedMetadata: EnvironmentMetadata = {
        ...validMetadata,
        worktreeOwner: "external",
        worktreePath: "/path/to/repo/.hives/external/tool/workspaces/project/city",
      };

      expect(isEnvironmentMetadata(adoptedMetadata)).toBe(true);
    });

    it("rejects invalid worktree owners", () => {
      const invalid = { ...validMetadata, worktreeOwner: "launcher" };

      expect(isEnvironmentMetadata(invalid)).toBe(false);
    });
  });

  describe("getEnvironmentWorktreeDir", () => {
    it("returns the default Hive worktree path when metadata has no explicit path", () => {
      const metadata: EnvironmentMetadata = {
        name: "test",
        baseBranch: "main",
        workspaceBranch: "test",
        createdAt: "2024-01-01T00:00:00Z",
        repoRoot: "/path/to/repo",
      };

      expect(getEnvironmentWorktreeDir(metadata)).toBe("/path/to/repo/.hives/test");
    });

    it("returns the explicit worktree path for adopted environments", () => {
      const metadata: EnvironmentMetadata = {
        name: "port-louis",
        baseBranch: "main",
        workspaceBranch: "fontanierh/port-louis",
        createdAt: "2024-01-01T00:00:00Z",
        repoRoot: "/path/to/repo",
        worktreePath: "/path/to/repo/.hives/external/tool/workspaces/project/port-louis",
        worktreeOwner: "external",
      };

      expect(getEnvironmentWorktreeDir(metadata)).toBe(
        "/path/to/repo/.hives/external/tool/workspaces/project/port-louis"
      );
    });
  });

  describe("detectEnvironmentFromMetadata", () => {
    it("chooses the longest matching registered worktree path", () => {
      const hiveMetadata: EnvironmentMetadata = {
        name: "external",
        baseBranch: "main",
        workspaceBranch: "external",
        createdAt: "2024-01-01T00:00:00Z",
        repoRoot: "/path/to/repo",
      };
      const adoptedMetadata: EnvironmentMetadata = {
        name: "port-louis",
        baseBranch: "main",
        workspaceBranch: "fontanierh/port-louis",
        createdAt: "2024-01-01T00:00:00Z",
        repoRoot: "/path/to/repo",
        worktreePath: "/path/to/repo/.hives/external/tool/workspaces/project/port-louis",
        worktreeOwner: "external",
      };

      expect(
        detectEnvironmentFromMetadata(
          "/path/to/repo/.hives/external/tool/workspaces/project/port-louis/front",
          [hiveMetadata, adoptedMetadata]
        )
      ).toBe("port-louis");
    });

    it("returns null when the cwd is outside registered worktrees", () => {
      const metadata: EnvironmentMetadata = {
        name: "test",
        baseBranch: "main",
        workspaceBranch: "test",
        createdAt: "2024-01-01T00:00:00Z",
        repoRoot: "/path/to/repo",
      };

      expect(detectEnvironmentFromMetadata("/path/to/other/repo", [metadata])).toBe(null);
    });
  });
});
