import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CONFIG_ENV_PATH,
  DUST_HIVE_ENVS,
  DUST_HIVE_HOME,
  DUST_HIVE_WORKTREES,
  DUST_HIVE_ZELLIJ,
  findRepoRoot,
  getDockerOverridePath,
  getEnvDir,
  getEnvFilePath,
  getInitializedMarkerPath,
  getLogPath,
  getMetadataPath,
  getPidPath,
  getPortsPath,
  getWorktreeDir,
  getZellijLayoutPath,
} from "../../src/lib/paths";

describe("paths", () => {
  const home = homedir();

  describe("base directory constants", () => {
    it("sets DUST_HIVE_HOME to ~/.dust-hive", () => {
      expect(DUST_HIVE_HOME).toBe(join(home, ".dust-hive"));
    });

    it("sets DUST_HIVE_ENVS to ~/.dust-hive/envs", () => {
      expect(DUST_HIVE_ENVS).toBe(join(home, ".dust-hive", "envs"));
    });

    it("sets DUST_HIVE_ZELLIJ to ~/.dust-hive/zellij", () => {
      expect(DUST_HIVE_ZELLIJ).toBe(join(home, ".dust-hive", "zellij"));
    });

    it("sets DUST_HIVE_WORKTREES to ~/dust-hive", () => {
      expect(DUST_HIVE_WORKTREES).toBe(join(home, "dust-hive"));
    });

    it("sets CONFIG_ENV_PATH to ~/.dust-hive/config.env", () => {
      expect(CONFIG_ENV_PATH).toBe(join(home, ".dust-hive", "config.env"));
    });
  });

  describe("getEnvDir", () => {
    it("returns correct path for environment", () => {
      expect(getEnvDir("test")).toBe(join(home, ".dust-hive", "envs", "test"));
    });

    it("handles environment names with hyphens", () => {
      expect(getEnvDir("my-feature")).toBe(join(home, ".dust-hive", "envs", "my-feature"));
    });
  });

  describe("getWorktreeDir", () => {
    it("returns correct worktree path", () => {
      expect(getWorktreeDir("test")).toBe(join(home, "dust-hive", "test"));
    });

    it("handles environment names with hyphens", () => {
      expect(getWorktreeDir("auth-v2")).toBe(join(home, "dust-hive", "auth-v2"));
    });
  });

  describe("getEnvFilePath", () => {
    it("returns path to env.sh in environment directory", () => {
      expect(getEnvFilePath("test")).toBe(join(home, ".dust-hive", "envs", "test", "env.sh"));
    });
  });

  describe("getDockerOverridePath", () => {
    it("returns path to docker-compose.override.yml", () => {
      expect(getDockerOverridePath("test")).toBe(
        join(home, ".dust-hive", "envs", "test", "docker-compose.override.yml")
      );
    });
  });

  describe("getMetadataPath", () => {
    it("returns path to metadata.json", () => {
      expect(getMetadataPath("test")).toBe(
        join(home, ".dust-hive", "envs", "test", "metadata.json")
      );
    });
  });

  describe("getPortsPath", () => {
    it("returns path to ports.json", () => {
      expect(getPortsPath("test")).toBe(join(home, ".dust-hive", "envs", "test", "ports.json"));
    });
  });

  describe("getInitializedMarkerPath", () => {
    it("returns path to initialized marker file", () => {
      expect(getInitializedMarkerPath("test")).toBe(
        join(home, ".dust-hive", "envs", "test", "initialized")
      );
    });
  });

  describe("getPidPath", () => {
    it("returns correct PID file path for service", () => {
      expect(getPidPath("test", "front")).toBe(
        join(home, ".dust-hive", "envs", "test", "front.pid")
      );
      expect(getPidPath("test", "core")).toBe(join(home, ".dust-hive", "envs", "test", "core.pid"));
      expect(getPidPath("test", "sdk")).toBe(join(home, ".dust-hive", "envs", "test", "sdk.pid"));
    });

    it("handles service names with hyphens", () => {
      expect(getPidPath("test", "front-workers")).toBe(
        join(home, ".dust-hive", "envs", "test", "front-workers.pid")
      );
    });
  });

  describe("getLogPath", () => {
    it("returns correct log file path for service", () => {
      expect(getLogPath("test", "front")).toBe(
        join(home, ".dust-hive", "envs", "test", "front.log")
      );
      expect(getLogPath("test", "core")).toBe(join(home, ".dust-hive", "envs", "test", "core.log"));
    });

    it("handles service names with hyphens", () => {
      expect(getLogPath("test", "front-workers")).toBe(
        join(home, ".dust-hive", "envs", "test", "front-workers.log")
      );
    });
  });

  describe("getZellijLayoutPath", () => {
    it("returns path to zellij layout.kdl", () => {
      expect(getZellijLayoutPath()).toBe(join(home, ".dust-hive", "zellij", "layout.kdl"));
    });
  });

  describe("path consistency", () => {
    it("all environment-specific paths share same base directory", () => {
      const envName = "feature-x";
      const baseDir = getEnvDir(envName);

      expect(getEnvFilePath(envName).startsWith(baseDir)).toBe(true);
      expect(getMetadataPath(envName).startsWith(baseDir)).toBe(true);
      expect(getPortsPath(envName).startsWith(baseDir)).toBe(true);
      expect(getDockerOverridePath(envName).startsWith(baseDir)).toBe(true);
      expect(getInitializedMarkerPath(envName).startsWith(baseDir)).toBe(true);
      expect(getPidPath(envName, "front").startsWith(baseDir)).toBe(true);
      expect(getLogPath(envName, "front").startsWith(baseDir)).toBe(true);
    });
  });

  describe("findRepoRoot", () => {
    const testDir = "/tmp/dust-hive-test-findRepoRoot";
    const fakeRepoDir = join(testDir, "fake-repo");
    const subDir = join(fakeRepoDir, "subdir");
    const realRepoDir = join(testDir, "real-repo");
    const realSubDir = join(realRepoDir, "subdir");

    beforeAll(async () => {
      // Clean up any previous test artifacts
      await rm(testDir, { recursive: true, force: true });

      // Create fake repo with only .git/info/exclude (no HEAD)
      await mkdir(join(fakeRepoDir, ".git", "info"), { recursive: true });
      await writeFile(join(fakeRepoDir, ".git", "info", "exclude"), "*.log\n");
      await mkdir(subDir, { recursive: true });

      // Create real repo with .git/HEAD
      await mkdir(join(realRepoDir, ".git"), { recursive: true });
      await writeFile(join(realRepoDir, ".git", "HEAD"), "ref: refs/heads/main\n");
      await mkdir(realSubDir, { recursive: true });
    });

    afterAll(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("skips .git directories without HEAD file", async () => {
      // From a subdir with fake .git above, should return null (no valid repo found)
      const result = await findRepoRoot(subDir);
      expect(result).toBe(null);
    });

    it("finds real git repo with HEAD file", async () => {
      const result = await findRepoRoot(realSubDir);
      expect(result).toBe(realRepoDir);
    });

    it("finds real git repo from repo root", async () => {
      const result = await findRepoRoot(realRepoDir);
      expect(result).toBe(realRepoDir);
    });
  });
});
