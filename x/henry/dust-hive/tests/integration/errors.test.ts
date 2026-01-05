/**
 * Integration tests for error scenarios
 *
 * Tests error handling, recovery, and edge cases.
 * Requires Docker for full tests.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTestEnvironment,
  registerCleanup,
  runAllCleanups,
  trackPid,
  untrackPid,
} from "./cleanup";
import {
  type TestContext,
  createTestContext,
  createTestGitRepo,
  getTestPortBase,
  requireDocker,
} from "./setup";

import {
  type EnvironmentMetadata,
  createEnvironment,
  deleteEnvironmentDir,
  getEnvironment,
  listEnvironments,
  loadMetadata,
} from "../../src/lib/environment";
import { DUST_HIVE_ENVS, getEnvDir, getMetadataPath, getPidPath } from "../../src/lib/paths";
import { calculatePorts, savePortAllocation } from "../../src/lib/ports";
import { isServiceRunning, readPid, spawnDaemon, stopService } from "../../src/lib/process";
import { getStateInfo } from "../../src/lib/state";

// Check Docker availability before running tests
beforeAll(async () => {
  await requireDocker();
});

describe("error scenarios", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("err");
    repoPath = join(ctx.tempDir, "repo");
    await createTestGitRepo(repoPath);
    await mkdir(DUST_HIVE_ENVS, { recursive: true });
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  // Helper to create a test environment
  async function setupTestEnvironment() {
    const portBase = getTestPortBase();
    const ports = calculatePorts(portBase);

    const metadata: EnvironmentMetadata = {
      name: ctx.envName,
      baseBranch: "main",
      workspaceBranch: `${ctx.envName}-workspace`,
      createdAt: new Date().toISOString(),
      repoRoot: repoPath,
    };

    registerCleanup(async () => {
      await cleanupTestEnvironment(ctx.envName);
    });

    await createEnvironment(metadata);
    await savePortAllocation(ctx.envName, ports);

    return { metadata, ports };
  }

  describe("corrupted metadata", () => {
    it("handles corrupted metadata.json by throwing SyntaxError", async () => {
      await setupTestEnvironment();

      // Verify environment exists
      const env = await getEnvironment(ctx.envName);
      expect(env).not.toBeNull();

      // Corrupt the metadata file
      const metadataPath = getMetadataPath(ctx.envName);
      await writeFile(metadataPath, "{ invalid json");

      // loadMetadata throws SyntaxError for invalid JSON
      // (this is current behavior - could be improved to return null)
      await expect(loadMetadata(ctx.envName)).rejects.toThrow(SyntaxError);
    });

    it("handles missing metadata fields", async () => {
      await setupTestEnvironment();

      // Write metadata with missing required fields
      const metadataPath = getMetadataPath(ctx.envName);
      await writeFile(metadataPath, JSON.stringify({ name: ctx.envName }));

      // loadMetadata should return null for incomplete metadata
      const metadata = await loadMetadata(ctx.envName);
      expect(metadata).toBeNull();
    });
  });

  describe("stale PID files", () => {
    it("handles stale PID file (process not running)", async () => {
      await setupTestEnvironment();

      // Write a stale PID file with a non-existent PID
      const pidPath = getPidPath(ctx.envName, "sdk");
      await mkdir(getEnvDir(ctx.envName), { recursive: true });
      await writeFile(pidPath, "999999"); // Very unlikely to be a real PID

      // isServiceRunning should return false for stale PID
      const running = await isServiceRunning(ctx.envName, "sdk");
      expect(running).toBe(false);

      // readPid should return null for stale PID (or clean up)
      const pid = await readPid(ctx.envName, "sdk");
      expect(pid).toBeNull();
    });

    it("handles invalid PID in PID file", async () => {
      await setupTestEnvironment();

      // Write invalid content to PID file
      const pidPath = getPidPath(ctx.envName, "sdk");
      await mkdir(getEnvDir(ctx.envName), { recursive: true });
      await writeFile(pidPath, "not-a-number");

      // isServiceRunning should handle gracefully
      const running = await isServiceRunning(ctx.envName, "sdk");
      expect(running).toBe(false);

      // readPid should return null for invalid PID
      const pid = await readPid(ctx.envName, "sdk");
      expect(pid).toBeNull();
    });

    it("handles empty PID file", async () => {
      await setupTestEnvironment();

      // Write empty PID file
      const pidPath = getPidPath(ctx.envName, "sdk");
      await mkdir(getEnvDir(ctx.envName), { recursive: true });
      await writeFile(pidPath, "");

      // Should handle gracefully
      const running = await isServiceRunning(ctx.envName, "sdk");
      expect(running).toBe(false);
    });
  });

  describe("missing environment directory", () => {
    it("handles missing worktree directory", async () => {
      await setupTestEnvironment();

      // Environment exists
      let env = await getEnvironment(ctx.envName);
      expect(env).not.toBeNull();

      // Remove the env directory
      await deleteEnvironmentDir(ctx.envName);

      // getEnvironment should now return null
      env = await getEnvironment(ctx.envName);
      expect(env).toBeNull();

      // listEnvironments should not include it
      const envs = await listEnvironments();
      expect(envs).not.toContain(ctx.envName);
    });
  });

  describe("service cleanup on error", () => {
    it("stopService handles already-stopped service", async () => {
      await setupTestEnvironment();

      // Service not running
      expect(await isServiceRunning(ctx.envName, "front")).toBe(false);

      // stopService should return false (not an error)
      const stopped = await stopService(ctx.envName, "front");
      expect(stopped).toBe(false);

      // Still not running
      expect(await isServiceRunning(ctx.envName, "front")).toBe(false);
    });

    it("stopService handles missing PID file", async () => {
      await setupTestEnvironment();

      // No PID file exists
      const pid = await readPid(ctx.envName, "front");
      expect(pid).toBeNull();

      // stopService should handle gracefully
      const stopped = await stopService(ctx.envName, "front");
      expect(stopped).toBe(false);
    });
  });

  describe("state detection with inconsistencies", () => {
    it("detects SDK running but process actually dead", async () => {
      await setupTestEnvironment();

      // Start SDK
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdkPid);

      // Verify running
      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(true);

      // Kill the process directly (simulating crash)
      try {
        process.kill(sdkPid, "SIGKILL");
      } catch {}
      untrackPid(sdkPid);

      // Wait a moment for process to die
      await new Promise((resolve) => setTimeout(resolve, 100));

      // isServiceRunning should detect it's not running (despite PID file)
      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(false);

      // State should be stopped
      const env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      const stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");
    });
  });

  describe("destroy with force", () => {
    it("cleans up despite running services", async () => {
      await setupTestEnvironment();

      // Start a service
      const frontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(frontPid);

      // Verify running
      expect(await isServiceRunning(ctx.envName, "front")).toBe(true);

      // Force cleanup should stop services and remove everything
      await stopService(ctx.envName, "front");
      untrackPid(frontPid);

      // Wait for process to stop
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Delete environment
      await deleteEnvironmentDir(ctx.envName);

      // Verify gone
      const env = await getEnvironment(ctx.envName);
      expect(env).toBeNull();
    });
  });

  describe("environment listing edge cases", () => {
    it("handles empty environments directory", async () => {
      // Ensure envs directory exists but is empty
      await mkdir(DUST_HIVE_ENVS, { recursive: true });

      // Should return empty array
      const envs = await listEnvironments();
      expect(Array.isArray(envs)).toBe(true);
      // May have envs from other tests, but should not error
    });

    it("handles non-environment directories in envs folder", async () => {
      // Create a non-environment directory
      const nonEnvDir = join(DUST_HIVE_ENVS, "not-an-env");
      await mkdir(nonEnvDir, { recursive: true });
      await writeFile(join(nonEnvDir, "random.txt"), "test");

      // listEnvironments should not include it (no metadata.json)
      const envs = await listEnvironments();
      expect(envs).not.toContain("not-an-env");

      // Cleanup
      await rm(nonEnvDir, { recursive: true, force: true });
    });
  });

  describe("port allocation errors", () => {
    it("handles missing ports.json", async () => {
      getTestPortBase(); // Reserve a port base but don't use it
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: repoPath,
      };

      registerCleanup(async () => {
        await cleanupTestEnvironment(ctx.envName);
      });

      // Create environment without saving ports
      await createEnvironment(metadata);
      // Don't call savePortAllocation

      // getEnvironment should return null (no ports)
      const env = await getEnvironment(ctx.envName);
      expect(env).toBeNull();
    });
  });

  describe("concurrent operations", () => {
    it("handles rapid start/stop cycles", async () => {
      await setupTestEnvironment();

      // Rapid start/stop cycles
      for (let i = 0; i < 3; i++) {
        // Start
        const pid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
          cwd: ctx.tempDir,
        });
        trackPid(pid);

        expect(await isServiceRunning(ctx.envName, "sdk")).toBe(true);

        // Stop
        await stopService(ctx.envName, "sdk");
        untrackPid(pid);

        // Small delay for cleanup
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(await isServiceRunning(ctx.envName, "sdk")).toBe(false);
      }
    });
  });
});
