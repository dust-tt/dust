// Git worktree operations

import { logger } from "./logger";

// Get the current git branch
export async function getCurrentBranch(repoRoot: string): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`Failed to get current branch: ${stderr.trim() || "unknown error"}`);
  }
  return output.trim();
}

// Create a git worktree
export async function createWorktree(
  repoRoot: string,
  worktreePath: string,
  branchName: string,
  baseBranch: string
): Promise<void> {
  logger.step(`Creating worktree at ${worktreePath}`);

  const proc = Bun.spawn(["git", "worktree", "add", worktreePath, "-b", branchName, baseBranch], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`Failed to create worktree: ${stderr}`);
  }

  logger.success("Worktree created");
}

// Remove a git worktree
export async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  const proc = Bun.spawn(["git", "worktree", "remove", worktreePath, "--force"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    const message = stderr.trim();
    if (message.includes("not a working tree") || message.includes("not a worktree")) {
      return;
    }
    throw new Error(`Failed to remove worktree: ${message || "unknown error"}`);
  }
}

// Check if a git worktree has uncommitted changes
export async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "status", "--porcelain"], {
    cwd: worktreePath,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`Failed to check git status: ${stderr.trim() || "unknown error"}`);
  }
  return output.trim().length > 0;
}

// Delete a git branch
export async function deleteBranch(repoRoot: string, branchName: string): Promise<void> {
  const proc = Bun.spawn(["git", "branch", "-D", branchName], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    const message = stderr.trim();
    if (message.includes("not found")) {
      return;
    }
    throw new Error(`Failed to delete branch: ${message || "unknown error"}`);
  }
}

// Clean up a partially created environment (for rollback on failure)
export async function cleanupPartialEnvironment(
  repoRoot: string,
  worktreePath: string,
  branchName: string
): Promise<void> {
  await removeWorktree(repoRoot, worktreePath);
  await deleteBranch(repoRoot, branchName);
}
