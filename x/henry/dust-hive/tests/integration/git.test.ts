/**
 * Integration tests for git worktree operations
 *
 * Tests worktree creation, branch management, and cleanup.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { registerCleanup, runAllCleanups } from "./cleanup";
import { type TestContext, createTestContext, createTestGitRepo } from "./setup";

// Import the modules we're testing
import {
  cleanupPartialEnvironment,
  createWorktree,
  deleteBranch,
  getCurrentBranch,
  hasUncommittedChanges,
  removeWorktree,
} from "../../src/lib/worktree";

describe("git integration", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("git");
    repoPath = join(ctx.tempDir, "repo");
    await createTestGitRepo(repoPath);
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  describe("getCurrentBranch", () => {
    it("returns the current branch name", async () => {
      // Default branch after init is usually 'main' or 'master'
      const branch = await getCurrentBranch(repoPath);
      expect(["main", "master"]).toContain(branch);
    });

    it("returns branch name in worktree", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      const branch = await getCurrentBranch(worktreePath);
      expect(branch).toBe(branchName);
    });
  });

  describe("createWorktree", () => {
    it("creates worktree at specified path", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Verify worktree exists (has .git file or directory)
      const gitPath = join(worktreePath, ".git");
      const gitFile = Bun.file(gitPath);
      expect(await gitFile.exists()).toBe(true);
    });

    it("creates new branch from base branch", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-feature`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Verify branch was created
      const branch = await getCurrentBranch(worktreePath);
      expect(branch).toBe(branchName);
    });

    it("throws when branch already exists", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-existing`;

      // Create the branch first via git
      const proc = Bun.spawn(["git", "branch", branchName], {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;

      registerCleanup(async () => {
        await rm(worktreePath, { recursive: true, force: true });
        await deleteBranch(repoPath, branchName);
      });

      // Now try to create worktree with same branch name
      await expect(createWorktree(repoPath, worktreePath, branchName, "main")).rejects.toThrow();
    });

    it("copies files from base branch", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Verify files from base branch exist
      const packageJson = Bun.file(join(worktreePath, "package.json"));
      expect(await packageJson.exists()).toBe(true);

      const sdkPackage = Bun.file(join(worktreePath, "sdks/js/package.json"));
      expect(await sdkPackage.exists()).toBe(true);
    });
  });

  describe("removeWorktree", () => {
    it("removes an existing worktree", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Verify it exists
      expect(await Bun.file(join(worktreePath, ".git")).exists()).toBe(true);

      await removeWorktree(repoPath, worktreePath);

      // Branch still exists (removeWorktree doesn't delete branch)
      // But worktree should be gone
      const wtFile = Bun.file(join(worktreePath, ".git"));
      expect(await wtFile.exists()).toBe(false);

      // Clean up branch
      await deleteBranch(repoPath, branchName);
    });

    it("handles non-existent worktree gracefully", async () => {
      // Should not throw
      await removeWorktree(repoPath, join(ctx.tempDir, "nonexistent"));
    });
  });

  describe("deleteBranch", () => {
    it("deletes an existing branch", async () => {
      const branchName = `${ctx.envName}-to-delete`;

      // Create branch
      const createProc = Bun.spawn(["git", "branch", branchName], {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      await createProc.exited;

      // Verify branch exists
      const listProc = Bun.spawn(["git", "branch", "--list", branchName], {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(listProc.stdout).text();
      await listProc.exited;
      expect(output.trim()).toContain(branchName);

      // Delete branch
      await deleteBranch(repoPath, branchName);

      // Verify branch is gone
      const listProc2 = Bun.spawn(["git", "branch", "--list", branchName], {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output2 = await new Response(listProc2.stdout).text();
      await listProc2.exited;
      expect(output2.trim()).toBe("");
    });

    it("handles non-existent branch gracefully", async () => {
      // Should not throw
      await deleteBranch(repoPath, "nonexistent-branch-12345");
    });
  });

  describe("hasUncommittedChanges", () => {
    it("returns false for clean worktree", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      const hasChanges = await hasUncommittedChanges(worktreePath);
      expect(hasChanges).toBe(false);
    });

    it("returns true when files are modified", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Modify a file
      await Bun.write(join(worktreePath, "package.json"), '{"modified": true}');

      const hasChanges = await hasUncommittedChanges(worktreePath);
      expect(hasChanges).toBe(true);
    });

    it("returns true when new files are added", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Add a new file
      await Bun.write(join(worktreePath, "new-file.txt"), "new content");

      const hasChanges = await hasUncommittedChanges(worktreePath);
      expect(hasChanges).toBe(true);
    });

    it("returns true when files are staged", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-workspace`;

      registerCleanup(async () => {
        await removeWorktree(repoPath, worktreePath);
        await deleteBranch(repoPath, branchName);
      });

      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Add and stage a file
      await Bun.write(join(worktreePath, "staged.txt"), "staged content");
      const stageProc = Bun.spawn(["git", "add", "staged.txt"], {
        cwd: worktreePath,
        stdout: "pipe",
        stderr: "pipe",
      });
      await stageProc.exited;

      const hasChanges = await hasUncommittedChanges(worktreePath);
      expect(hasChanges).toBe(true);
    });
  });

  describe("cleanupPartialEnvironment", () => {
    it("removes worktree and deletes branch", async () => {
      const worktreePath = join(ctx.tempDir, "worktree");
      const branchName = `${ctx.envName}-partial`;

      // Create worktree
      await createWorktree(repoPath, worktreePath, branchName, "main");

      // Verify it exists
      expect(await Bun.file(join(worktreePath, ".git")).exists()).toBe(true);

      // Cleanup
      await cleanupPartialEnvironment(repoPath, worktreePath, branchName);

      // Verify worktree is gone
      expect(await Bun.file(join(worktreePath, ".git")).exists()).toBe(false);

      // Verify branch is gone
      const listProc = Bun.spawn(["git", "branch", "--list", branchName], {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(listProc.stdout).text();
      await listProc.exited;
      expect(output.trim()).toBe("");
    });

    it("handles partial state gracefully", async () => {
      const worktreePath = join(ctx.tempDir, "nonexistent-worktree");
      const branchName = `${ctx.envName}-nonexistent`;

      // Should not throw even if nothing exists
      await cleanupPartialEnvironment(repoPath, worktreePath, branchName);
    });
  });
});
