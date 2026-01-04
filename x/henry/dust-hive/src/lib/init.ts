// Data-driven database initialization with binary caching

import { type InitBinary, binaryExists, getBinaryPath, getCacheSource } from "./cache";
import type { Environment } from "./environment";
import { logger } from "./logger";
import { getEnvFilePath, getWorktreeDir } from "./paths";
import { buildShell } from "./shell";

// Temporal namespace suffixes (shared with envgen.ts)
const TEMPORAL_NAMESPACE_SUFFIXES = ["", "-agent", "-connectors", "-relocation"] as const;

// Generate temporal namespace names for an environment
export function getTemporalNamespaces(envName: string): string[] {
  return TEMPORAL_NAMESPACE_SUFFIXES.map((suffix) => `dust-hive-${envName}${suffix}`);
}

// Load environment variables from env.sh
async function loadEnvVars(envShPath: string): Promise<Record<string, string>> {
  // Source the env.sh and export all vars
  const command = `source "${envShPath}" && env`;
  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const key = line.substring(0, idx);
      const value = line.substring(idx + 1);
      env[key] = value;
    }
  }
  return env;
}

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
  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
  const host = envVars["POSTGRES_HOST"] ?? "localhost";
  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
  const port = envVars["POSTGRES_PORT"] ?? "5432";
  const uri = `postgres://dev:dev@${host}:${port}/`;

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
    const proc = Bun.spawn(["psql", uri, "-c", `CREATE DATABASE ${db};`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    // Ignore errors - database may already exist
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

  if (!result.success) {
    console.log(result.stdout);
    console.error(result.stderr);
  }

  return { success: result.success, usedCache: result.usedCache };
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

    if (!result.success) {
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

  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
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

    if (proc.exitCode !== 0) {
      console.log(stdout);
      console.error(stderr);
      return false;
    }
  }

  return true;
}

// Run init_dev_container equivalent with cached binaries
async function runInitDevContainer(env: Environment): Promise<void> {
  logger.step("Initializing databases and services...");

  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);
  const envVars = await loadEnvVars(envShPath);
  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
  envVars["__ENV_SH_PATH__"] = envShPath;

  // 1. Create PostgreSQL databases
  logger.step("Creating PostgreSQL databases...");
  await initPostgres(envVars);
  logger.success("PostgreSQL databases created");

  // 2. Create Qdrant collections (using cached binary)
  logger.step("Creating Qdrant collections...");
  const qdrantResult = await initQdrant(worktreePath, envVars);
  if (!qdrantResult.success) {
    throw new Error("Qdrant collection creation failed");
  }
  logger.success(`Qdrant collections created${qdrantResult.usedCache ? " (cached)" : ""}`);

  // 3. Create Elasticsearch indices (Rust - using cached binary)
  logger.step("Creating Elasticsearch indices (core)...");
  const esRustResult = await initElasticsearchRust(worktreePath, envVars);
  if (!esRustResult.success) {
    throw new Error("Elasticsearch index creation failed (core)");
  }
  logger.success(
    `Elasticsearch indices created (core)${esRustResult.usedCache ? " (cached)" : ""}`
  );

  // 4. Create Elasticsearch indices (TypeScript)
  logger.step("Creating Elasticsearch indices (front)...");
  const esTsResult = await initElasticsearchTS(worktreePath, envVars);
  if (!esTsResult) {
    throw new Error("Elasticsearch index creation failed (front)");
  }
  logger.success("Elasticsearch indices created (front)");
}

// Run core database init
async function runCoreDbInit(env: Environment): Promise<{ success: boolean; usedCache: boolean }> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);
  const envVars = await loadEnvVars(envShPath);

  return await runBinary("init_db", [], {
    cwd: `${worktreePath}/core`,
    env: envVars,
  });
}

// Run front database init
async function runFrontDbInit(env: Environment): Promise<boolean> {
  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);

  const commands = ["./admin/init_db.sh --unsafe", "./admin/init_plans.sh --unsafe"];

  for (const cmd of commands) {
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

    await proc.exited;
    if (proc.exitCode !== 0) {
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

  await proc.exited;
  return proc.exitCode === 0;
}

// Run all DB initialization steps
// Uses cached binaries where possible
export async function runAllDbInits(env: Environment): Promise<void> {
  // First: init_dev_container equivalent (postgres, qdrant, elasticsearch)
  await runInitDevContainer(env);

  // Then: core, front, connectors in parallel
  logger.step("Initializing databases (parallel)...");

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
    throw new Error(`DB initialization failed for: ${failed.join(", ")}`);
  }

  const cacheNote = coreResult.usedCache ? " (core used cached binary)" : "";
  logger.success(`All databases initialized${cacheNote}`);
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
    await proc.exited;
    // Ignore errors - namespace may already exist
  }

  logger.success("Temporal namespaces created");
}
