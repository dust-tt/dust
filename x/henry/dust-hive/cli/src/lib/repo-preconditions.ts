// Shared precondition checks for commands that operate on the main repo

import { CommandError, Err, Ok, type Result } from "./result";
import { getCurrentBranch, getMainRepoPath, hasUncommittedChanges, isWorktree } from "./worktree";

export interface PreconditionOptions {
  /** The command name to use in error messages (e.g., "dust-hive up", "sync") */
  commandName: string;
}

/**
 * Check preconditions for commands that must run from the main repo on main branch.
 * Validates:
 * - Not in a worktree
 * - On main branch
 * - Clean working directory (ignoring untracked files)
 */
export async function checkMainRepoPreconditions(
  repoRoot: string,
  options: PreconditionOptions
): Promise<Result<void>> {
  const { commandName } = options;

  // Must not be in a worktree
  const inWorktree = await isWorktree(repoRoot);
  if (inWorktree) {
    const mainRepo = await getMainRepoPath(repoRoot);
    return Err(
      new CommandError(
        `Cannot run '${commandName}' from a worktree. Run from the main repo: cd ${mainRepo}`
      )
    );
  }

  // Must be on main branch
  const currentBranch = await getCurrentBranch(repoRoot);
  if (currentBranch !== "main") {
    return Err(
      new CommandError(
        `Cannot run '${commandName}' from branch '${currentBranch}'. Checkout main first: git checkout main`
      )
    );
  }

  // Must have clean working directory (ignoring untracked files)
  const hasChanges = await hasUncommittedChanges(repoRoot, { ignoreUntracked: true });
  if (hasChanges) {
    return Err(
      new CommandError(
        `Repository has uncommitted changes. Commit or stash them before running '${commandName}'.`
      )
    );
  }

  return Ok(undefined);
}
