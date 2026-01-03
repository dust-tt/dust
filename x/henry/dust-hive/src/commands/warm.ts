import { getDockerProjectName } from "../lib/docker";
import {
  type Environment,
  getEnvironment,
  isInitialized,
  markInitialized,
} from "../lib/environment";
import { logger } from "../lib/logger";
import { getDockerOverridePath, getEnvFilePath, getWorktreeDir } from "../lib/paths";
import type { PortAllocation } from "../lib/ports";
import { type ServiceName, isServiceRunning, spawnShellDaemon } from "../lib/process";
import { isDockerRunning } from "../lib/state";

// Start docker-compose with --wait flag
async function startDocker(env: Environment): Promise<void> {
  logger.step("Starting Docker containers...");

  const projectName = getDockerProjectName(env.name);
  const overridePath = getDockerOverridePath(env.name);
  const basePath = `${env.metadata.repoRoot}/tools/docker-compose.dust-hive.yml`;

  const proc = Bun.spawn(
    [
      "docker",
      "compose",
      "-f",
      basePath,
      "-f",
      overridePath,
      "-p",
      projectName,
      "up",
      "-d",
      "--wait",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`Docker compose failed: ${stderr}`);
  }

  logger.success("Docker containers started");
}

// Create Temporal namespaces
async function createTemporalNamespaces(env: Environment): Promise<void> {
  logger.step("Creating Temporal namespaces...");

  const namespaces = [
    `dust-hive-${env.name}`,
    `dust-hive-${env.name}-agent`,
    `dust-hive-${env.name}-connectors`,
    `dust-hive-${env.name}-relocation`,
  ];

  for (const ns of namespaces) {
    const proc = Bun.spawn(["temporal", "operator", "namespace", "create", ns], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    // Ignore errors - namespace may already exist
  }

  logger.success("Temporal namespaces created");
}

// Run init_dev_container.sh with parameterized ports
async function runInitDevContainer(env: Environment): Promise<void> {
  logger.step("Running init_dev_container.sh...");

  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    source ~/.nvm/nvm.sh && nvm use
    cd ${worktreePath}
    bash init_dev_container.sh
  `;

  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    console.log(stdout);
    console.error(stderr);
    throw new Error("init_dev_container.sh failed");
  }

  logger.success("init_dev_container.sh completed");
}

// Run core init_db
async function runCoreInitDb(env: Environment): Promise<void> {
  logger.step("Initializing core database...");

  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    cd ${worktreePath}/core
    cargo run --bin init_db
  `;

  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error("core init_db failed");
  }

  logger.success("Core database initialized");
}

// Run front init scripts
async function runFrontInitDb(env: Environment): Promise<void> {
  logger.step("Initializing front database...");

  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    source ~/.nvm/nvm.sh && nvm use
    cd ${worktreePath}/front
    ./admin/init_db.sh --unsafe
    ./admin/init_plans.sh --unsafe
  `;

  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error("front init_db failed");
  }

  logger.success("Front database initialized");
}

// Run connectors init_db
async function runConnectorsInitDb(env: Environment): Promise<void> {
  logger.step("Initializing connectors database...");

  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    source ~/.nvm/nvm.sh && nvm use
    cd ${worktreePath}/connectors
    ./admin/init_db.sh --unsafe
  `;

  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error("connectors init_db failed");
  }

  logger.success("Connectors database initialized");
}

// Start a service
async function startService(
  env: Environment,
  service: ServiceName,
  description: string,
  command: string,
  cwd: string,
  extraEnv?: Record<string, string>
): Promise<void> {
  if (await isServiceRunning(env.name, service)) {
    logger.info(`${description} already running`);
    return;
  }

  logger.step(`Starting ${description}...`);

  const options: { cwd: string; env?: Record<string, string> } = { cwd };
  if (extraEnv !== undefined) {
    options.env = extraEnv;
  }

  await spawnShellDaemon(env.name, service, command, options);

  logger.success(`${description} started`);
}

// Start front
async function startFront(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    source ~/.nvm/nvm.sh && nvm use
    npm run dev
  `;

  await startService(env, "front", "Front", command, `${worktreePath}/front`);
}

// Start core
async function startCore(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    cargo run --bin core-api
  `;

  await startService(env, "core", "Core API", command, `${worktreePath}/core`);
}

// Start oauth
async function startOauth(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    cargo run --bin oauth
  `;

  await startService(env, "oauth", "OAuth", command, `${worktreePath}/core`);
}

// Start connectors
async function startConnectors(env: Environment, ports: PortAllocation): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    source ~/.nvm/nvm.sh && nvm use
    TEMPORAL_NAMESPACE=dust-hive-${env.name}-connectors npx tsx src/start.ts -p ${ports.connectors}
  `;

  await startService(env, "connectors", "Connectors", command, `${worktreePath}/connectors`);
}

// Wait for front to be healthy
async function waitForFrontHealth(ports: PortAllocation, timeoutMs = 120000): Promise<void> {
  logger.step("Waiting for Front to be healthy...");

  const url = `http://localhost:${ports.front}/api/healthz`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        logger.success("Front is healthy");
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Front health check timed out");
}

// Start front-workers (requires front to be healthy first)
async function startFrontWorkers(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = `
    source ${envShPath}
    source ~/.nvm/nvm.sh && nvm use
    ./admin/dev_worker.sh
  `;

  await startService(env, "front-workers", "Front Workers", command, `${worktreePath}/front`);
}

export async function warmCommand(args: string[]): Promise<void> {
  const name = args[0];

  if (!name) {
    logger.error("Usage: dust-hive warm NAME");
    process.exit(1);
  }

  // Get environment
  const env = await getEnvironment(name);
  if (!env) {
    logger.error(`Environment '${name}' not found`);
    process.exit(1);
  }

  // Check if SDK is running (should be in cold state)
  const sdkRunning = await isServiceRunning(name, "sdk");
  if (!sdkRunning) {
    logger.error("SDK watch is not running. Run 'dust-hive start' first.");
    process.exit(1);
  }

  // Check if already warm
  const dockerRunning = await isDockerRunning(name);
  if (dockerRunning) {
    const frontRunning = await isServiceRunning(name, "front");
    if (frontRunning) {
      logger.info(`Environment '${name}' is already warm`);
      return;
    }
  }

  logger.info(`Warming environment '${name}'...`);
  console.log();

  // Start Docker containers
  await startDocker(env);

  // Check if first warm (needs initialization)
  const needsInit = !(await isInitialized(name));

  if (needsInit) {
    logger.info("First warm - initializing databases...");
    console.log();

    // Create Temporal namespaces
    await createTemporalNamespaces(env);

    // Run init scripts
    await runInitDevContainer(env);
    await runCoreInitDb(env);
    await runFrontInitDb(env);
    await runConnectorsInitDb(env);

    // Mark as initialized
    await markInitialized(name);
    logger.success("Database initialization complete");
    console.log();
  }

  // Start services
  logger.info("Starting services...");
  console.log();

  await startFront(env);
  await startCore(env);
  await startOauth(env);
  await startConnectors(env, env.ports);

  // Wait for front to be healthy before starting workers
  await waitForFrontHealth(env.ports);
  await startFrontWorkers(env);

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
}
