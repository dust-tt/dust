// Git worktree operations

import { directoryExists } from "./fs";
import { logger } from "./logger";

// Check if a directory is a git worktree (not the main repo)
export async function isWorktree(repoRoot: string): Promise<boolean> {
  const gitPath = `${repoRoot}/.git`;
  // In worktrees, .git is a file pointing to the main repo's worktree directory
  // In main repos, .git is a directory
  const gitStat = await Bun.file(gitPath).exists();
  if (!gitStat) {
    return false;
  }

  // Check if .git is a file (worktree) or directory (main repo)
  const proc = Bun.spawn(["test", "-f", gitPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Get the main repository path from any location (worktree or main repo)
export async function getMainRepoPath(repoRoot: string): Promise<string> {
  // First check if this is a worktree
  const worktree = await isWorktree(repoRoot);

  if (!worktree) {
    // Already in main repo
    return repoRoot;
  }

  // Read the .git file to find the main repo
  const gitContent = await Bun.file(`${repoRoot}/.git`).text();
  // Format: "gitdir: /path/to/main/.git/worktrees/name"
  const match = gitContent.match(/^gitdir:\s*(.+)$/m);
  if (!match?.[1]) {
    throw new Error("Invalid .git file format in worktree");
  }

  const worktreeGitDir = match[1].trim();
  // Navigate from .git/worktrees/name to .git to main repo
  // Path looks like: /path/to/main/.git/worktrees/worktree-name
  const parts = worktreeGitDir.split("/");
  const worktreesIdx = parts.lastIndexOf("worktrees");
  if (worktreesIdx === -1) {
    throw new Error("Could not find main repo from worktree");
  }

  // Go up from .git/worktrees to main repo
  const mainGitDir = parts.slice(0, worktreesIdx).join("/");
  // mainGitDir is now /path/to/main/.git, so parent is main repo
  const mainRepoPath = mainGitDir.replace(/\/\.git$/, "");

  return mainRepoPath;
}

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
  // If repoRoot doesn't exist, the worktree is orphaned - just check if worktreePath exists
  const repoExists = await directoryExists(repoRoot);
  if (!repoExists) {
    // Can't run git commands without a valid repo, but worktree dir may still exist
    const worktreeExists = await directoryExists(worktreePath);
    if (worktreeExists) {
      logger.warn(`Repo root '${repoRoot}' no longer exists, removing worktree directory directly`);
      await Bun.spawn(["rm", "-rf", worktreePath]).exited;
    }
    return;
  }

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
  // If repoRoot doesn't exist, we can't delete the branch - just skip
  const repoExists = await directoryExists(repoRoot);
  if (!repoExists) {
    logger.warn(`Repo root '${repoRoot}' no longer exists, skipping branch deletion`);
    return;
  }

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
