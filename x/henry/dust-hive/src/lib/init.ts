// Data-driven database initialization

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

export interface DbInitConfig {
  name: string;
  dir: string; // relative to worktree, or "." for root
  commands: string[];
  needsNvm?: boolean;
}

// Database initialization steps in order
export const DB_INIT_CONFIGS: DbInitConfig[] = [
  {
    name: "init_dev_container",
    dir: ".",
    commands: ["bash init_dev_container.sh"],
    needsNvm: true,
  },
  {
    name: "core database",
    dir: "core",
    commands: ["cargo run --bin init_db"],
    needsNvm: false,
  },
  {
    name: "front database",
    dir: "front",
    commands: ["./admin/init_db.sh --unsafe", "./admin/init_plans.sh --unsafe"],
    needsNvm: true,
  },
  {
    name: "connectors database",
    dir: "connectors",
    commands: ["./admin/init_db.sh --unsafe"],
    needsNvm: true,
  },
];

// Run a single DB init step
async function runDbInit(env: Environment, config: DbInitConfig): Promise<void> {
  logger.step(`Initializing ${config.name}...`);

  const envShPath = getEnvFilePath(env.name);
  const worktreePath = getWorktreeDir(env.name);
  const cwd = config.dir === "." ? worktreePath : `${worktreePath}/${config.dir}`;

  const command = buildShell({
    sourceEnv: envShPath,
    sourceNvm: config.needsNvm ?? false,
    run: config.commands,
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    console.log(stdout);
    console.error(stderr);
    throw new Error(`${config.name} initialization failed`);
  }

  logger.success(`${config.name} initialized`);
}

// Run all DB initialization steps
export async function runAllDbInits(env: Environment): Promise<void> {
  for (const config of DB_INIT_CONFIGS) {
    await runDbInit(env, config);
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
    await proc.exited;
    // Ignore errors - namespace may already exist
  }

  logger.success("Temporal namespaces created");
}
