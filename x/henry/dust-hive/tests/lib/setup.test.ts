import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvironmentMetadata } from "../../src/lib/environment";
import { getMissingEnvironmentSetup, repairEnvironmentSetup } from "../../src/lib/setup";

let tmpDir: string;
let repoRoot: string;
let worktreePath: string;
let metadata: EnvironmentMetadata;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "dust-hive-setup-test-"));
  repoRoot = join(tmpDir, "repo");
  worktreePath = join(repoRoot, ".hives", "external", "tool", "workspace");
  metadata = {
    name: "external",
    baseBranch: "main",
    workspaceBranch: "feature",
    createdAt: "2026-01-01T00:00:00.000Z",
    repoRoot,
    worktreePath,
    worktreeOwner: "external",
  };

  await mkdir(join(repoRoot, "node_modules", "@dust-tt"), { recursive: true });
  await mkdir(join(repoRoot, "node_modules", "@modelcontextprotocol"), { recursive: true });
  await mkdir(join(repoRoot, "sdks", "js", "node_modules"), { recursive: true });
  await mkdir(join(repoRoot, "sparkle", "node_modules"), { recursive: true });
  await mkdir(join(repoRoot, ".claude", "skills"), { recursive: true });
  await mkdir(worktreePath, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("setup", () => {
  describe("getMissingEnvironmentSetup", () => {
    it("reports missing direnv and node_modules artifacts", async () => {
      const missing = await getMissingEnvironmentSetup(metadata);

      expect(missing).toContain(".envrc");
      expect(missing).toContain(".claude");
      expect(missing).toContain("node_modules/@dust-tt");
      expect(missing).toContain("node_modules/@modelcontextprotocol");
      expect(missing).toContain("sdks/js/node_modules");
      expect(missing).toContain("sparkle/node_modules");
      expect(missing).toContain("sdks/node_modules/@modelcontextprotocol");
    });

    it("returns no missing artifacts when setup is present", async () => {
      await writeFile(join(worktreePath, ".envrc"), "source env.sh\n");
      await mkdir(join(worktreePath, ".claude"), { recursive: true });
      await symlink(".claude", join(worktreePath, ".codex"));
      await mkdir(join(worktreePath, "node_modules", "@dust-tt"), { recursive: true });
      await mkdir(join(worktreePath, "node_modules", "@modelcontextprotocol"), {
        recursive: true,
      });
      await mkdir(join(worktreePath, "sdks", "node_modules", "@modelcontextprotocol"), {
        recursive: true,
      });
      await mkdir(join(worktreePath, "sdks", "js", "node_modules"), { recursive: true });
      await mkdir(join(worktreePath, "sparkle", "node_modules"), { recursive: true });

      await expect(getMissingEnvironmentSetup(metadata)).resolves.toEqual([]);
    });

    it("reports a missing Codex config alias when Claude config exists", async () => {
      await writeFile(join(worktreePath, ".envrc"), "source env.sh\n");
      await mkdir(join(worktreePath, ".claude"), { recursive: true });
      await mkdir(join(worktreePath, "node_modules", "@dust-tt"), { recursive: true });
      await mkdir(join(worktreePath, "node_modules", "@modelcontextprotocol"), {
        recursive: true,
      });
      await mkdir(join(worktreePath, "sdks", "node_modules", "@modelcontextprotocol"), {
        recursive: true,
      });
      await mkdir(join(worktreePath, "sdks", "js", "node_modules"), { recursive: true });
      await mkdir(join(worktreePath, "sparkle", "node_modules"), { recursive: true });

      await expect(getMissingEnvironmentSetup(metadata)).resolves.toEqual([".codex"]);
    });
  });

  describe("repairEnvironmentSetup", () => {
    it("creates the Codex config alias", async () => {
      await writeFile(join(worktreePath, ".envrc"), "source env.sh\n");
      await mkdir(join(worktreePath, ".claude"), { recursive: true });
      await mkdir(join(worktreePath, "node_modules", "@dust-tt"), { recursive: true });
      await mkdir(join(worktreePath, "node_modules", "@modelcontextprotocol"), {
        recursive: true,
      });
      await mkdir(join(worktreePath, "sdks", "node_modules", "@modelcontextprotocol"), {
        recursive: true,
      });
      await mkdir(join(worktreePath, "sdks", "js", "node_modules"), { recursive: true });
      await mkdir(join(worktreePath, "sparkle", "node_modules"), { recursive: true });

      await expect(repairEnvironmentSetup(metadata)).resolves.toEqual({
        repairedArtifacts: [".codex"],
        dependenciesRepaired: false,
      });
      await expect(readlink(join(worktreePath, ".codex"))).resolves.toBe(".claude");
    });
  });
});
