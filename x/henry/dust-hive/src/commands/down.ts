import { stopDocker } from "../lib/docker";
import { getEnvironment, listEnvironments } from "../lib/environment";
import { logger } from "../lib/logger";
import { getConfiguredMultiplexer } from "../lib/multiplexer";
import { stopAllServices } from "../lib/process";
import { confirm } from "../lib/prompt";
import { Ok, type Result } from "../lib/result";
import { getStateInfo, isDockerRunning } from "../lib/state";
import { stopTemporalServer } from "../lib/temporal-server";
import { stopTestPostgres } from "../lib/test-postgres";
import { stopTestRedis } from "../lib/test-redis";

interface DownOptions {
  force?: boolean;
}

// Stop a single environment (services + docker)
async function stopEnvironmentServices(envName: string): Promise<void> {
  const env = await getEnvironment(envName);
  if (!env) {
    return;
  }

  const stateInfo = await getStateInfo(env);
  if (stateInfo.state === "stopped") {
    return;
  }

  await stopAllServices(envName);

  const dockerRunning = await isDockerRunning(envName);
  if (dockerRunning) {
    await stopDocker(envName);
  }
}

// Stop temporal and log result
async function stopTemporalAndLog(): Promise<void> {
  logger.step("Stopping Temporal server...");
  const temporalResult = await stopTemporalServer();
  if (temporalResult.wasRunning) {
    logger.success("Temporal server stopped");
  } else {
    logger.info("Temporal server was not running");
  }
}

// Stop test postgres and log result
async function stopTestPostgresAndLog(): Promise<void> {
  logger.step("Stopping test Postgres...");
  const result = await stopTestPostgres();
  if (result.wasRunning) {
    logger.success("Test Postgres stopped");
  } else {
    logger.info("Test Postgres was not running");
  }
}

// Stop test Redis and log result
async function stopTestRedisAndLog(): Promise<void> {
  logger.step("Stopping test Redis...");
  const result = await stopTestRedis();
  if (result.wasRunning) {
    logger.success("Test Redis stopped");
  } else {
    logger.info("Test Redis was not running");
  }
}

// Show confirmation prompt and return whether to proceed
async function confirmStopAll(envNames: string[], sessions: string[]): Promise<boolean> {
  console.log();
  logger.warn("This will stop:");
  if (envNames.length > 0) {
    console.log(`  - ${envNames.length} environment(s): ${envNames.join(", ")}`);
  }
  if (sessions.length > 0) {
    console.log(`  - ${sessions.length} multiplexer session(s): ${sessions.join(", ")}`);
  }
  console.log("  - Temporal server");
  console.log("  - Shared test Postgres");
  console.log("  - Shared test Redis");
  console.log();

  return confirm("Are you sure you want to stop all dust-hive services?", false);
}

// Execute the actual stop operations
async function executeStopAll(envNames: string[], sessions: string[]): Promise<void> {
  const multiplexer = await getConfiguredMultiplexer();

  logger.info("Stopping all dust-hive services...");
  console.log();

  // Stop all environments in parallel
  if (envNames.length > 0) {
    logger.step(`Stopping ${envNames.length} environment(s)...`);
    await Promise.all(envNames.map((name) => stopEnvironmentServices(name)));
    logger.success("All environments stopped");
  }

  // Stop temporal server
  await stopTemporalAndLog();

  // Stop test postgres
  await stopTestPostgresAndLog();

  // Stop test Redis
  await stopTestRedisAndLog();

  // Kill all multiplexer sessions
  if (sessions.length > 0) {
    logger.step(`Killing ${sessions.length} multiplexer session(s)...`);
    await Promise.all(sessions.map((name) => multiplexer.deleteSession(name)));
    logger.success("All multiplexer sessions killed");
  }

  console.log();
  logger.success("All dust-hive services stopped!");
}

export async function downCommand(options: DownOptions = {}): Promise<Result<void>> {
  const multiplexer = await getConfiguredMultiplexer();
  const envNames = await listEnvironments();
  const sessions = await multiplexer.listSessions();

  // Nothing to stop - just check managed services
  if (envNames.length === 0 && sessions.length === 0) {
    logger.info("No dust-hive environments or sessions to stop.");
    await stopTemporalAndLog();
    await stopTestPostgresAndLog();
    await stopTestRedisAndLog();
    return Ok(undefined);
  }

  // Require confirmation unless --force
  if (!options.force) {
    const confirmed = await confirmStopAll(envNames, sessions);
    if (!confirmed) {
      logger.info("Cancelled");
      return Ok(undefined);
    }
    console.log();
  }

  await executeStopAll(envNames, sessions);
  return Ok(undefined);
}
