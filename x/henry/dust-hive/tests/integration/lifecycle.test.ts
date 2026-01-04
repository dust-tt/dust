/**
 * Integration tests for environment lifecycle
 *
 * Tests state transitions and command workflows.
 * Requires Docker.
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

import { writeDockerComposeOverride } from "../../src/lib/docker";
import { generateEnvSh } from "../../src/lib/envgen";
// Import modules for testing
import {
  type EnvironmentMetadata,
  createEnvironment,
  getEnvironment,
  markInitialized,
} from "../../src/lib/environment";
import { DUST_HIVE_ENVS, getEnvDir, getEnvFilePath } from "../../src/lib/paths";
import { calculatePorts, savePortAllocation } from "../../src/lib/ports";
import {
  isServiceRunning,
  readPid,
  spawnDaemon,
  stopAllServices,
  stopService,
} from "../../src/lib/process";
import { determineState, getStateInfo } from "../../src/lib/state";

// Check Docker availability before running tests
beforeAll(async () => {
  await requireDocker();
});

describe("lifecycle integration", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("life");
    repoPath = join(ctx.tempDir, "repo");
    await createTestGitRepo(repoPath);
    await mkdir(DUST_HIVE_ENVS, { recursive: true });
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  describe("environment creation", () => {
    it("creates all expected artifacts", async () => {
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

      // Create environment
      await createEnvironment(metadata);
      await savePortAllocation(ctx.envName, ports);

      // Generate env.sh
      const envSh = generateEnvSh(ctx.envName, ports);
      await Bun.write(getEnvFilePath(ctx.envName), envSh);

      // Write docker-compose override
      await writeDockerComposeOverride(ctx.envName, ports);

      // Verify all files exist
      const envDir = getEnvDir(ctx.envName);
      expect(await Bun.file(join(envDir, "metadata.json")).exists()).toBe(true);
      expect(await Bun.file(join(envDir, "ports.json")).exists()).toBe(true);
      expect(await Bun.file(join(envDir, "env.sh")).exists()).toBe(true);
      expect(await Bun.file(join(envDir, "docker-compose.override.yml")).exists()).toBe(true);

      // Verify environment loads correctly
      const env = await getEnvironment(ctx.envName);
      expect(env).not.toBeNull();
      expect(env?.name).toBe(ctx.envName);
      expect(env?.ports.base).toBe(portBase);
    });
  });

  describe("state detection", () => {
    it("detects stopped state correctly", async () => {
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

      const stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");
      expect(stateInfo.sdkRunning).toBe(false);
      expect(stateInfo.dockerRunning).toBe(false);
      expect(stateInfo.appServicesRunning).toBe(false);
    });

    it("detects cold state when only SDK running", async () => {
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
        const pid = await readPid(ctx.envName, "sdk");
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {}
        }
        await cleanupTestEnvironment(ctx.envName);
      });

      await createEnvironment(metadata);
      await savePortAllocation(ctx.envName, ports);

      // Start SDK (simulated with sleep)
      const pid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(pid);

      const env = await getEnvironment(ctx.envName);
      if (!env) {
        throw new Error("Environment should exist");
      }

      const stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");
      expect(stateInfo.sdkRunning).toBe(true);
      expect(stateInfo.dockerRunning).toBe(false);
      expect(stateInfo.appServicesRunning).toBe(false);

      // Clean up
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      untrackPid(pid);
    });
  });

  describe("state transitions", () => {
    it("stopped -> cold: starting SDK", async () => {
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

      // Verify stopped
      let stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");

      // Start SDK
      const pid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(pid);

      // Verify cold
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");

      // Clean up
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      untrackPid(pid);
    });

    it("cold -> stopped: stopping SDK", async () => {
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

      // Start SDK
      const pid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(pid);

      const env = await getEnvironment(ctx.envName);
      if (!env) {
        throw new Error("Environment should exist");
      }

      // Verify cold
      let stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");

      // Stop SDK
      await stopService(ctx.envName, "sdk");
      untrackPid(pid);

      // Verify stopped
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");
    });
  });

  describe("stopAllServices", () => {
    it("stops all running services", async () => {
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

      // Start multiple services
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

      // Stop all
      await stopAllServices(ctx.envName);
      untrackPid(sdkPid);
      untrackPid(frontPid);

      // Verify stopped
      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(false);
      expect(await isServiceRunning(ctx.envName, "front")).toBe(false);
    });
  });

  describe("initialization marker", () => {
    it("tracks initialized state", async () => {
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

      // Initially not initialized
      let env = await getEnvironment(ctx.envName);
      expect(env).not.toBeNull();
      expect(env?.initialized).toBe(false);

      // Mark initialized
      await markInitialized(ctx.envName);

      // Now initialized
      env = await getEnvironment(ctx.envName);
      expect(env?.initialized).toBe(true);
    });
  });

  describe("determineState", () => {
    it("returns stopped when nothing running", () => {
      expect(determineState(false, false, false)).toBe("stopped");
    });

    it("returns cold when only SDK running", () => {
      expect(determineState(true, false, false)).toBe("cold");
    });

    it("returns warm when all running", () => {
      expect(determineState(true, true, true)).toBe("warm");
    });

    it("returns warm when docker or app services running (inconsistent)", () => {
      // Docker running, no SDK, no app services
      expect(determineState(false, true, false)).toBe("warm");
      // App services running, no SDK, no docker
      expect(determineState(false, false, true)).toBe("warm");
    });
  });
});
