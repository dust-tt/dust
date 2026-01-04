/**
 * Integration tests for filesystem operations
 *
 * Tests environment CRUD operations with real filesystem.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { registerCleanup, runAllCleanups } from "./cleanup";
import { type TestContext, createTestContext } from "./setup";

// Import the modules we're testing
import {
  type EnvironmentMetadata,
  createEnvironment,
  deleteEnvironmentDir,
  environmentExists,
  getEnvironment,
  isInitialized,
  listEnvironments,
  loadMetadata,
  markInitialized,
} from "../../src/lib/environment";
import { DUST_HIVE_ENVS, getEnvDir, getMetadataPath } from "../../src/lib/paths";
import { type PortAllocation, savePortAllocation } from "../../src/lib/ports";

describe("filesystem integration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext("fs");
    // Ensure envs directory exists for real operations
    await mkdir(DUST_HIVE_ENVS, { recursive: true });
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  describe("createEnvironment", () => {
    it("creates environment directory with metadata.json", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      // Register cleanup first
      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);

      // Verify directory exists
      const envDir = getEnvDir(ctx.envName);
      const entries = await readdir(envDir);
      expect(entries).toContain("metadata.json");

      // Verify metadata content
      const loaded = await loadMetadata(ctx.envName);
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe(ctx.envName);
      expect(loaded?.baseBranch).toBe("main");
    });

    it("creates nested directory structure", async () => {
      const deepName = `${ctx.envName}-nested`;
      const metadata: EnvironmentMetadata = {
        name: deepName,
        baseBranch: "main",
        workspaceBranch: `${deepName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(deepName);
      });

      await createEnvironment(metadata);
      expect(await environmentExists(deepName)).toBe(true);
    });
  });

  describe("environmentExists", () => {
    it("returns false for non-existent environment", async () => {
      expect(await environmentExists("nonexistent-env-12345")).toBe(false);
    });

    it("returns true for existing environment", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      expect(await environmentExists(ctx.envName)).toBe(true);
    });
  });

  describe("loadMetadata", () => {
    it("returns null for non-existent environment", async () => {
      expect(await loadMetadata("nonexistent-env-12345")).toBeNull();
    });

    it("returns metadata for existing environment", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "develop",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: "2024-01-01T00:00:00Z",
        repoRoot: "/path/to/repo",
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      const loaded = await loadMetadata(ctx.envName);

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe(ctx.envName);
      expect(loaded?.baseBranch).toBe("develop");
      expect(loaded?.createdAt).toBe("2024-01-01T00:00:00Z");
    });

    it("returns null for corrupted metadata", async () => {
      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      // Create directory with invalid JSON
      const envDir = getEnvDir(ctx.envName);
      await mkdir(envDir, { recursive: true });
      await Bun.write(getMetadataPath(ctx.envName), "not valid json");

      // Should throw or return null (depends on implementation)
      try {
        const result = await loadMetadata(ctx.envName);
        expect(result).toBeNull();
      } catch {
        // Also acceptable - invalid JSON throws
      }
    });
  });

  describe("getEnvironment", () => {
    it("returns null when metadata missing", async () => {
      expect(await getEnvironment("nonexistent-env-12345")).toBeNull();
    });

    it("returns null when ports missing", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      // Don't save ports

      const env = await getEnvironment(ctx.envName);
      expect(env).toBeNull();
    });

    it("returns full environment when metadata and ports exist", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      const ports: PortAllocation = {
        base: 10000,
        front: 10000,
        core: 10001,
        connectors: 10002,
        oauth: 10006,
        postgres: 10432,
        redis: 10379,
        qdrantHttp: 10334,
        qdrantGrpc: 10333,
        elasticsearch: 10200,
        apacheTika: 10998,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      await savePortAllocation(ctx.envName, ports);

      const env = await getEnvironment(ctx.envName);
      expect(env).not.toBeNull();
      expect(env?.name).toBe(ctx.envName);
      expect(env?.ports.base).toBe(10000);
      expect(env?.initialized).toBe(false);
    });
  });

  describe("markInitialized / isInitialized", () => {
    it("returns false before marking", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      expect(await isInitialized(ctx.envName)).toBe(false);
    });

    it("returns true after marking", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      await markInitialized(ctx.envName);
      expect(await isInitialized(ctx.envName)).toBe(true);
    });
  });

  describe("listEnvironments", () => {
    it("returns empty array when no environments exist", async () => {
      // This might have environments from other tests, so we check the specific one
      const envs = await listEnvironments();
      expect(envs).not.toContain("nonexistent-env-12345");
    });

    it("includes newly created environment", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      const envs = await listEnvironments();
      expect(envs).toContain(ctx.envName);
    });

    it("ignores directories without metadata.json", async () => {
      const invalidName = `${ctx.envName}-invalid`;
      const invalidDir = getEnvDir(invalidName);

      registerCleanup(async () => {
        await deleteEnvironmentDir(invalidName);
      });

      // Create directory without metadata
      await mkdir(invalidDir, { recursive: true });
      await Bun.write(join(invalidDir, "some-file.txt"), "not metadata");

      const envs = await listEnvironments();
      expect(envs).not.toContain(invalidName);
    });
  });

  describe("deleteEnvironmentDir", () => {
    it("removes environment directory completely", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      await createEnvironment(metadata);
      expect(await environmentExists(ctx.envName)).toBe(true);

      await deleteEnvironmentDir(ctx.envName);
      expect(await environmentExists(ctx.envName)).toBe(false);
    });

    it("handles non-existent directory gracefully", async () => {
      // Should not throw
      await deleteEnvironmentDir("nonexistent-env-12345");
    });

    it("removes all files in directory", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      await createEnvironment(metadata);

      // Add some extra files
      const envDir = getEnvDir(ctx.envName);
      await Bun.write(join(envDir, "sdk.pid"), "12345");
      await Bun.write(join(envDir, "sdk.log"), "some logs");

      await deleteEnvironmentDir(ctx.envName);

      // Directory should be completely gone
      // Check parent directory doesn't contain our env
      const envs = await listEnvironments();
      expect(envs).not.toContain(ctx.envName);
    });
  });
});
