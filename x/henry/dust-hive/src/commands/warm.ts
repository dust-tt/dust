import { setCacheSource } from "../lib/cache";
import { withEnvironment } from "../lib/commands";
import { getDockerProjectName, startDocker } from "../lib/docker";
import { isInitialized, markInitialized } from "../lib/environment";
import { startForwarder } from "../lib/forward";
import { FORWARDER_PORTS } from "../lib/forwarderConfig";
import { createTemporalNamespaces, runAllDbInits } from "../lib/init";
import { logger } from "../lib/logger";
import { cleanupServicePorts } from "../lib/ports";
import { isServiceRunning, readPid } from "../lib/process";
import { startService, waitForServiceHealth } from "../lib/registry";
import { CommandError, Err, Ok } from "../lib/result";
import type { ServiceName } from "../lib/services";
import { isDockerRunning } from "../lib/state";

interface WarmOptions {
  noForward?: boolean;
  forcePorts?: boolean;
}

// Check if Temporal server is running (default gRPC port 7233)
async function isTemporalRunning(): Promise<boolean> {
  const proc = Bun.spawn(["temporal", "operator", "namespace", "list", "--namespace", "default"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration function with necessary complexity
export const warmCommand = withEnvironment("warm", async (env, options: WarmOptions) => {
  const startTime = Date.now();
  const noForward = options.noForward ?? false;
  const forcePorts = options.forcePorts ?? false;

  // Set cache source to use binaries from main repo
  await setCacheSource(env.metadata.repoRoot);

  // Check if SDK is running (should be in cold state)
  const sdkRunning = await isServiceRunning(env.name, "sdk");
  if (!sdkRunning) {
    return Err(new CommandError("SDK watch is not running. Run 'dust-hive start' first."));
  }

  // Check if already warm
  const dockerRunning = await isDockerRunning(env.name);
  if (dockerRunning) {
    const frontRunning = await isServiceRunning(env.name, "front");
    if (frontRunning) {
      logger.info(`Environment '${env.name}' is already warm`);
      return Ok(undefined);
    }
  }

  logger.info(`Warming environment '${env.name}'...`);
  console.log();

  // Clean up orphaned processes on service ports
  const portServices: ServiceName[] = ["front", "core", "connectors", "oauth"];
  const servicePids = await Promise.all(portServices.map((service) => readPid(env.name, service)));
  const allowedPids = new Set(servicePids.filter((pid): pid is number => pid !== null));
  const { killedPorts, blockedPorts } = await cleanupServicePorts(env.ports, {
    allowedPids,
    force: forcePorts,
  });

  if (blockedPorts.length > 0) {
    const details = blockedPorts
      .map(({ port, processes }) => {
        const procInfo = processes
          .map((proc) => `${proc.pid}${proc.command ? ` (${proc.command})` : ""}`)
          .join(", ");
        return `${port}: ${procInfo}`;
      })
      .join("; ");
    return Err(
      new CommandError(
        `Ports in use by other processes: ${details}. Stop them or rerun with --force-ports to terminate.`
      )
    );
  }
  if (killedPorts.length > 0) {
    logger.warn(`Killed processes on ports: ${killedPorts.join(", ")}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Start Docker containers (doesn't wait for health)
  await startDocker(env);

  // Check if first warm (needs initialization)
  const needsInit = !(await isInitialized(env.name));
  const projectName = getDockerProjectName(env.name);

  if (needsInit) {
    logger.info("First warm - initializing (parallel)...");
    console.log();

    // Start core + oauth early (they compile while init runs)
    // Run Temporal + DB inits in parallel
    const dbInitPromise = runAllDbInits(env, projectName);
    const temporalRunningPromise = isTemporalRunning();
    const [, , temporalRunning] = await Promise.all([
      // Start Rust services early - they'll compile while other init happens
      startService(env, "core"),
      startService(env, "oauth"),
      // Check Temporal
      temporalRunningPromise,
    ]);

    // Report Temporal status
    if (!temporalRunning) {
      logger.warn("Temporal server is not running. Workers will fail to connect.");
      logger.warn("Run 'temporal server start-dev' in another terminal.");
    }

    const initTasks: Promise<void>[] = [dbInitPromise];
    if (temporalRunning) {
      initTasks.push(createTemporalNamespaces(env));
    }

    await Promise.all(initTasks);

    if (!temporalRunning) {
      logger.warn(
        "Skipping initialization marker; Temporal namespaces were not created. Rerun warm once Temporal is running."
      );
    } else {
      await markInitialized(env.name);
      logger.success("Initialization complete");
    }
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
        await startForwarder(env.ports.base, env.name);
      }
    }),
    waitForServiceHealth("core", env.ports),
    waitForServiceHealth("oauth", env.ports),
  ]);
  logger.success("All services healthy");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  logger.success(`Environment '${env.name}' is now warm! (${elapsed}s)`);
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
  console.log(`  dust-hive open ${env.name}      # Open zellij session`);
  console.log(`  dust-hive status ${env.name}    # Check service health`);
  console.log(`  dust-hive cool ${env.name}      # Stop services, keep SDK`);
  console.log();

  return Ok(undefined);
});
