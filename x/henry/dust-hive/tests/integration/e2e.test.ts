/**
 * End-to-end integration tests
 *
 * Tests full environment lifecycle with real Docker containers.
 * These are the slowest tests (~60-180s each).
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
  waitFor,
} from "./setup";

import { startDocker, stopDocker, writeDockerComposeOverride } from "../../src/lib/docker";
import { generateEnvSh } from "../../src/lib/envgen";
// Import modules
import {
  type EnvironmentMetadata,
  createEnvironment,
  deleteEnvironmentDir,
  getEnvironment,
  isInitialized,
  listEnvironments,
  markInitialized,
} from "../../src/lib/environment";
import { DUST_HIVE_ENVS, getEnvFilePath } from "../../src/lib/paths";
import { calculatePorts, savePortAllocation } from "../../src/lib/ports";
import { isServiceRunning, spawnDaemon, stopService } from "../../src/lib/process";
import { getStateInfo, isDockerRunning } from "../../src/lib/state";
import {
  createWorktree,
  deleteBranch,
  hasUncommittedChanges,
  removeWorktree,
} from "../../src/lib/worktree";

// Check Docker availability before running tests
beforeAll(async () => {
  await requireDocker();
});

describe("e2e integration", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("e2e");
    repoPath = join(ctx.tempDir, "repo");
    await createTestGitRepo(repoPath);
    await mkdir(DUST_HIVE_ENVS, { recursive: true });
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  describe("full lifecycle", () => {
    it("spawn -> warm -> cool -> warm -> stop -> start -> destroy", async () => {
      const portBase = getTestPortBase();
      const ports = calculatePorts(portBase);
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: branchName,
        createdAt: new Date().toISOString(),
        repoRoot: repoPath,
      };

      // Create docker-compose with all required services
      const dockerComposeBase = `
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      timeout: 5s
      retries: 10
  redis:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 5s
      retries: 10
  qdrant_primary:
    image: qdrant/qdrant:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6334/health"]
      interval: 2s
      timeout: 5s
      retries: 5
  qdrant_secondary:
    image: qdrant/qdrant:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6334/health"]
      interval: 2s
      timeout: 5s
      retries: 5
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.1
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200 || exit 1"]
      interval: 2s
      timeout: 5s
      retries: 10
  apache-tika:
    image: apache/tika:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9998/tika"]
      interval: 2s
      timeout: 5s
      retries: 5
`;
      await mkdir(join(repoPath, "tools"), { recursive: true });
      await Bun.write(join(repoPath, "tools/docker-compose.dust-hive.yml"), dockerComposeBase);

      registerCleanup(async () => {
        await cleanupTestEnvironment(ctx.envName);
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      // === SPAWN PHASE ===
      // Create environment files
      await createEnvironment(metadata);
      await savePortAllocation(ctx.envName, ports);

      // Generate env.sh
      const envSh = generateEnvSh(ctx.envName, ports);
      await Bun.write(getEnvFilePath(ctx.envName), envSh);

      // Write docker-compose override
      await writeDockerComposeOverride(ctx.envName, ports);

      // Create worktree
      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Verify worktree exists
      expect(await Bun.file(join(worktreePath, ".git")).exists()).toBe(true);

      // Start SDK (simulated)
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "300"], {
        cwd: worktreePath,
      });
      trackPid(sdkPid);

      // Verify cold state
      const env = await getEnvironment(ctx.envName);
      if (!env) {
        throw new Error("Environment should exist");
      }
      let stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");

      // === FIRST WARM PHASE ===
      // Start Docker
      await startDocker(env);

      // Wait for Docker to be running
      await waitFor(async () => await isDockerRunning(ctx.envName), {
        timeout: 30000,
        message: "Docker containers did not start",
      });

      // Start a mock app service
      const frontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "300"], {
        cwd: worktreePath,
      });
      trackPid(frontPid);

      // Mark initialized (simulating DB init)
      await markInitialized(ctx.envName);

      // Verify warm state
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("warm");
      expect(stateInfo.sdkRunning).toBe(true);
      expect(stateInfo.dockerRunning).toBe(true);
      expect(stateInfo.appServicesRunning).toBe(true);

      // Verify initialized
      expect(await isInitialized(ctx.envName)).toBe(true);

      // === COOL PHASE ===
      // Stop app services (but not SDK)
      await stopService(ctx.envName, "front");
      untrackPid(frontPid);

      // Stop Docker
      await stopDocker(ctx.envName);

      // Verify cold state (SDK still running)
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");
      expect(stateInfo.sdkRunning).toBe(true);
      expect(stateInfo.dockerRunning).toBe(false);

      // === SECOND WARM PHASE ===
      // Start Docker again
      await startDocker(env);

      // Wait for Docker
      await waitFor(async () => await isDockerRunning(ctx.envName), {
        timeout: 30000,
        message: "Docker containers did not start on second warm",
      });

      // Start app service again
      const frontPid2 = await spawnDaemon(ctx.envName, "front", ["sleep", "300"], {
        cwd: worktreePath,
      });
      trackPid(frontPid2);

      // Should still be initialized (no re-init)
      expect(await isInitialized(ctx.envName)).toBe(true);

      // Verify warm again
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("warm");

      // === STOP PHASE ===
      // Stop everything
      await stopService(ctx.envName, "front");
      untrackPid(frontPid2);

      await stopService(ctx.envName, "sdk");
      untrackPid(sdkPid);

      await stopDocker(ctx.envName);

      // Verify stopped
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("stopped");

      // === START PHASE ===
      // Restart SDK only
      const sdkPid2 = await spawnDaemon(ctx.envName, "sdk", ["sleep", "300"], {
        cwd: worktreePath,
      });
      trackPid(sdkPid2);

      // Verify cold
      stateInfo = await getStateInfo(env);
      expect(stateInfo.state).toBe("cold");

      // Clean up SDK
      await stopService(ctx.envName, "sdk");
      untrackPid(sdkPid2);

      // === DESTROY PHASE ===
      // Verify no uncommitted changes
      expect(await hasUncommittedChanges(worktreePath)).toBe(false);

      // Remove worktree and branch
      await removeWorktree(repoPath, worktreePath);
      await deleteBranch(repoPath, branchName);

      // Remove Docker volumes
      await stopDocker(ctx.envName, { removeVolumes: true });

      // Delete environment directory
      await deleteEnvironmentDir(ctx.envName);

      // Verify environment is gone
      expect(await getEnvironment(ctx.envName)).toBeNull();
      const envs = await listEnvironments();
      expect(envs).not.toContain(ctx.envName);
    }, 180000); // 3 minute timeout

    it("handles multiple concurrent environments", async () => {
      const env1Name = `${ctx.envName}-1`;
      const env2Name = `${ctx.envName}-2`;

      const port1 = getTestPortBase();
      const port2 = port1 + 1000; // Next port range

      const ports1 = calculatePorts(port1);
      const ports2 = calculatePorts(port2);

      const metadata1: EnvironmentMetadata = {
        name: env1Name,
        baseBranch: "main",
        workspaceBranch: `${env1Name}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: repoPath,
      };

      const metadata2: EnvironmentMetadata = {
        name: env2Name,
        baseBranch: "main",
        workspaceBranch: `${env2Name}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: repoPath,
      };

      registerCleanup(async () => {
        await cleanupTestEnvironment(env1Name);
        await cleanupTestEnvironment(env2Name);
      });

      // Create both environments
      await createEnvironment(metadata1);
      await savePortAllocation(env1Name, ports1);

      await createEnvironment(metadata2);
      await savePortAllocation(env2Name, ports2);

      // Start SDK in both
      const sdk1Pid = await spawnDaemon(env1Name, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdk1Pid);

      const sdk2Pid = await spawnDaemon(env2Name, "sdk", ["sleep", "60"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdk2Pid);

      // Both should be running independently
      expect(await isServiceRunning(env1Name, "sdk")).toBe(true);
      expect(await isServiceRunning(env2Name, "sdk")).toBe(true);

      // Both should be listed
      const envs = await listEnvironments();
      expect(envs).toContain(env1Name);
      expect(envs).toContain(env2Name);

      // Stop env1 SDK
      await stopService(env1Name, "sdk");
      untrackPid(sdk1Pid);

      // env1 stopped, env2 still running
      expect(await isServiceRunning(env1Name, "sdk")).toBe(false);
      expect(await isServiceRunning(env2Name, "sdk")).toBe(true);

      // Clean up env2
      await stopService(env2Name, "sdk");
      untrackPid(sdk2Pid);

      // Destroy both
      await deleteEnvironmentDir(env1Name);
      await deleteEnvironmentDir(env2Name);

      // Both gone
      const envsAfter = await listEnvironments();
      expect(envsAfter).not.toContain(env1Name);
      expect(envsAfter).not.toContain(env2Name);
    }, 60000); // 1 minute timeout

    it("destroy blocks on uncommitted changes", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: branchName,
        createdAt: new Date().toISOString(),
        repoRoot: repoPath,
      };

      registerCleanup(async () => {
        await cleanupTestEnvironment(ctx.envName);
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      // Create environment with worktree
      await createEnvironment(metadata);
      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Make uncommitted changes
      await Bun.write(join(worktreePath, "new-file.txt"), "uncommitted content");

      // Verify uncommitted changes detected
      expect(await hasUncommittedChanges(worktreePath)).toBe(true);

      // This is where the destroy command would check and fail
      // We're testing the detection mechanism here
    }, 30000);
  });
});
