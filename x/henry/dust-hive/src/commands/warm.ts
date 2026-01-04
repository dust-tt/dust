import { setCacheSource } from "../lib/cache";
import { requireEnvironment } from "../lib/commands";
import { startDocker } from "../lib/docker";
import { isInitialized, markInitialized } from "../lib/environment";
import { createTemporalNamespaces, runAllDbInits } from "../lib/init";
import { logger } from "../lib/logger";
import { getServicePorts, isPortInUse, killProcessesOnPort } from "../lib/ports";
import { isServiceRunning } from "../lib/process";
import { WARM_SERVICES, startService, waitForServiceHealth } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { isDockerRunning } from "../lib/state";

export async function warmCommand(args: string[]): Promise<Result<void>> {
  const envResult = await requireEnvironment(args[0], "warm");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  const name = env.name;

  // Set cache source to use binaries from main repo
  await setCacheSource(env.metadata.repoRoot);

  // Check if SDK is running (should be in cold state)
  const sdkRunning = await isServiceRunning(name, "sdk");
  if (!sdkRunning) {
    return Err(new CommandError("SDK watch is not running. Run 'dust-hive start' first."));
  }

  // Check if already warm
  const dockerRunning = await isDockerRunning(name);
  if (dockerRunning) {
    const frontRunning = await isServiceRunning(name, "front");
    if (frontRunning) {
      logger.info(`Environment '${name}' is already warm`);
      return Ok(undefined);
    }
  }

  logger.info(`Warming environment '${name}'...`);
  console.log();

  // Check for orphaned processes on service ports and kill them
  const servicePorts = getServicePorts(env.ports);
  const blockedPorts: number[] = [];
  for (const port of servicePorts) {
    if (isPortInUse(port)) {
      logger.warn(`Port ${port} is in use, killing orphaned process...`);
      killProcessesOnPort(port);
      blockedPorts.push(port);
    }
  }
  if (blockedPorts.length > 0) {
    // Give processes time to die
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Start Docker containers
  await startDocker(env);

  // Check if first warm (needs initialization)
  const needsInit = !(await isInitialized(name));

  if (needsInit) {
    logger.info("First warm - initializing databases...");
    console.log();

    // Create Temporal namespaces
    await createTemporalNamespaces(env);

    // Run all DB init steps
    await runAllDbInits(env);

    // Mark as initialized
    await markInitialized(name);
    logger.success("Database initialization complete");
    console.log();
  }

  // Start services using registry
  logger.info("Starting services...");
  console.log();

  for (const service of WARM_SERVICES) {
    await startService(env, service);
    // Wait for front to be healthy before starting front-workers
    if (service === "front") {
      await waitForServiceHealth("front", env.ports);
    }
  }

  console.log();
  logger.success(`Environment '${name}' is now warm!`);
  console.log();
  console.log(`  Front:       http://localhost:${env.ports.front}`);
  console.log(`  Core:        http://localhost:${env.ports.core}`);
  console.log(`  Connectors:  http://localhost:${env.ports.connectors}`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive open ${name}      # Open zellij session`);
  console.log(`  dust-hive status ${name}    # Check service health`);
  console.log(`  dust-hive cool ${name}      # Stop services, keep SDK`);
  console.log();

  return Ok(undefined);
}
