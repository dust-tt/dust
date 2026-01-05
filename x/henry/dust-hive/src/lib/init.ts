// Data-driven database initialization with binary caching

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type InitBinary, binaryExists, getBinaryPath, getCacheSource } from "./cache";
import type { Environment } from "./environment";
import { logger } from "./logger";
import { DUST_HIVE_HOME, getEnvFilePath, getWorktreeDir } from "./paths";
import { buildShell } from "./shell";
import { SEARCH_ATTRIBUTES, TEMPORAL_NAMESPACE_CONFIG, getTemporalNamespaces } from "./temporal";

export { getTemporalNamespaces } from "./temporal";

export const SEED_USER_PATH = join(DUST_HIVE_HOME, "seed-user.json");

// Rust service binaries that can be pre-compiled
export const RUST_SERVICE_BINARIES = ["core-api", "oauth"] as const;
export type RustServiceBinary = (typeof RUST_SERVICE_BINARIES)[number];

const RUST_SOURCE_DIRS = ["src", "bin"] as const;
const RUST_SOURCE_FILES = ["Cargo.toml", "Cargo.lock"] as const;

// Get the path to a Rust binary in the worktree's target directory
export function getRustBinaryPath(worktreePath: string, binary: RustServiceBinary): string {
  return join(worktreePath, "core", "target", "debug", binary);
}

// Check if a Rust binary exists
export async function rustBinaryExists(
  worktreePath: string,
  binary: RustServiceBinary
): Promise<boolean> {
  const path = getRustBinaryPath(worktreePath, binary);
  const file = Bun.file(path);
  return file.exists();
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

async function getFileMtime(path: string): Promise<number> {
  try {
    const info = await stat(path);
    return info.mtimeMs;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function getLatestRustMtimeInDir(dir: string): Promise<number> {
  let latest = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const childLatest = await getLatestRustMtimeInDir(path);
        if (childLatest > latest) {
          latest = childLatest;
        }
      } else if (entry.isFile() && entry.name.endsWith(".rs")) {
        const mtime = await getFileMtime(path);
        if (mtime > latest) {
          latest = mtime;
        }
      }
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
  return latest;
}

async function getLatestRustSourceMtime(worktreePath: string): Promise<number> {
  const coreDir = join(worktreePath, "core");
  let latest = 0;

  for (const file of RUST_SOURCE_FILES) {
    const mtime = await getFileMtime(join(coreDir, file));
    if (mtime > latest) {
      latest = mtime;
    }
  }

  for (const dir of RUST_SOURCE_DIRS) {
    const mtime = await getLatestRustMtimeInDir(join(coreDir, dir));
    if (mtime > latest) {
      latest = mtime;
    }
  }

  return latest;
}

async function rustBinariesNeedRebuild(worktreePath: string): Promise<boolean> {
  const latestSource = await getLatestRustSourceMtime(worktreePath);
  if (latestSource === 0) {
    return true;
  }

  const [coreBinaryMtime, oauthBinaryMtime] = await Promise.all([
    getFileMtime(getRustBinaryPath(worktreePath, "core-api")),
    getFileMtime(getRustBinaryPath(worktreePath, "oauth")),
  ]);

  const oldestBinary = Math.min(coreBinaryMtime, oauthBinaryMtime);
  return oldestBinary === 0 || oldestBinary < latestSource;
}

// Pre-compile Rust service binaries (runs in background, returns promise)
// This allows compilation to happen in parallel with other init tasks
export async function preCompileRustBinaries(
  env: Environment,
  options?: { force?: boolean }
): Promise<void> {
  const worktreePath = getWorktreeDir(env.name);
  const force = options?.force ?? false;
  const needsRebuild = await rustBinariesNeedRebuild(worktreePath);
  if (!needsRebuild && !force) {
    logger.dim("Rust binaries up-to-date; skipping compile");
    return;
  }
  if (force) {
    logger.dim("Forcing Rust rebuild");
  }
  const envShPath = getEnvFilePath(env.name);
  const coreDir = join(worktreePath, "core");

  // Build both binaries in a single cargo invocation (more efficient)
  const command = buildShell({
    sourceEnv: envShPath,
    run: "cargo build --bin core-api --bin oauth",
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: coreDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to pre-compile Rust binaries: ${stderr.trim()}`);
  }
}

// Load environment variables from env.sh
async function loadEnvVars(envShPath: string): Promise<Record<string, string>> {
  // Source the env.sh and export all vars
  const command = `source "${envShPath}" && env`;
  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  await proc.exited;
  const output = await stdoutPromise;
  const stderr = await stderrPromise;

  if (proc.exitCode !== 0) {
    throw new Error(`Failed to load env vars: ${stderr.trim() || "unknown error"}`);
  }

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
    stdin?: string;
  }
): Promise<{ success: boolean; usedCache: boolean; stdout: string; stderr: string }> {
  const cacheSource = await getCacheSource();
  const hasCachedBinary = cacheSource ? await binaryExists(cacheSource, binary) : false;
  const stdinInput = options.stdin;

  const getFunction = (
    value: unknown,
    key: string
  ): ((...args: unknown[]) => unknown) | null => {
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const candidate = Reflect.get(value, key);
    return typeof candidate === "function" ? candidate : null;
  };

  const writeStdin = async (proc: Bun.Process, input: string): Promise<void> => {
    if (!proc.stdin) {
      return;
    }

    const write = getFunction(proc.stdin, "write");
    if (write) {
      write.call(proc.stdin, input);
      const end = getFunction(proc.stdin, "end");
      if (end) {
        end.call(proc.stdin);
      }
      return;
    }

    const getWriter = getFunction(proc.stdin, "getWriter");
    if (!getWriter) {
      throw new Error("Failed to write to stdin: unsupported stdin type");
    }

    const writer = getWriter.call(proc.stdin);
    const writerWrite = getFunction(writer, "write");
    if (writerWrite) {
      await writerWrite.call(writer, new TextEncoder().encode(input));
    }
    const close = getFunction(writer, "close");
    if (close) {
      await close.call(writer);
    }
  };

  if (hasCachedBinary && cacheSource) {
    // Run cached binary directly
    const binaryPath = getBinaryPath(cacheSource, binary);
    const proc = Bun.spawn([binaryPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdin: stdinInput ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    if (stdinInput) {
      await writeStdin(proc, stdinInput);
    }

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
    stdin: stdinInput ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (stdinInput) {
    await writeStdin(proc, stdinInput);
  }

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  return { success: proc.exitCode === 0, usedCache: false, stdout, stderr };
}

// Initialize PostgreSQL databases (parallel creation)
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

  // Create all databases in parallel
  await Promise.all(
    databases.map(async (db) => {
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
        return; // Already exists
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
    })
  );
}

// Initialize Qdrant collections
async function initQdrant(
  worktreePath: string,
  envVars: Record<string, string>
): Promise<{ success: boolean; usedCache: boolean }> {
  const maxAttempts = 5;
  const retryDelayMs = 1000;
  const args = ["--cluster", "cluster-0", "--provider", "openai", "--model", "text-embedding-3-large-1536"];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runBinary("qdrant_create_collection", args, {
      cwd: `${worktreePath}/core`,
      env: envVars,
      stdin: "y\n",
    });

    if (result.success) {
      return { success: true, usedCache: result.usedCache };
    }

    const combinedOutput = `${result.stdout}\n${result.stderr}`.toLowerCase();
    if (combinedOutput.includes("already exists")) {
      return { success: true, usedCache: result.usedCache };
    }

    if (attempt < maxAttempts) {
      logger.warn(
        `Qdrant init failed (attempt ${attempt}/${maxAttempts}). Retrying in ${retryDelayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }
    console.log(result.stdout);
    console.error(result.stderr);
    return { success: false, usedCache: result.usedCache };
  }
  return { success: false, usedCache: false };
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

    if (!result.success && !alreadyExists) {
      console.log(result.stdout);
      console.error(result.stderr);
      return { success: false, usedCache };
    }

    usedCache = usedCache || result.usedCache;
  }

  return { success: true, usedCache };
}

// Initialize Elasticsearch indices (TypeScript scripts) - parallel
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

  // Create all indices in parallel
  const results = await Promise.all(
    indices.map(async ({ name, version }) => {
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
        const combinedOutput = `${stdout}\n${stderr}`.toLowerCase();
        if (combinedOutput.includes("already exists")) {
          return true;
        }
        console.log(stdout);
        console.error(stderr);
        return false;
      }
      return true;
    })
  );

  return results.every((r) => r);
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

async function waitForQdrantReady(envVars: Record<string, string>): Promise<void> {
  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
  const baseUrl = envVars["QDRANT_URL"] ?? envVars["QDRANT_CLUSTER_0_URL"];
  if (!baseUrl) {
    throw new Error("QDRANT_URL is not set");
  }

  const maxWaitMs = 30000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const response = await fetch(`${baseUrl}/collections`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // keep retrying
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Qdrant did not become ready in time");
}

// Initialize all postgres-related things (runs after postgres is healthy)
async function initAllPostgres(env: Environment): Promise<void> {
  const envShPath = getEnvFilePath(env.name);
  const loadEnvStart = Date.now();
  const envVars = await loadEnvVars(envShPath);
  logger.recordTiming("loadEnvVars(postgres)", loadEnvStart);

  // Create databases first
  const createDbStart = Date.now();
  await initPostgres(envVars);
  logger.recordTiming("initPostgres(createDBs)", createDbStart);
  logger.success("PostgreSQL databases created");

  // Then run schema migrations in parallel
  const coreStart = Date.now();
  const frontStart = Date.now();
  const connectorsStart = Date.now();
  const [coreResult, frontResult, connectorsResult] = await Promise.all([
    runCoreDbInit(env).then((r) => {
      logger.recordTiming("runCoreDbInit", coreStart);
      return r;
    }),
    runFrontDbInit(env).then((r) => {
      logger.recordTiming("runFrontDbInit", frontStart);
      return r;
    }),
    runConnectorsDbInit(env).then((r) => {
      logger.recordTiming("runConnectorsDbInit", connectorsStart);
      return r;
    }),
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

  await waitForQdrantReady(envVars);

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
  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
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
  const postgresStart = Date.now();
  const qdrantStart = Date.now();
  const esStart = Date.now();

  await Promise.all([
    // Postgres: wait for container → create DBs → run schema inits
    (async () => {
      const waitStart = Date.now();
      await waitForContainer(projectName, "db");
      logger.recordTiming("waitForContainer(db)", waitStart);
      const initStart = Date.now();
      await initAllPostgres(env);
      logger.recordTiming("initAllPostgres", initStart);
      logger.recordTiming("postgres-total", postgresStart);
    })(),
    // Qdrant: wait for container → create collections
    (async () => {
      const waitStart = Date.now();
      await waitForContainer(projectName, "qdrant_primary");
      logger.recordTiming("waitForContainer(qdrant)", waitStart);
      const initStart = Date.now();
      await initAllQdrant(env);
      logger.recordTiming("initAllQdrant", initStart);
      logger.recordTiming("qdrant-total", qdrantStart);
    })(),
    // Elasticsearch: wait for container → create indices
    (async () => {
      const waitStart = Date.now();
      await waitForContainer(projectName, "elasticsearch");
      logger.recordTiming("waitForContainer(elasticsearch)", waitStart);
      const initStart = Date.now();
      await initAllElasticsearch(env);
      logger.recordTiming("initAllElasticsearch", initStart);
      logger.recordTiming("elasticsearch-total", esStart);
    })(),
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
  const configExists = await hasSeedConfig();
  if (!configExists) {
    return false;
  }

  logger.step("Seeding database with dev user...");

  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);
  const frontDir = `${worktreePath}/front`;

  // Use tsx for compatibility with frontend dependencies
  const command = buildShell({
    sourceEnv: envShPath,
    sourceNvm: true,
    run: `npx tsx admin/seed_dev_user.ts "${SEED_USER_PATH}"`,
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: frontDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NODE_ENV: "development" },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    logger.warn("Seed script failed (non-fatal):");
    if (stdout.trim()) console.log(stdout);
    if (stderr.trim()) console.error(stderr);
    return false;
  }

  if (stdout.trim()) {
    for (const line of stdout.trim().split("\n")) {
      console.log(`  ${line}`);
    }
  }

  logger.success("Database seeded with dev user");
  return true;
}
