// Git-spice integration for branch management

import { logger } from "./logger";

// Track a branch with git-spice
export async function trackBranchWithGitSpice(
  worktreePath: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  logger.step(`Tracking branch '${branchName}' with git-spice`);

  const proc = Bun.spawn(["gs", "branch", "track"], {
    cwd: worktreePath,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    return { success: false, error: stderr.trim() };
  }

  return { success: true };
}

// Delete a branch using git-spice
export async function deleteBranchWithGitSpice(
  repoRoot: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  logger.step(`Deleting branch '${branchName}' with git-spice`);

  const proc = Bun.spawn(["gs", "branch", "delete", branchName], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    const message = stderr.trim();
    // Branch not found is not an error - it's already gone
    if (message.includes("not found") || message.includes("does not exist")) {
      return { success: true };
    }
    return { success: false, error: message };
  }

  return { success: true };
}

// Sync repository with git-spice (pulls and restacks)
export async function repoSyncWithGitSpice(
  repoRoot: string
): Promise<{ success: boolean; error?: string }> {
  logger.step("Syncing repository with git-spice");

  const proc = Bun.spawn(["gs", "repo", "sync"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    return { success: false, error: stderr.trim() };
  }

  return { success: true };
}

// Check if git-spice is installed and available
export async function isGitSpiceAvailable(): Promise<boolean> {
  const proc = Bun.spawn(["which", "gs"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}
