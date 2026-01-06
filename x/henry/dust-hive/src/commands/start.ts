import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { TEMPORAL_PORT, detectEnvFromCwd, findRepoRoot } from "../lib/paths";
import { isServiceRunning } from "../lib/process";
import { startService, waitForServiceReady } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { getStateInfo } from "../lib/state";
import { isTemporalServerRunning, startTemporalServer } from "../lib/temporal-server";
import {
  getCurrentBranch,
  getMainRepoPath,
  hasUncommittedChanges,
  isWorktree,
} from "../lib/worktree";
import { openMainSession } from "./open";
import { syncCommand } from "./sync";

interface ManagedStartOptions {
  attach?: boolean;
}

// Check preconditions for managed services mode
async function checkManagedPreconditions(repoRoot: string): Promise<Result<void>> {
  // Must not be in a worktree
  const inWorktree = await isWorktree(repoRoot);
  if (inWorktree) {
    const mainRepo = await getMainRepoPath(repoRoot);
    return Err(
      new CommandError(
        `Cannot run 'dust-hive start' from a worktree. Run from the main repo: cd ${mainRepo}`
      )
    );
  }

  // Must be on main branch
  const currentBranch = await getCurrentBranch(repoRoot);
  if (currentBranch !== "main") {
    return Err(
      new CommandError(
        `Cannot run 'dust-hive start' from branch '${currentBranch}'. Checkout main first: git checkout main`
      )
    );
  }

  // Must have clean working directory
  const hasChanges = await hasUncommittedChanges(repoRoot);
  if (hasChanges) {
    return Err(
      new CommandError(
        "Repository has uncommitted changes. Commit or stash them before running 'dust-hive start'."
      )
    );
  }

  return Ok(undefined);
}

// Managed services mode: start temporal + sync + main session
async function startManagedServices(
  repoRoot: string,
  options: ManagedStartOptions
): Promise<Result<void>> {
  logger.info("Starting dust-hive managed services...");
  console.log();

  // Check preconditions
  const preconditions = await checkManagedPreconditions(repoRoot);
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
    console.log("  dust-hive start -a          # Attach to main session");
    console.log("  dust-hive spawn <name>      # Create a new environment");
    console.log("  dust-hive list              # List environments");
    console.log();
  }

  return Ok(undefined);
}

// Environment-specific start: resume stopped environment
const startEnvironmentCommand = withEnvironment("start", async (env) => {
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "stopped") {
    if (stateInfo.state === "cold") {
      logger.info("Environment is already cold (SDK running). Use 'warm' to start services.");
      return Ok(undefined);
    }
    logger.info("Environment is already warm.");
    return Ok(undefined);
  }

  logger.info(`Starting environment '${env.name}'...`);
  console.log();

  // Start SDK watch using registry
  if (!(await isServiceRunning(env.name, "sdk"))) {
    await startService(env, "sdk");
    await waitForServiceReady(env, "sdk");
  } else {
    logger.info("SDK watch already running");
  }

  console.log();
  logger.success(`Environment '${env.name}' is now cold (SDK running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${env.name}    # Start all services`);
  console.log(`  dust-hive open ${env.name}    # Open zellij session`);
  console.log();

  return Ok(undefined);
});

export async function startCommand(
  name?: string,
  options: ManagedStartOptions = {}
): Promise<Result<void>> {
  // Determine if we should use managed services mode or environment mode
  const envFromCwd = detectEnvFromCwd();

  // If name is provided or we're in a worktree, use environment mode
  if (name || envFromCwd) {
    return startEnvironmentCommand(name);
  }

  // Otherwise, use managed services mode
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    return Err(new CommandError("Not in a git repository. Run from within the Dust repo."));
  }

  return startManagedServices(repoRoot, options);
}
