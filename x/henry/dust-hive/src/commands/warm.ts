import { setCacheSource } from "../lib/cache";
import { requireEnvironment } from "../lib/commands";
import { getDockerProjectName, startDocker } from "../lib/docker";
import { isInitialized, markInitialized } from "../lib/environment";
import { startForwarder } from "../lib/forward";
import { createTemporalNamespaces, runAllDbInits } from "../lib/init";
import { logger } from "../lib/logger";
import { FORWARDER_PORTS } from "../lib/paths";
import { getServicePorts, isPortInUse, killProcessesOnPort } from "../lib/ports";
import { isServiceRunning } from "../lib/process";
import { startService, waitForServiceHealth } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { isDockerRunning } from "../lib/state";

// Check if Temporal server is running (default gRPC port 7233)
async function isTemporalRunning(): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["temporal", "operator", "namespace", "list", "--namespace", "default"],
      { stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// Kill orphaned processes on service ports
async function cleanupOrphanedPorts(ports: number[]): Promise<void> {
  const blockedPorts: number[] = [];
  for (const port of ports) {
    if (isPortInUse(port)) {
      logger.warn(`Port ${port} is in use, killing orphaned process...`);
      killProcessesOnPort(port);
      blockedPorts.push(port);
    }
  }
  if (blockedPorts.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function warmCommand(args: string[]): Promise<Result<void>> {
  const startTime = Date.now();
  const noForward = args.includes("--no-forward");
  const envName = args.find((arg) => !arg.startsWith("--"));
  const envResult = await requireEnvironment(envName, "warm");
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

  // Clean up orphaned processes on service ports
  await cleanupOrphanedPorts(getServicePorts(env.ports));

  // Start Docker containers (doesn't wait for health)
  await startDocker(env);

  // Check if first warm (needs initialization)
  const needsInit = !(await isInitialized(name));
  const projectName = getDockerProjectName(name);

  if (needsInit) {
    logger.info("First warm - initializing (parallel)...");
    console.log();

    // Start core + oauth early (they compile while init runs)
    // Run Temporal + DB inits in parallel
    const [, , temporalRunning] = await Promise.all([
      // Start Rust services early - they'll compile while other init happens
      startService(env, "core"),
      startService(env, "oauth"),
      // Check Temporal
      isTemporalRunning(),
      // Create Temporal namespaces (no container dependency)
      createTemporalNamespaces(env),
      // Run all DB inits (each waits for its container)
      runAllDbInits(env, projectName),
    ]);

    // Report Temporal status
    if (!temporalRunning) {
      logger.warn("Temporal server is not running. Workers will fail to connect.");
      logger.warn("Run 'temporal server start-dev' in another terminal.");
    }

    await markInitialized(name);
    logger.success("Initialization complete");
    console.log();

    // Start remaining services
    logger.info("Starting remaining services...");
    await Promise.all([
      startService(env, "front"),
      startService(env, "connectors"),
      startService(env, "front-workers"),
    ]);
  } else {
    // Not first warm - start all services in parallel
    logger.info("Starting services (parallel)...");
    console.log();

    const [, temporalRunning] = await Promise.all([
      Promise.all([
        startService(env, "core"),
        startService(env, "oauth"),
        startService(env, "front"),
        startService(env, "connectors"),
        startService(env, "front-workers"),
      ]),
      isTemporalRunning(),
    ]);

    if (!temporalRunning) {
      logger.warn("Temporal server is not running. Workers will fail to connect.");
      logger.warn("Run 'temporal server start-dev' in another terminal.");
    }
  }

  // Wait for services with health checks
  // Start forwarder as soon as front is healthy (don't wait for core/oauth)
  logger.step("Waiting for services to be healthy...");
  await Promise.all([
    waitForServiceHealth("front", env.ports).then(async () => {
      if (!noForward) {
        try {
          await startForwarder(env.ports.base, name);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`Could not start forwarder: ${msg}`);
        }
      }
    }),
    waitForServiceHealth("core", env.ports),
    waitForServiceHealth("oauth", env.ports),
  ]);
  logger.success("All services healthy");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  logger.success(`Environment '${name}' is now warm! (${elapsed}s)`);
  console.log();
  console.log(`  Front:       http://localhost:${env.ports.front}`);
  console.log(`  Core:        http://localhost:${env.ports.core}`);
  console.log(`  Connectors:  http://localhost:${env.ports.connectors}`);
  if (!noForward) {
    console.log();
    console.log(`  Forwarded:   ports ${FORWARDER_PORTS.join(", ")} → env (for OAuth)`);
  }
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive open ${name}      # Open zellij session`);
  console.log(`  dust-hive status ${name}    # Check service health`);
  console.log(`  dust-hive cool ${name}      # Stop services, keep SDK`);
  console.log();

  return Ok(undefined);
}
