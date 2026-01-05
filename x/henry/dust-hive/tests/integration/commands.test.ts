/**
 * Integration tests for cool, start, stop, restart commands
 *
 * Tests command behavior and state transitions.
 * Requires Docker for full tests.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
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

import { stopDocker } from "../../src/lib/docker";
import {
  type EnvironmentMetadata,
  createEnvironment,
  getEnvironment,
} from "../../src/lib/environment";
import { DUST_HIVE_ENVS } from "../../src/lib/paths";
import { calculatePorts, savePortAllocation } from "../../src/lib/ports";
import {
  isServiceRunning,
  readPid,
  spawnDaemon,
  stopAllServices,
  stopService,
} from "../../src/lib/process";
import { ALL_SERVICES } from "../../src/lib/services";
import { getStateInfo } from "../../src/lib/state";

// Check Docker availability before running tests
beforeAll(async () => {
  await requireDocker();
});

describe("commands integration", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("cmd");
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

    const env = await getEnvironment(ctx.envName);
    if (!env) {
      throw new Error("Environment should exist");
    }

    return { env, ports };
  }

  describe("stop command behavior", () => {
    it("stops all services including SDK", async () => {
      await setupTestEnvironment();

      // Start SDK and another service
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdkPid);

      const frontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(frontPid);

      // Verify running
      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(true);
      expect(await isServiceRunning(ctx.envName, "front")).toBe(true);

      // Stop all services (simulates stopCommand behavior)
      await stopAllServices(ctx.envName);
      untrackPid(sdkPid);
      untrackPid(frontPid);

      // Verify stopped
      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(false);
      expect(await isServiceRunning(ctx.envName, "front")).toBe(false);

      // Verify stopped state
      const env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      const stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");
    });

    it("is idempotent when already stopped", async () => {
      const { env } = await setupTestEnvironment();

      // Verify already stopped
      let stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");

      // Stop again should not error
      await stopAllServices(ctx.envName);

      // Still stopped
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");
    });
  });

  describe("start command behavior", () => {
    it("starts SDK from stopped state", async () => {
      await setupTestEnvironment();

      // Verify stopped initially
      let env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      let stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");

      // Start SDK (simulates startCommand behavior)
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdkPid);

      // Verify cold state (SDK running)
      env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");
      expect(stateInfo.sdkRunning).toBe(true);

      // Cleanup
      try {
        process.kill(sdkPid, "SIGKILL");
      } catch {}
      untrackPid(sdkPid);
    });

    it("is idempotent when SDK already running", async () => {
      await setupTestEnvironment();

      // Start SDK
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdkPid);

      // Verify cold
      const env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      let stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");

      // Check if SDK running (startCommand would check this)
      const sdkRunning = await isServiceRunning(ctx.envName, "sdk");
      expect(sdkRunning).toBe(true);

      // Still cold
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");

      // Cleanup
      try {
        process.kill(sdkPid, "SIGKILL");
      } catch {}
      untrackPid(sdkPid);
    });
  });

  describe("cool command behavior", () => {
    it("stops services but keeps SDK running", async () => {
      await setupTestEnvironment();

      // Start SDK and front service
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdkPid);

      const frontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(frontPid);

      // Verify both running
      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(true);
      expect(await isServiceRunning(ctx.envName, "front")).toBe(true);

      // Cool: stop all services except SDK (simulates coolCommand behavior)
      for (const service of ALL_SERVICES.filter((s) => s !== "sdk")) {
        await stopService(ctx.envName, service);
      }
      untrackPid(frontPid);

      // Verify SDK still running, front stopped
      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(true);
      expect(await isServiceRunning(ctx.envName, "front")).toBe(false);

      // Verify cold state
      const env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      const stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");

      // Cleanup
      try {
        process.kill(sdkPid, "SIGKILL");
      } catch {}
      untrackPid(sdkPid);
    });

    it("stops Docker containers", async () => {
      await setupTestEnvironment();

      // Stopping Docker should return true/false without error
      const stopped = await stopDocker(ctx.envName);
      // Even if no containers running, should not throw
      expect(typeof stopped).toBe("boolean");
    });
  });

  describe("restart command behavior", () => {
    it("restarts a specific service", async () => {
      await setupTestEnvironment();

      // Start front service
      const frontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(frontPid);

      // Verify running
      expect(await isServiceRunning(ctx.envName, "front")).toBe(true);

      // Get original PID
      const originalPid = await readPid(ctx.envName, "front");
      expect(originalPid).toBe(frontPid);

      // Restart: stop then start (simulates restartCommand behavior)
      await stopService(ctx.envName, "front");
      untrackPid(frontPid);

      // Verify stopped briefly
      expect(await isServiceRunning(ctx.envName, "front")).toBe(false);

      // Start again
      const newFrontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(newFrontPid);

      // Verify running with new PID
      expect(await isServiceRunning(ctx.envName, "front")).toBe(true);
      const newPid = await readPid(ctx.envName, "front");
      expect(newPid).toBe(newFrontPid);
      expect(newPid).not.toBe(originalPid);

      // Cleanup
      try {
        process.kill(newFrontPid, "SIGKILL");
      } catch {}
      untrackPid(newFrontPid);
    });

    it("handles restart when service not running", async () => {
      await setupTestEnvironment();

      // Service not running
      expect(await isServiceRunning(ctx.envName, "front")).toBe(false);

      // Stop should return false (not running)
      const stopped = await stopService(ctx.envName, "front");
      expect(stopped).toBe(false);

      // Can still start it
      const frontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(frontPid);

      expect(await isServiceRunning(ctx.envName, "front")).toBe(true);

      // Cleanup
      try {
        process.kill(frontPid, "SIGKILL");
      } catch {}
      untrackPid(frontPid);
    });
  });

  describe("service name validation", () => {
    it("validates known service names", () => {
      const validServices = ["sdk", "front", "core", "oauth", "connectors", "front-workers"];
      for (const service of validServices) {
        expect(ALL_SERVICES.includes(service as (typeof ALL_SERVICES)[number])).toBe(true);
      }
    });

    it("rejects unknown service names", () => {
      const invalidServices = ["invalid", "unknown", "backend", "api"];
      for (const service of invalidServices) {
        expect(ALL_SERVICES.includes(service as (typeof ALL_SERVICES)[number])).toBe(false);
      }
    });
  });

  describe("state transitions", () => {
    it("stopped -> cold -> stopped cycle", async () => {
      await setupTestEnvironment();

      // Initially stopped
      let env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      expect((await getStateInfo(env)).state).toBe("stopped");

      // Start SDK -> cold
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdkPid);

      env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      expect((await getStateInfo(env)).state).toBe("cold");

      // Stop SDK -> stopped
      await stopService(ctx.envName, "sdk");
      untrackPid(sdkPid);

      env = await getEnvironment(ctx.envName);
      if (!env) throw new Error("Environment should exist");
      expect((await getStateInfo(env)).state).toBe("stopped");
    });
  });
});
