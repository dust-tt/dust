import { setCacheSource } from "../lib/cache";
import { withEnvironment } from "../lib/commands";
import { getDockerProjectName, startDocker } from "../lib/docker";
import { isInitialized, markInitialized } from "../lib/environment";
import { startForwarder } from "../lib/forward";
import { FORWARDER_PORTS } from "../lib/forwarderConfig";
import { createTemporalNamespaces, runAllDbInits, runSeedScript } from "../lib/init";
import { logger } from "../lib/logger";
import { cleanupServicePorts } from "../lib/ports";
import { isServiceRunning, readPid } from "../lib/process";
import { startService, waitForServiceReady } from "../lib/registry";
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

// Helper to time an async operation
async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  logger.recordTiming(name, start);
  return result;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration function with necessary complexity
export const warmCommand = withEnvironment("warm", async (env, options: WarmOptions) => {
  const startTime = Date.now();
  logger.startTiming();
  const noForward = options.noForward ?? false;
  const forcePorts = options.forcePorts ?? false;

  // Set cache source to use binaries from main repo
  await timed("setCacheSource", () => setCacheSource(env.metadata.repoRoot));

  // Check if SDK is running (should be in cold state)
  const sdkRunning = await timed("isServiceRunning(sdk)", () => isServiceRunning(env.name, "sdk"));
  if (!sdkRunning) {
    return Err(new CommandError("SDK watch is not running. Run 'dust-hive start' first."));
  }

  // Check if already warm
  const dockerRunning = await timed("isDockerRunning", () => isDockerRunning(env.name));
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
  const { killedPorts, blockedPorts } = await timed("cleanupServicePorts", () =>
    cleanupServicePorts(env.ports, {
      allowedPids,
      force: forcePorts,
    })
  );

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

  // Check if first warm (needs initialization)
  const needsInit = !(await isInitialized(env.name));
  const projectName = getDockerProjectName(env.name);

  // Start Docker containers first
  await timed("startDocker", () => startDocker(env));

  if (needsInit) {
    logger.info("First warm - initializing (parallel)...");
    console.log();

    // Start core + oauth early (they compile while DB init runs)
    const coreStart = Date.now();
    const oauthStart = Date.now();
    const corePromise = startService(env, "core").then(() =>
      logger.recordTiming("startService(core)", coreStart)
    );
    const oauthPromise = startService(env, "oauth").then(() =>
      logger.recordTiming("startService(oauth)", oauthStart)
    );

    // Run DB inits + check Temporal in parallel with core/oauth compilation
    const dbInitStart = Date.now();
    const dbInitPromise = runAllDbInits(env, projectName).then(() => {
      logger.recordTiming("runAllDbInits", dbInitStart);
    });

    const temporalRunningPromise = isTemporalRunning();

    // Wait for core/oauth to start (just process spawn, not compilation)
    const [, , temporalRunning] = await Promise.all([
      corePromise,
      oauthPromise,
      temporalRunningPromise,
    ]);

    // Report Temporal status
    if (!temporalRunning) {
      logger.warn("Temporal server is not running. Workers will fail to connect.");
      logger.warn("Run 'temporal server start-dev' in another terminal.");
    }

    const initTasks: Promise<void>[] = [dbInitPromise];
    if (temporalRunning) {
      const temporalStart = Date.now();
      initTasks.push(
        createTemporalNamespaces(env).then(() =>
          logger.recordTiming("createTemporalNamespaces", temporalStart)
        )
      );
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

    // Start seeding + remaining services + core/oauth health checks ALL in parallel
    // Health checks can start immediately - they poll until service is ready
    logger.info("Starting remaining services...");
    const seedStart = Date.now();
    const frontStart = Date.now();
    const connectorsStart = Date.now();
    const workersStart = Date.now();
    const coreHealthStart = Date.now();
    const oauthHealthStart = Date.now();

    await Promise.all([
      runSeedScript(env).then(() => logger.recordTiming("runSeedScript", seedStart)),
      startService(env, "front").then(() => logger.recordTiming("startService(front)", frontStart)),
      startService(env, "connectors").then(() =>
        logger.recordTiming("startService(connectors)", connectorsStart)
      ),
      startService(env, "front-workers").then(() =>
        logger.recordTiming("startService(front-workers)", workersStart)
      ),
      // Start health checks early - don't wait for seeding
      waitForServiceReady(env, "core").then(() =>
        logger.recordTiming("waitForServiceReady(core)", coreHealthStart)
      ),
      waitForServiceReady(env, "oauth").then(() =>
        logger.recordTiming("waitForServiceReady(oauth)", oauthHealthStart)
      ),
    ]);
  } else {
    // Not first warm - start all services in parallel
    logger.info("Starting services (parallel)...");
    console.log();

    const coreStart = Date.now();
    const oauthStart = Date.now();
    const frontStart = Date.now();
    const connectorsStart = Date.now();
    const workersStart = Date.now();
    const [, temporalRunning] = await Promise.all([
      Promise.all([
        startService(env, "core").then(() => logger.recordTiming("startService(core)", coreStart)),
        startService(env, "oauth").then(() =>
          logger.recordTiming("startService(oauth)", oauthStart)
        ),
        startService(env, "front").then(() =>
          logger.recordTiming("startService(front)", frontStart)
        ),
        startService(env, "connectors").then(() =>
          logger.recordTiming("startService(connectors)", connectorsStart)
        ),
        startService(env, "front-workers").then(() =>
          logger.recordTiming("startService(front-workers)", workersStart)
        ),
      ]),
      isTemporalRunning(),
    ]);

    if (!temporalRunning) {
      logger.warn("Temporal server is not running. Workers will fail to connect.");
      logger.warn("Run 'temporal server start-dev' in another terminal.");
    }
  }

  // Wait for front to be healthy (ensures seeding is complete before use)
  // Core/OAuth health already checked above for first warm
  logger.step("Waiting for services to be healthy...");
  const frontHealthStart = Date.now();
  if (needsInit) {
    // First warm: core/oauth health already checked, just wait for front
    await waitForServiceReady(env, "front").then(async () => {
      logger.recordTiming("waitForServiceReady(front)", frontHealthStart);
      if (!noForward) {
        await timed("startForwarder", () => startForwarder(env.ports.base, env.name));
      }
    });
  } else {
    // Subsequent warm: check all health in parallel
    const coreHealthStart = Date.now();
    const oauthHealthStart = Date.now();
    await Promise.all([
      waitForServiceReady(env, "front").then(async () => {
        logger.recordTiming("waitForServiceReady(front)", frontHealthStart);
        if (!noForward) {
          await timed("startForwarder", () => startForwarder(env.ports.base, env.name));
        }
      }),
      waitForServiceReady(env, "core").then(() =>
        logger.recordTiming("waitForServiceReady(core)", coreHealthStart)
      ),
      waitForServiceReady(env, "oauth").then(() =>
        logger.recordTiming("waitForServiceReady(oauth)", oauthHealthStart)
      ),
    ]);
  }
  logger.success("All services healthy");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.printTimingReport();
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
