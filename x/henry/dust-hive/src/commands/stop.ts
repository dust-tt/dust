import { withEnvironment } from "../lib/commands";
import { stopDocker } from "../lib/docker";
import { getEnvironment, listEnvironments } from "../lib/environment";
import { logger } from "../lib/logger";
import { detectEnvFromCwd } from "../lib/paths";
import { stopAllServices } from "../lib/process";
import { confirm } from "../lib/prompt";
import { Ok, type Result } from "../lib/result";
import { getStateInfo, isDockerRunning } from "../lib/state";
import { stopTemporalServer } from "../lib/temporal-server";

interface ManagedStopOptions {
  force?: boolean;
}

// Get all dust-hive zellij sessions
async function getDustHiveSessions(): Promise<string[]> {
  const proc = Bun.spawn(["zellij", "list-sessions"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    return [];
  }

  // Strip ANSI codes and find dust-hive sessions
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional for ANSI escape code stripping
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");

  return output
    .split("\n")
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0])
    .filter((name): name is string => name?.startsWith("dust-hive-") ?? false);
}

// Kill a zellij session
async function killZellijSession(sessionName: string): Promise<boolean> {
  const proc = Bun.spawn(["zellij", "delete-session", sessionName, "--force"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
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

// Show confirmation prompt and return whether to proceed
async function confirmStopAll(envNames: string[], sessions: string[]): Promise<boolean> {
  console.log();
  logger.warn("This will stop:");
  if (envNames.length > 0) {
    console.log(`  - ${envNames.length} environment(s): ${envNames.join(", ")}`);
  }
  if (sessions.length > 0) {
    console.log(`  - ${sessions.length} zellij session(s): ${sessions.join(", ")}`);
  }
  console.log("  - Temporal server");
  console.log();

  return confirm("Are you sure you want to stop all dust-hive services?", false);
}

// Execute the actual stop operations
async function executeStopAll(envNames: string[], sessions: string[]): Promise<void> {
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

  // Kill all zellij sessions
  if (sessions.length > 0) {
    logger.step(`Killing ${sessions.length} zellij session(s)...`);
    await Promise.all(sessions.map((name) => killZellijSession(name)));
    logger.success("All zellij sessions killed");
  }

  console.log();
  logger.success("All dust-hive services stopped!");
}

// Stop all managed services
async function stopManagedServices(options: ManagedStopOptions): Promise<Result<void>> {
  const envNames = await listEnvironments();
  const sessions = await getDustHiveSessions();

  // Nothing to stop - just check temporal
  if (envNames.length === 0 && sessions.length === 0) {
    logger.info("No dust-hive environments or sessions to stop.");
    logger.step("Checking Temporal server...");
    const temporalResult = await stopTemporalServer();
    if (temporalResult.wasRunning) {
      logger.success("Temporal server stopped");
    } else {
      logger.info("Temporal server was not running");
    }
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

// Environment-specific stop
const stopEnvironmentCommand = withEnvironment("stop", async (env) => {
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state === "stopped") {
    logger.info("Environment is already stopped.");
    return Ok(undefined);
  }

  logger.info(`Stopping environment '${env.name}'...`);
  console.log();

  // Stop all services (including SDK)
  logger.step("Stopping all services...");
  await stopAllServices(env.name);
  logger.success("All services stopped");

  // Stop Docker if running
  const dockerRunning = await isDockerRunning(env.name);
  if (dockerRunning) {
    const dockerStopped = await stopDocker(env.name);
    if (!dockerStopped) {
      logger.warn("Docker containers may need manual cleanup");
    }
  }

  console.log();
  logger.success(`Environment '${env.name}' is now stopped`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive start ${env.name}   # Resume (start SDK watch)`);
  console.log(`  dust-hive destroy ${env.name} # Remove environment`);
  console.log();

  return Ok(undefined);
});

export async function stopCommand(
  name?: string,
  options: ManagedStopOptions = {}
): Promise<Result<void>> {
  // Determine if we should use managed services mode or environment mode
  const envFromCwd = detectEnvFromCwd();

  // If name is provided or we're in a worktree, use environment mode
  if (name || envFromCwd) {
    return stopEnvironmentCommand(name);
  }

  // Otherwise, use managed services mode
  return stopManagedServices(options);
}
