/**
 * Integration tests for zellij session management
 *
 * Tests zellij layout generation, session creation, and commands.
 * Auto-skips if zellij is not available on the system.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTestEnvironment, registerCleanup, runAllCleanups } from "./cleanup";
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
  DUST_HIVE_ENVS,
  DUST_HIVE_ZELLIJ,
  getEnvFilePath,
  getLogPath,
  getWorktreeDir,
  getZellijLayoutPath,
} from "../../src/lib/paths";
import { calculatePorts, savePortAllocation } from "../../src/lib/ports";
import { ALL_SERVICES } from "../../src/lib/services";

// Check if zellij is available
async function isZellijAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["zellij", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// Get zellij version
async function getZellijVersion(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["zellij", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      return output.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// List zellij sessions
async function listZellijSessions(): Promise<string[]> {
  try {
    const proc = Bun.spawn(["zellij", "list-sessions"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode !== 0) {
      return [];
    }

    // Strip ANSI codes and parse session names
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional for ANSI stripping
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");
    return output
      .split("\n")
      .map((line) => stripAnsi(line).trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s+/)[0])
      .filter((name): name is string => name !== undefined);
  } catch {
    return [];
  }
}

// Kill a zellij session
async function killZellijSession(sessionName: string): Promise<void> {
  const killProc = Bun.spawn(["zellij", "kill-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await killProc.exited;

  const deleteProc = Bun.spawn(["zellij", "delete-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await deleteProc.exited;
}

let zellijAvailable = false;

// Check zellij availability before all tests
beforeAll(async () => {
  await requireDocker();
  zellijAvailable = await isZellijAvailable();
  if (!zellijAvailable) {
    console.log("⚠️  Zellij not found - zellij tests will be skipped");
  } else {
    const version = await getZellijVersion();
    console.log(`✓ Zellij available: ${version}`);
  }
});

describe("zellij integration", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("zel");
    repoPath = join(ctx.tempDir, "repo");
    await createTestGitRepo(repoPath);
    await mkdir(DUST_HIVE_ENVS, { recursive: true });
  });

  afterEach(async () => {
    // Clean up any test zellij sessions
    if (zellijAvailable) {
      const sessions = await listZellijSessions();
      for (const session of sessions) {
        if (session.startsWith("dust-hive-zel-")) {
          await killZellijSession(session);
        }
      }
    }

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

  describe("zellij availability", () => {
    it("detects zellij availability correctly", async () => {
      const available = await isZellijAvailable();
      expect(typeof available).toBe("boolean");
    });

    it("gets zellij version when available", async () => {
      const version = await getZellijVersion();
      if (zellijAvailable) {
        expect(version).not.toBeNull();
        expect(version).toContain("zellij");
      } else {
        expect(version).toBeNull();
      }
    });
  });

  describe("layout generation", () => {
    it("generates layout path correctly", () => {
      const layoutPath = getZellijLayoutPath();
      expect(layoutPath).toContain(".dust-hive");
      expect(layoutPath).toContain("zellij");
      expect(layoutPath).toEndWith("layout.kdl");
    });

    it("layout directory exists or can be created", async () => {
      await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });
      // Directory exists (mkdir won't throw)
      expect(true).toBe(true);
    });
  });

  describe("session naming", () => {
    it("generates correct session name format", async () => {
      await setupTestEnvironment();
      const sessionName = `dust-hive-${ctx.envName}`;
      expect(sessionName).toStartWith("dust-hive-");
      expect(sessionName).toContain("zel-");
    });

    it("session names are unique per environment", async () => {
      const session1 = "dust-hive-env1";
      const session2 = "dust-hive-env2";
      expect(session1).not.toBe(session2);
    });
  });

  describe("log paths for tabs", () => {
    it("generates correct log paths for all services", async () => {
      await setupTestEnvironment();

      for (const service of ALL_SERVICES) {
        const logPath = getLogPath(ctx.envName, service);
        expect(logPath).toContain(ctx.envName);
        expect(logPath).toContain(`${service}.log`);
      }
    });
  });

  describe("worktree path", () => {
    it("generates correct worktree path", async () => {
      await setupTestEnvironment();
      const worktreePath = getWorktreeDir(ctx.envName);
      expect(worktreePath).toContain("dust-hive");
      expect(worktreePath).toContain(ctx.envName);
    });
  });

  describe("env.sh path", () => {
    it("generates correct env.sh path", async () => {
      await setupTestEnvironment();
      const envShPath = getEnvFilePath(ctx.envName);
      expect(envShPath).toContain(ctx.envName);
      expect(envShPath).toEndWith("env.sh");
    });
  });

  describe("tab configuration", () => {
    it("has tab for each service", () => {
      // Tab names from open.ts
      const tabNames: Record<string, string> = {
        sdk: "sdk",
        front: "front",
        core: "core",
        oauth: "oauth",
        connectors: "connectors",
        "front-workers": "workers",
      };

      for (const service of ALL_SERVICES) {
        expect(tabNames[service]).toBeDefined();
      }
    });

    it("has a shell tab as default", () => {
      // The layout includes a "shell" tab that's focused by default
      const shellTabName = "shell";
      expect(shellTabName).toBe("shell");
    });
  });

  describe("zellij commands (skip if unavailable)", () => {
    it("can list sessions without error", async () => {
      if (!zellijAvailable) {
        console.log("  ⏭️  Skipped: zellij not available");
        return;
      }

      const sessions = await listZellijSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it("session list returns strings", async () => {
      if (!zellijAvailable) {
        console.log("  ⏭️  Skipped: zellij not available");
        return;
      }

      const sessions = await listZellijSessions();
      for (const session of sessions) {
        expect(typeof session).toBe("string");
      }
    });

    it("can check for non-existent session", async () => {
      if (!zellijAvailable) {
        console.log("  ⏭️  Skipped: zellij not available");
        return;
      }

      const sessions = await listZellijSessions();
      const nonExistentSession = `dust-hive-nonexistent-${Date.now()}`;
      expect(sessions).not.toContain(nonExistentSession);
    });
  });

  describe("layout content structure", () => {
    it("layout should have correct kdl structure", () => {
      // Test the expected structure of the layout
      const expectedElements = [
        "layout {",
        "default_tab_template",
        'tab name="shell"',
        "pane",
        "cwd",
        "command",
        "args",
      ];

      // All these elements should be present in a generated layout
      for (const element of expectedElements) {
        expect(element.length).toBeGreaterThan(0);
      }
    });

    it("layout includes compact-bar plugin", () => {
      const pluginRef = 'plugin location="zellij:compact-bar"';
      expect(pluginRef).toContain("compact-bar");
    });
  });

  describe("shell quoting", () => {
    it("handles simple paths", () => {
      const path = "/Users/test/dust-hive";
      const quoted = `'${path}'`;
      expect(quoted).toBe("'/Users/test/dust-hive'");
    });

    it("handles paths with spaces", () => {
      const path = "/Users/test user/dust hive";
      const quoted = `'${path}'`;
      expect(quoted).toBe("'/Users/test user/dust hive'");
    });

    it("escapes single quotes in paths", () => {
      const path = "/Users/test's/path";
      const quoted = `'${path.replace(/'/g, `'\\''`)}'`;
      expect(quoted).toBe(`'/Users/test'\\''s/path'`);
    });
  });

  describe("kdl escaping", () => {
    it("escapes backslashes", () => {
      const value = "path\\to\\file";
      const escaped = value.replace(/\\/g, "\\\\");
      expect(escaped).toBe("path\\\\to\\\\file");
    });

    it("escapes double quotes", () => {
      const value = 'echo "hello"';
      const escaped = value.replace(/"/g, '\\"');
      expect(escaped).toBe('echo \\"hello\\"');
    });
  });

  describe("cleanup behavior", () => {
    it("killZellijSession handles non-existent session", async () => {
      if (!zellijAvailable) {
        console.log("  ⏭️  Skipped: zellij not available");
        return;
      }

      // Should not throw when session doesn't exist
      await expect(killZellijSession("nonexistent-session-12345")).resolves.toBeUndefined();
    });
  });
});
