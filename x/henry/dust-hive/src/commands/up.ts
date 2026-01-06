import { logger } from "../lib/logger";
import { TEMPORAL_PORT, findRepoRoot } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { isTemporalServerRunning, startTemporalServer } from "../lib/temporal-server";
import {
  getCurrentBranch,
  getMainRepoPath,
  hasUncommittedChanges,
  isWorktree,
} from "../lib/worktree";
import { openMainSession } from "./open";
import { syncCommand } from "./sync";

interface UpOptions {
  attach?: boolean;
}

// Check preconditions for managed services mode
async function checkPreconditions(repoRoot: string): Promise<Result<void>> {
  // Must not be in a worktree
  const inWorktree = await isWorktree(repoRoot);
  if (inWorktree) {
    const mainRepo = await getMainRepoPath(repoRoot);
    return Err(
      new CommandError(
        `Cannot run 'dust-hive up' from a worktree. Run from the main repo: cd ${mainRepo}`
      )
    );
  }

  // Must be on main branch
  const currentBranch = await getCurrentBranch(repoRoot);
  if (currentBranch !== "main") {
    return Err(
      new CommandError(
        `Cannot run 'dust-hive up' from branch '${currentBranch}'. Checkout main first: git checkout main`
      )
    );
  }

  // Must have clean working directory (ignoring untracked files, since git pull --rebase handles them)
  const hasChanges = await hasUncommittedChanges(repoRoot, { ignoreUntracked: true });
  if (hasChanges) {
    return Err(
      new CommandError(
        "Repository has uncommitted changes. Commit or stash them before running 'dust-hive up'."
      )
    );
  }

  return Ok(undefined);
}

export async function upCommand(options: UpOptions = {}): Promise<Result<void>> {
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    return Err(new CommandError("Not in a git repository. Run from within the Dust repo."));
  }

  logger.info("Starting dust-hive managed services...");
  console.log();

  // Check preconditions
  const preconditions = await checkPreconditions(repoRoot);
  if (!preconditions.ok) {
    return preconditions;
  }

  // Run sync first
  logger.step("Running sync...");
  console.log();
  const syncResult = await syncCommand();
  if (!syncResult.ok) {
    return syncResult;
  }
  console.log();

  // Start temporal server
  logger.step("Starting Temporal server...");
  const temporalStatus = await isTemporalServerRunning();

  if (temporalStatus.running) {
    if (temporalStatus.managed) {
      logger.info(`Temporal already running (PID: ${temporalStatus.pid})`);
    } else {
      return Err(
        new CommandError(
          `Temporal is already running externally on port ${TEMPORAL_PORT}. Stop it first to use dust-hive managed temporal.`
        )
      );
    }
  } else {
    const startResult = await startTemporalServer();
    if (!startResult.success) {
      return Err(new CommandError(startResult.error ?? "Failed to start Temporal server"));
    }
    logger.success(`Temporal server started (PID: ${startResult.pid})`);
  }

  // Create/attach main session
  if (options.attach) {
    console.log();
    await openMainSession(repoRoot, { attach: true });
  } else {
    // Create session in background if it doesn't exist
    await openMainSession(repoRoot, { attach: false });
    console.log();
    logger.success("Managed services started!");
    console.log();
    console.log("Next steps:");
    console.log("  dust-hive up -a             # Attach to main session");
    console.log("  dust-hive spawn <name>      # Create a new environment");
    console.log("  dust-hive list              # List environments");
    console.log();
  }

  return Ok(undefined);
}
