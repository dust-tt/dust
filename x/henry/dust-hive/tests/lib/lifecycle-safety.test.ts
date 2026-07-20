import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Environment } from "../../src/lib/environment";
import { directoryExists } from "../../src/lib/fs";
import { getDeleteBlockReason } from "../../src/lib/lifecycle";
import {
  getActiveLifecycleActivityLease,
  withLifecycleActivityLease,
} from "../../src/lib/lifecycle-activity";
import type { LifecyclePolicy } from "../../src/lib/lifecycle-config";
import { acquireLifecycleLock } from "../../src/lib/lifecycle-lock";
import { getEnvDir } from "../../src/lib/paths";
import { calculatePorts } from "../../src/lib/ports";
import { removeWorktree } from "../../src/lib/worktree";

const cleanupPaths: string[] = [];

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const stderr = await new Response(proc.stderr).text();
  expect(await proc.exited, stderr).toBe(0);
}

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

const policy: LifecyclePolicy = {
  coldAfterSeconds: 60,
  stopAfterSeconds: 120,
  deleteAfterSeconds: 300,
  trackSourceChanges: true,
  trackFrontend: true,
  blockDeleteIfSessionExists: false,
};

describe("lifecycle safety", () => {
  it("keeps transitions locked out while a wrapped command is active", async () => {
    const envName = `lease-${process.pid}-${crypto.randomUUID()}`;
    const envDir = getEnvDir(envName);
    cleanupPaths.push(envDir);
    await mkdir(envDir, { recursive: true });
    const transitionLock = await acquireLifecycleLock(envName);
    expect(transitionLock).not.toBeNull();

    const { promise: commandCanFinish, resolve: releaseCommand } = createDeferred();
    let hasCommandStarted = false;
    const { promise: commandDidStart, resolve: commandStarted } = createDeferred();

    const command = withLifecycleActivityLease(envName, "test", async () => {
      hasCommandStarted = true;
      commandStarted();
      await commandCanFinish;
    });
    await Bun.sleep(20);
    expect(hasCommandStarted).toBe(false);

    await transitionLock?.release();
    await commandDidStart;

    const sweepLock = await acquireLifecycleLock(envName);
    expect(sweepLock).not.toBeNull();
    expect(await getActiveLifecycleActivityLease(envName)).toMatchObject({ kind: "test" });
    await sweepLock?.release();

    releaseCommand();
    await command;
    expect(await getActiveLifecycleActivityLease(envName)).toBeNull();
    const lock = await acquireLifecycleLock(envName);
    expect(lock).not.toBeNull();
    await lock?.release();
  });

  it("keeps independent leases for concurrent wrapped commands", async () => {
    const envName = `leases-${process.pid}-${crypto.randomUUID()}`;
    const envDir = getEnvDir(envName);
    cleanupPaths.push(envDir);
    await mkdir(envDir, { recursive: true });

    const { promise: firstCanFinish, resolve: releaseFirst } = createDeferred();
    const { promise: secondCanFinish, resolve: releaseSecond } = createDeferred();
    const { promise: firstStarted, resolve: markFirstStarted } = createDeferred();
    const { promise: secondStarted, resolve: markSecondStarted } = createDeferred();
    const first = withLifecycleActivityLease(envName, "test", async () => {
      markFirstStarted();
      await firstCanFinish;
    });
    const second = withLifecycleActivityLease(envName, "test", async () => {
      markSecondStarted();
      await secondCanFinish;
    });

    await Promise.all([firstStarted, secondStarted]);
    releaseFirst();
    await first;
    const lock = await acquireLifecycleLock(envName);
    expect(lock).not.toBeNull();
    expect(await getActiveLifecycleActivityLease(envName)).toMatchObject({ kind: "test" });
    await lock?.release();

    releaseSecond();
    await second;
    expect(await getActiveLifecycleActivityLease(envName)).toBeNull();
  });

  it("blocks deletion of a dirty Hive-owned worktree but keeps external worktrees", async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), "dust-hive-delete-safety-"));
    cleanupPaths.push(worktreePath);
    const init = Bun.spawn(["git", "init", "--quiet"], { cwd: worktreePath });
    expect(await init.exited).toBe(0);
    await writeFile(join(worktreePath, "work-in-progress.ts"), "export const value = 1;\n");

    const env: Environment = {
      name: "delete-safety",
      metadata: {
        name: "delete-safety",
        baseBranch: "main",
        workspaceBranch: "delete-safety",
        createdAt: new Date().toISOString(),
        repoRoot: worktreePath,
        worktreePath,
        worktreeOwner: "hive",
      },
      ports: calculatePorts(10_000),
      initialized: false,
    };

    expect(await getDeleteBlockReason(env, policy)).toBe("worktree has uncommitted changes");
    expect(
      await getDeleteBlockReason(
        { ...env, metadata: { ...env.metadata, worktreeOwner: "external" } },
        policy
      )
    ).toBeNull();
  });

  it("refuses a non-forced worktree removal when changes appear", async () => {
    const repoPath = await mkdtemp(join(tmpdir(), "dust-hive-remove-safety-"));
    const worktreePath = `${repoPath}-worktree`;
    cleanupPaths.push(repoPath, worktreePath);
    await runGit(repoPath, ["init", "--quiet"]);
    await runGit(repoPath, ["config", "user.email", "hive-test@example.com"]);
    await runGit(repoPath, ["config", "user.name", "Hive Test"]);
    await writeFile(join(repoPath, "README.md"), "initial\n");
    await runGit(repoPath, ["add", "README.md"]);
    await runGit(repoPath, ["commit", "--quiet", "-m", "Initial commit"]);
    await runGit(repoPath, ["worktree", "add", "--quiet", "-b", "safety", worktreePath]);
    await writeFile(join(worktreePath, "work-in-progress.ts"), "export const value = 1;\n");

    await expect(removeWorktree(repoPath, worktreePath, { force: false })).rejects.toThrow(
      "Failed to remove worktree"
    );
    expect(await directoryExists(worktreePath)).toBe(true);
  });
});
