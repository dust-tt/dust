/**
 * Integration tests for process management
 *
 * Tests daemon spawning, PID file management, and process lifecycle.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { registerCleanup, runAllCleanups, trackPid, untrackPid } from "./cleanup";
import { type TestContext, createTestContext } from "./setup";

import {
  type EnvironmentMetadata,
  createEnvironment,
  deleteEnvironmentDir,
} from "../../src/lib/environment";
import { DUST_HIVE_ENVS, getLogPath, getPidPath } from "../../src/lib/paths";
// Import the modules we're testing
import {
  cleanupPidFile,
  getRunningServices,
  isProcessRunning,
  isServiceRunning,
  readPid,
  spawnDaemon,
  spawnShellDaemon,
  stopService,
  writePid,
} from "../../src/lib/process";

describe("process integration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext("proc");
    await mkdir(DUST_HIVE_ENVS, { recursive: true });
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  describe("isProcessRunning", () => {
    it("returns true for running process", () => {
      // Current process is definitely running
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it("returns false for non-existent PID", () => {
      // Use a very high PID that's unlikely to exist
      expect(isProcessRunning(999999)).toBe(false);
    });
  });

  describe("writePid / readPid", () => {
    it("writes and reads PID correctly", async () => {
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

      // Write a PID (use current process as it's definitely running)
      await writePid(ctx.envName, "sdk", process.pid);

      // Read it back
      const pid = await readPid(ctx.envName, "sdk");
      expect(pid).toBe(process.pid);
    });

    it("returns null for non-existent PID file", async () => {
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

      const pid = await readPid(ctx.envName, "sdk");
      expect(pid).toBeNull();
    });

    it("cleans up stale PID file", async () => {
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

      // Write a stale PID (process that doesn't exist)
      await writePid(ctx.envName, "sdk", 999999);

      // Reading should return null and clean up the file
      const pid = await readPid(ctx.envName, "sdk");
      expect(pid).toBeNull();

      // PID file should be gone
      const pidPath = getPidPath(ctx.envName, "sdk");
      expect(await Bun.file(pidPath).exists()).toBe(false);
    });
  });

  describe("cleanupPidFile", () => {
    it("removes PID file", async () => {
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
      await writePid(ctx.envName, "sdk", 12345);

      const pidPath = getPidPath(ctx.envName, "sdk");
      expect(await Bun.file(pidPath).exists()).toBe(true);

      await cleanupPidFile(ctx.envName, "sdk");
      expect(await Bun.file(pidPath).exists()).toBe(false);
    });

    it("handles non-existent file gracefully", async () => {
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

      // Should not throw
      await cleanupPidFile(ctx.envName, "sdk");
    });
  });

  describe("spawnDaemon", () => {
    it("spawns process and creates PID file", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        // Kill the process first
        const pid = await readPid(ctx.envName, "sdk");
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // May have already exited
          }
        }
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);

      // Spawn a simple process that stays alive
      const pid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "30"], {
        cwd: ctx.tempDir,
      });

      trackPid(pid);

      // Verify PID file exists
      const pidPath = getPidPath(ctx.envName, "sdk");
      expect(await Bun.file(pidPath).exists()).toBe(true);

      // Verify process is running
      expect(isProcessRunning(pid)).toBe(true);

      // Verify log file exists
      const logPath = getLogPath(ctx.envName, "sdk");
      expect(await Bun.file(logPath).exists()).toBe(true);

      // Clean up
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // May have already exited
      }
      untrackPid(pid);
    });

    it("throws when process exits immediately", async () => {
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

      // Spawn a process that exits immediately
      await expect(
        spawnDaemon(ctx.envName, "sdk", ["false"], {
          cwd: ctx.tempDir,
        })
      ).rejects.toThrow(/exited immediately/);
    });
  });

  describe("spawnShellDaemon", () => {
    it("spawns shell command as daemon", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        const pid = await readPid(ctx.envName, "sdk");
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // May have already exited
          }
        }
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);

      // Spawn a shell command
      const pid = await spawnShellDaemon(ctx.envName, "sdk", "sleep 30", {
        cwd: ctx.tempDir,
      });

      trackPid(pid);

      // Verify running
      expect(isProcessRunning(pid)).toBe(true);

      // Clean up
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // May have already exited
      }
      untrackPid(pid);
    });

    it("captures output to log file", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        const pid = await readPid(ctx.envName, "sdk");
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // May have already exited
          }
        }
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);

      // Spawn a command that outputs something then sleeps
      const pid = await spawnShellDaemon(ctx.envName, "sdk", "echo 'test output' && sleep 30", {
        cwd: ctx.tempDir,
      });

      trackPid(pid);

      // Wait a moment for output
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check log file
      const logPath = getLogPath(ctx.envName, "sdk");
      const logContent = await Bun.file(logPath).text();
      expect(logContent).toContain("test output");

      // Clean up
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // May have already exited
      }
      untrackPid(pid);
    });
  });

  describe("isServiceRunning", () => {
    it("returns true when service is running", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        const pid = await readPid(ctx.envName, "sdk");
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // May have already exited
          }
        }
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);

      const pid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "30"], {
        cwd: ctx.tempDir,
      });
      trackPid(pid);

      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(true);

      // Clean up
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // May have already exited
      }
      untrackPid(pid);
    });

    it("returns false when service is not running", async () => {
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

      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(false);
    });
  });

  describe("stopService", () => {
    it("stops a running service", async () => {
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

      const pid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "30"], {
        cwd: ctx.tempDir,
      });
      trackPid(pid);

      expect(await isServiceRunning(ctx.envName, "sdk")).toBe(true);

      const stopped = await stopService(ctx.envName, "sdk");
      expect(stopped).toBe(true);

      // Verify process is gone
      expect(isProcessRunning(pid)).toBe(false);

      // Verify PID file is cleaned up
      const pidPath = getPidPath(ctx.envName, "sdk");
      expect(await Bun.file(pidPath).exists()).toBe(false);

      untrackPid(pid);
    });

    it("returns false when service not running", async () => {
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

      const stopped = await stopService(ctx.envName, "sdk");
      expect(stopped).toBe(false);
    });
  });

  describe("getRunningServices", () => {
    it("returns list of running services", async () => {
      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: ctx.tempDir,
      };

      registerCleanup(async () => {
        // Stop all services
        for (const service of ["sdk", "front"] as const) {
          const pid = await readPid(ctx.envName, service);
          if (pid) {
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              // May have already exited
            }
          }
        }
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);

      // Start two services
      const sdkPid = await spawnDaemon(ctx.envName, "sdk", ["sleep", "30"], {
        cwd: ctx.tempDir,
      });
      trackPid(sdkPid);

      const frontPid = await spawnDaemon(ctx.envName, "front", ["sleep", "30"], {
        cwd: ctx.tempDir,
      });
      trackPid(frontPid);

      const running = await getRunningServices(ctx.envName);
      expect(running).toContain("sdk");
      expect(running).toContain("front");
      expect(running).not.toContain("core");

      // Clean up
      try {
        process.kill(sdkPid, "SIGKILL");
        process.kill(frontPid, "SIGKILL");
      } catch {
        // May have already exited
      }
      untrackPid(sdkPid);
      untrackPid(frontPid);
    });

    it("returns empty array when no services running", async () => {
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

      const running = await getRunningServices(ctx.envName);
      expect(running).toEqual([]);
    });
  });
});
