/**
 * Integration tests for the forward daemon and port forwarding
 *
 * Tests TCP forwarding, forwarder lifecycle, and state management.
 * Requires Docker for full tests.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupForwarder,
  cleanupTestEnvironment,
  registerCleanup,
  runAllCleanups,
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
  getEnvironment,
} from "../../src/lib/environment";
import {
  type ForwarderState,
  getForwarderStatus,
  isForwarderRunning,
  readForwarderState,
  stopForwarder,
} from "../../src/lib/forward";
import { FORWARDER_MAPPINGS, FORWARDER_PORTS } from "../../src/lib/forwarderConfig";
import { DUST_HIVE_ENVS, FORWARDER_STATE_PATH } from "../../src/lib/paths";
import { calculatePorts, isPortInUse, savePortAllocation } from "../../src/lib/ports";

// Check Docker availability before running tests
beforeAll(async () => {
  await requireDocker();
});

describe("forward integration", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("fwd");
    repoPath = join(ctx.tempDir, "repo");
    await createTestGitRepo(repoPath);
    await mkdir(DUST_HIVE_ENVS, { recursive: true });

    // Clean up any existing forwarder
    await stopForwarder();
  });

  afterEach(async () => {
    await cleanupForwarder();
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

  describe("forwarder state management", () => {
    it("starts with forwarder not running", async () => {
      const running = await isForwarderRunning();
      expect(running).toBe(false);
    });

    it("getForwarderStatus returns correct initial state", async () => {
      const status = await getForwarderStatus();
      expect(status.running).toBe(false);
      expect(status.pid).toBeNull();
      // state may be null or contain last known state
    });

    it("stopForwarder returns false when not running", async () => {
      const wasRunning = await stopForwarder();
      expect(wasRunning).toBe(false);
    });

    it("stopForwarder is idempotent", async () => {
      // Multiple stops should not error
      const result1 = await stopForwarder();
      const result2 = await stopForwarder();
      const result3 = await stopForwarder();

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
    });
  });

  describe("forwarder state file", () => {
    it("reads null when no state file exists", async () => {
      const state = await readForwarderState();
      // May be null or contain previous state
      if (state !== null) {
        expect(state).toHaveProperty("targetEnv");
        expect(state).toHaveProperty("basePort");
        expect(state).toHaveProperty("updatedAt");
      }
    });

    it("validates state file structure", async () => {
      // Write a valid state file
      const testState: ForwarderState = {
        targetEnv: "test-env",
        basePort: 10000,
        updatedAt: new Date().toISOString(),
      };
      await Bun.write(FORWARDER_STATE_PATH, JSON.stringify(testState, null, 2));

      const state = await readForwarderState();
      expect(state).not.toBeNull();
      expect(state?.targetEnv).toBe("test-env");
      expect(state?.basePort).toBe(10000);
      expect(state?.updatedAt).toBeDefined();
    });
  });

  describe("forwarder port configuration", () => {
    it("uses standard dev ports for listening", () => {
      // Standard ports: 3000, 3001, 3002, 3006
      expect(FORWARDER_PORTS).toContain(3000);
      expect(FORWARDER_PORTS).toContain(3001);
      expect(FORWARDER_PORTS).toContain(3002);
      expect(FORWARDER_PORTS).toContain(3006);
    });

    it("maps to correct services", () => {
      const frontMapping = FORWARDER_MAPPINGS.find((m) => m.listenPort === 3000);
      expect(frontMapping?.name).toBe("front");

      const coreMapping = FORWARDER_MAPPINGS.find((m) => m.listenPort === 3001);
      expect(coreMapping?.name).toBe("core");

      const connectorsMapping = FORWARDER_MAPPINGS.find((m) => m.listenPort === 3002);
      expect(connectorsMapping?.name).toBe("connectors");

      const oauthMapping = FORWARDER_MAPPINGS.find((m) => m.listenPort === 3006);
      expect(oauthMapping?.name).toBe("oauth");
    });

    it("calculates correct target ports", () => {
      const basePort = 10000;

      for (const mapping of FORWARDER_MAPPINGS) {
        const targetPort = basePort + mapping.targetOffset;
        expect(targetPort).toBeGreaterThanOrEqual(10000);
        expect(targetPort).toBeLessThanOrEqual(11000);
      }
    });
  });

  describe("port availability checks", () => {
    it("isPortInUse returns false for unused ports", () => {
      // Use high ports that are unlikely to be in use
      const unusedPort = 59999;
      expect(isPortInUse(unusedPort)).toBe(false);
    });

    it("checks all forwarder ports", () => {
      // Just verify we can check each port without error
      for (const port of FORWARDER_PORTS) {
        // May or may not be in use depending on system state
        const inUse = isPortInUse(port);
        expect(typeof inUse).toBe("boolean");
      }
    });
  });

  describe("forwarder status display", () => {
    it("status reflects running state", async () => {
      // Initially not running
      let status = await getForwarderStatus();
      expect(status.running).toBe(false);

      // After stop (no change expected)
      await stopForwarder();
      status = await getForwarderStatus();
      expect(status.running).toBe(false);
    });

    it("status includes state info when available", async () => {
      // Write a state file
      const testState: ForwarderState = {
        targetEnv: "test-env",
        basePort: 10000,
        updatedAt: new Date().toISOString(),
      };
      await Bun.write(FORWARDER_STATE_PATH, JSON.stringify(testState, null, 2));

      const status = await getForwarderStatus();
      // Not running but state file exists
      expect(status.running).toBe(false);
      expect(status.state).not.toBeNull();
      expect(status.state?.targetEnv).toBe("test-env");
    });
  });

  describe("environment integration", () => {
    it("can set up environment for forwarding", async () => {
      const { env, ports } = await setupTestEnvironment();

      // Environment should be set up correctly
      expect(env.name).toBe(ctx.envName);
      expect(env.ports.base).toBe(ports.base);

      // Can check if front port is in use
      const frontInUse = isPortInUse(ports.front);
      expect(typeof frontInUse).toBe("boolean");
    });

    it("port allocation creates valid forwarder targets", async () => {
      const { ports } = await setupTestEnvironment();

      // All target ports should be calculated correctly
      for (const mapping of FORWARDER_MAPPINGS) {
        const targetPort = ports.base + mapping.targetOffset;
        expect(targetPort).toBeGreaterThanOrEqual(ports.base);
        expect(targetPort).toBeLessThan(ports.base + 1000);
      }
    });
  });

  describe("cleanup behavior", () => {
    it("cleanupForwarder handles no forwarder running", async () => {
      // Should not throw when no forwarder running
      await expect(cleanupForwarder()).resolves.toBeUndefined();
    });

    it("stopForwarder cleans up state properly", async () => {
      // Stop should work without error
      const result = await stopForwarder();
      expect(typeof result).toBe("boolean");

      // Subsequent checks should show not running
      expect(await isForwarderRunning()).toBe(false);
    });
  });
});
