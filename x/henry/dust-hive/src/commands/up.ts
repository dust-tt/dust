import { logger } from "../lib/logger";
import { TEMPORAL_PORT, findRepoRoot } from "../lib/paths";
import { checkMainRepoPreconditions } from "../lib/repo-preconditions";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { isTemporalServerRunning, startTemporalServer } from "../lib/temporal-server";
import { isTestPostgresRunning, startTestPostgres } from "../lib/test-postgres";
import { isTestRedisRunning, startTestRedis } from "../lib/test-redis";
import { openMainSession } from "./open";
import { syncCommand } from "./sync";

interface UpOptions {
  attach?: boolean;
  force?: boolean;
  compact?: boolean;
}

// Start temporal server if not already running
async function startTemporalIfNeeded(): Promise<Result<void>> {
  logger.step("Starting Temporal server...");
  const temporalStatus = await isTemporalServerRunning();

  if (temporalStatus.running) {
    if (temporalStatus.managed) {
      logger.info(`Temporal already running (PID: ${temporalStatus.pid})`);
      return Ok(undefined);
    }
    return Err(
      new CommandError(
        `Temporal is already running externally on port ${TEMPORAL_PORT}. Stop it first to use dust-hive managed temporal.`
      )
    );
  }

  const startResult = await startTemporalServer();
  if (!startResult.success) {
    return Err(new CommandError(startResult.error ?? "Failed to start Temporal server"));
  }
  logger.success(`Temporal server started (PID: ${startResult.pid})`);
  return Ok(undefined);
}

// Start shared test postgres if not already running
async function startTestPostgresIfNeeded(): Promise<Result<void>> {
  logger.step("Starting shared test Postgres...");
  const testPgRunning = await isTestPostgresRunning();

  if (testPgRunning) {
    logger.info("Test Postgres already running");
    return Ok(undefined);
  }

  const result = await startTestPostgres();
  if (!result.success) {
    return Err(new CommandError(result.error ?? "Failed to start test Postgres"));
  }
  logger.success("Test Postgres started (port 5433)");
  return Ok(undefined);
}

// Start shared test Redis if not already running
async function startTestRedisIfNeeded(): Promise<Result<void>> {
  logger.step("Starting shared test Redis...");
  const testRedisRunning = await isTestRedisRunning();

  if (testRedisRunning) {
    logger.info("Test Redis already running");
    return Ok(undefined);
  }

  const result = await startTestRedis();
  if (!result.success) {
    return Err(new CommandError(result.error ?? "Failed to start test Redis"));
  }
  logger.success("Test Redis started (port 6479)");
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
  const preconditions = await checkMainRepoPreconditions(repoRoot, { commandName: "dust-hive up" });
  if (!preconditions.ok) {
    return preconditions;
  }

  // Run sync first
  logger.step("Running sync...");
  console.log();
  const syncResult = await syncCommand(options.force ? { force: true } : {});
  if (!syncResult.ok) {
    return syncResult;
  }
  console.log();

  // Start temporal server
  const temporalResult = await startTemporalIfNeeded();
  if (!temporalResult.ok) {
    return temporalResult;
  }

  // Start shared test Postgres
  const testPgResult = await startTestPostgresIfNeeded();
  if (!testPgResult.ok) {
    return testPgResult;
  }

  // Start shared test Redis
  const testRedisResult = await startTestRedisIfNeeded();
  if (!testRedisResult.ok) {
    return testRedisResult;
  }

  // Create/attach main session
  if (options.attach) {
    console.log();
    await openMainSession(repoRoot, { attach: true, compact: options.compact });
  } else {
    // Create session in background if it doesn't exist
    await openMainSession(repoRoot, { attach: false, compact: options.compact });
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
