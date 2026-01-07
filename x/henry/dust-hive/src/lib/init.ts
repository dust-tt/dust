// Data-driven database initialization with binary caching

import { type InitBinary, binaryExists, getBinaryPath, getCacheSource } from "./cache";
import { buildPostgresUri, loadEnvVars } from "./env-utils";
import type { Environment } from "./environment";
import { logger } from "./logger";
import { SEED_USER_PATH, getEnvFilePath, getWorktreeDir } from "./paths";
import { runSqlSeed } from "./seed";
import { buildShell } from "./shell";
import { SEARCH_ATTRIBUTES, TEMPORAL_NAMESPACE_CONFIG, getTemporalNamespaces } from "./temporal";

export { getTemporalNamespaces } from "./temporal";

// Re-export from paths.ts for backwards compatibility
export { SEED_USER_PATH } from "./paths";

// Run a binary directly or fall back to cargo run
async function runBinary(
  binary: InitBinary,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
  }
): Promise<{ success: boolean; usedCache: boolean; stdout: string; stderr: string }> {
  const cacheSource = await getCacheSource();
  const hasCachedBinary = cacheSource ? await binaryExists(cacheSource, binary) : false;

  if (hasCachedBinary && cacheSource) {
    // Run cached binary directly
    const binaryPath = getBinaryPath(cacheSource, binary);
    const proc = Bun.spawn([binaryPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    return { success: proc.exitCode === 0, usedCache: true, stdout, stderr };
  }

  // Fall back to cargo run
  const cargoArgs = ["cargo", "run", "--bin", binary, "--", ...args].join(" ");
  const command = buildShell({ run: cargoArgs });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  return { success: proc.exitCode === 0, usedCache: false, stdout, stderr };
}

// Initialize PostgreSQL databases
async function initPostgres(envVars: Record<string, string>): Promise<void> {
  const uri = buildPostgresUri(envVars);

  const databases = [
    "dust_api",
    "dust_databases_store",
    "dust_front",
    "dust_front_test",
    "dust_connectors",
    "dust_connectors_test",
    "dust_oauth",
  ];

  for (const db of databases) {
    const existsProc = Bun.spawn(
      ["psql", uri, "-tAc", `SELECT 1 FROM pg_database WHERE datname='${db}';`],
      { stdout: "pipe", stderr: "pipe" }
    );
    const existsOut = await new Response(existsProc.stdout).text();
    const existsErr = await new Response(existsProc.stderr).text();
    await existsProc.exited;
    if (existsProc.exitCode !== 0) {
      throw new Error(`Failed to check database ${db}: ${existsErr.trim() || "unknown error"}`);
    }
    if (existsOut.trim() === "1") {
      continue;
    }

    const proc = Bun.spawn(["psql", uri, "-c", `CREATE DATABASE "${db}";`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    if (proc.exitCode !== 0) {
      throw new Error(`Failed to create database ${db}: ${stderr.trim() || "unknown error"}`);
    }
  }
}

// Initialize Qdrant collections
async function initQdrant(
  worktreePath: string,
  envVars: Record<string, string>
): Promise<{ success: boolean; usedCache: boolean }> {
  const result = await runBinary(
    "qdrant_create_collection",
    ["--cluster", "cluster-0", "--provider", "openai", "--model", "text-embedding-3-large-1536"],
    {
      cwd: `${worktreePath}/core`,
      env: envVars,
    }
  );

  // Treat "already exists" as success (idempotent)
  const alreadyExists =
    result.stderr.includes("already exists") || result.stdout.includes("already exists");

  if (!(result.success || alreadyExists)) {
    console.log(result.stdout);
    console.error(result.stderr);
  }

  return { success: result.success || alreadyExists, usedCache: result.usedCache };
}

// Initialize Elasticsearch indices (Rust binaries)
async function initElasticsearchRust(
  worktreePath: string,
  envVars: Record<string, string>
): Promise<{ success: boolean; usedCache: boolean }> {
  const indices = [
    { name: "data_sources_nodes", version: "4" },
    { name: "data_sources", version: "1" },
  ];

  let usedCache = false;
  for (const { name, version } of indices) {
    const result = await runBinary(
      "elasticsearch_create_index",
      ["--index-name", name, "--index-version", version, "--skip-confirmation"],
      {
        cwd: `${worktreePath}/core`,
        env: envVars,
      }
    );

    // Treat "already exists" as success (idempotent)
    const alreadyExists =
      result.stderr.includes("already exists") || result.stdout.includes("already exists");

    if (!(result.success || alreadyExists)) {
      console.log(result.stdout);
      console.error(result.stderr);
      return { success: false, usedCache };
    }

    usedCache = usedCache || result.usedCache;
  }

  return { success: true, usedCache };
}

// Initialize Elasticsearch indices (TypeScript scripts)
async function initElasticsearchTS(
  worktreePath: string,
  envVars: Record<string, string>
): Promise<boolean> {
  const indices = [
    { name: "agent_message_analytics", version: "2" },
    { name: "user_search", version: "1" },
  ];

  const envShPath = envVars["__ENV_SH_PATH__"] ?? "";
  const frontDir = `${worktreePath}/front`;

  for (const { name, version } of indices) {
    const command = buildShell({
      sourceEnv: envShPath,
      sourceNvm: true,
      run: `npx tsx ./scripts/create_elasticsearch_index.ts --index-name ${name} --index-version ${version} --skip-confirmation`,
    });

    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: frontDir,
      env: { ...process.env, ...envVars },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    // Treat "already exists" as success (idempotent)
    const alreadyExists = stderr.includes("already exists") || stdout.includes("already exists");

    if (proc.exitCode !== 0 && !alreadyExists) {
      console.log(stdout);
      console.error(stderr);
      return false;
    }
  }

  return true;
}

// Wait for a Docker container to be healthy
async function waitForContainer(projectName: string, service: string): Promise<void> {
  const containerName = `${projectName}-${service}-1`;
  const maxWait = 60000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const proc = Bun.spawn(
      ["docker", "inspect", "--format", "{{.State.Health.Status}}", containerName],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode === 0 && output.trim() === "healthy") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Container ${service} did not become healthy`);
}

// Initialize all postgres-related things (runs after postgres is healthy)
async function initAllPostgres(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const envVars = await loadEnvVars(envShPath);

  // Create databases first
  await initPostgres(envVars);
  logger.success("PostgreSQL databases created");

  // Then run schema migrations in parallel
  const [coreResult, frontResult, connectorsResult] = await Promise.all([
    runCoreDbInit(env),
    runFrontDbInit(env),
    runConnectorsDbInit(env),
  ]);

  const failed: string[] = [];
  if (!coreResult.success) failed.push("core");
  if (!frontResult) failed.push("front");
  if (!connectorsResult) failed.push("connectors");

  if (failed.length > 0) {
    throw new Error(`DB schema init failed for: ${failed.join(", ")}`);
  }
  logger.success("Database schemas initialized");
}

// Initialize Qdrant (runs after qdrant is healthy)
async function initAllQdrant(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);
  const envVars = await loadEnvVars(envShPath);

  const result = await initQdrant(worktreePath, envVars);
  if (!result.success) {
    throw new Error("Qdrant collection creation failed");
  }
  logger.success("Qdrant collections created");
}

// Initialize Elasticsearch (runs after ES is healthy)
async function initAllElasticsearch(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);
  const envVars = await loadEnvVars(envShPath);
  envVars["__ENV_SH_PATH__"] = envShPath;

  // Run Rust and TS ES inits in parallel
  const [rustResult, tsResult] = await Promise.all([
    initElasticsearchRust(worktreePath, envVars),
    initElasticsearchTS(worktreePath, envVars),
  ]);

  if (!rustResult.success) {
    throw new Error("Elasticsearch index creation failed (core)");
  }
  if (!tsResult) {
    throw new Error("Elasticsearch index creation failed (front)");
  }
  logger.success("Elasticsearch indices created");
}

// Run core database init
async function runCoreDbInit(env: Environment): Promise<{ success: boolean; usedCache: boolean }> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);
  const envVars = await loadEnvVars(envShPath);

  const result = await runBinary("init_db", [], {
    cwd: `${worktreePath}/core`,
    env: envVars,
  });

  // Treat "already exists" as success (idempotent)
  const alreadyExists =
    result.stderr.includes("already exists") || result.stdout.includes("already exists");

  return { success: result.success || alreadyExists, usedCache: result.usedCache };
}

// Run front database init
async function runFrontDbInit(env: Environment): Promise<boolean> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  // Commands and their expected completion markers
  // Both init_db.sh and init_plans.sh print "Done" when they complete successfully
  const commands = [
    { cmd: "./admin/init_db.sh --unsafe", name: "init_db", expectDone: true },
    { cmd: "./admin/init_plans.sh", name: "init_plans", expectDone: true },
  ];

  for (const { cmd, name, expectDone } of commands) {
    const command = buildShell({
      sourceEnv: envShPath,
      sourceNvm: true,
      run: cmd,
    });

    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: `${worktreePath}/front`,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    // Treat "already exists" or "No migrations" as success (idempotent)
    const alreadyExists =
      stderr.includes("already exists") ||
      stdout.includes("already exists") ||
      stdout.includes("No migrations");

    if (proc.exitCode !== 0 && !alreadyExists) {
      console.log(stdout);
      console.error(stderr);
      return false;
    }

    // Verify script completed successfully by checking for "Done" marker
    // This catches cases where script exits 0 but didn't actually complete
    if (expectDone && !stdout.includes("Done")) {
      logger.error(`${name} did not complete successfully (missing "Done" in output)`);
      console.log(stdout);
      console.error(stderr);
      return false;
    }
  }

  return true;
}

// Run connectors database init
async function runConnectorsDbInit(env: Environment): Promise<boolean> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const command = buildShell({
    sourceEnv: envShPath,
    sourceNvm: true,
    run: "./admin/init_db.sh --unsafe",
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: `${worktreePath}/connectors`,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  // Treat "already exists" or "relation already exists" as success (idempotent)
  const alreadyExists =
    stderr.includes("already exists") ||
    stdout.includes("already exists") ||
    stderr.includes("relation") ||
    stdout.includes("No migrations");

  if (proc.exitCode !== 0 && !alreadyExists) {
    console.log(stdout);
    console.error(stderr);
    return false;
  }

  return true;
}

// Run all DB initialization steps in parallel
// Each init waits for its container, then runs
export async function runAllDbInits(env: Environment, projectName: string): Promise<void> {
  logger.info("Initializing databases (parallel)...");

  // Run all inits in parallel - each waits for its container first
  await Promise.all([
    // Postgres: wait for container → create DBs → run schema inits
    waitForContainer(projectName, "db").then(() => initAllPostgres(env)),
    // Qdrant: wait for container → create collections
    waitForContainer(projectName, "qdrant_primary").then(() => initAllQdrant(env)),
    // Elasticsearch: wait for container → create indices
    waitForContainer(projectName, "elasticsearch").then(() => initAllElasticsearch(env)),
  ]);

  logger.success("All databases initialized");
}

// Create a search attribute on a namespace (idempotent - ignores "already exists")
async function createSearchAttribute(namespace: string, name: string, type: string): Promise<void> {
  const proc = Bun.spawn(
    [
      "temporal",
      "operator",
      "search-attribute",
      "create",
      "--name",
      name,
      "--type",
      type,
      "--namespace",
      namespace,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    const message = stderr.trim();
    // Ignore if attribute already exists
    if (!message.toLowerCase().includes("already exists")) {
      throw new Error(
        `Failed to create search attribute ${name} on ${namespace}: ${message || "unknown error"}`
      );
    }
  }
}

// Create Temporal namespaces for an environment
export async function createTemporalNamespaces(env: Environment): Promise<void> {
  logger.step("Creating Temporal namespaces...");

  const namespaces = getTemporalNamespaces(env.name);

  for (const ns of namespaces) {
    const proc = Bun.spawn(["temporal", "operator", "namespace", "create", ns], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    if (proc.exitCode !== 0) {
      const message = stderr.trim();
      if (message.toLowerCase().includes("already exists")) {
        continue;
      }
      throw new Error(`Failed to create Temporal namespace ${ns}: ${message || "unknown error"}`);
    }
  }

  logger.success("Temporal namespaces created");

  // Add search attributes to each namespace
  logger.step("Creating Temporal search attributes...");

  for (const config of TEMPORAL_NAMESPACE_CONFIG) {
    const namespace = `dust-hive-${env.name}${config.suffix}`;
    for (const attrName of config.searchAttributes) {
      const attrType = SEARCH_ATTRIBUTES[attrName];
      await createSearchAttribute(namespace, attrName, attrType);
    }
  }

  logger.success("Temporal search attributes created");
}

export async function hasSeedConfig(): Promise<boolean> {
  const file = Bun.file(SEED_USER_PATH);
  return file.exists();
}

export async function runSeedScript(env: Environment): Promise<boolean> {
  return runSqlSeed(env);
}
