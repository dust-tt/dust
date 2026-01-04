import { setCacheSource } from "../lib/cache";
import { writeDockerComposeOverride } from "../lib/docker";
import { writeEnvSh } from "../lib/envgen";
import {
  type Environment,
  type EnvironmentMetadata,
  createEnvironment,
  deleteEnvironmentDir,
  environmentExists,
  validateEnvName,
} from "../lib/environment";
import { logger } from "../lib/logger";
import { findRepoRoot, getWorktreeDir } from "../lib/paths";
import type { PortAllocation } from "../lib/ports";
import { allocateNextPort, calculatePorts, savePortAllocation } from "../lib/ports";
import { waitForSdkBuild } from "../lib/process";
import { startService } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { installAllDependencies } from "../lib/setup";
import { cleanupPartialEnvironment, createWorktree, getCurrentBranch } from "../lib/worktree";
import { openCommand } from "./open";

interface SpawnOptions {
  name?: string;
  base?: string;
  noOpen?: boolean;
}

async function promptForName(): Promise<string> {
  process.stdout.write("Environment name: ");

  // Bun-specific API: `console` is an AsyncIterable that yields lines from stdin
  for await (const line of console) {
    const name = line.trim();
    const validation = validateEnvName(name);
    if (!validation.valid) {
      logger.error(validation.error ?? "Invalid name");
      process.stdout.write("Environment name: ");
      continue;
    }
    return name;
  }

  throw new Error("No input received");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Phase 1: Create environment files
async function setupEnvironmentFiles(
  metadata: EnvironmentMetadata,
  ports: PortAllocation
): Promise<Result<void, CommandError>> {
  try {
    await createEnvironment(metadata);
  } catch (error) {
    return Err(new CommandError(`Failed to create environment: ${errorMessage(error)}`));
  }

  try {
    await savePortAllocation(metadata.name, ports);
  } catch (error) {
    await deleteEnvironmentDir(metadata.name).catch((e) =>
      logger.warn(`Cleanup failed: ${errorMessage(e)}`)
    );
    return Err(new CommandError(`Failed to save port allocation: ${errorMessage(error)}`));
  }

  try {
    await writeEnvSh(metadata.name, ports);
  } catch (error) {
    await deleteEnvironmentDir(metadata.name).catch((e) =>
      logger.warn(`Cleanup failed: ${errorMessage(e)}`)
    );
    return Err(new CommandError(`Failed to write env.sh: ${errorMessage(error)}`));
  }

  try {
    await writeDockerComposeOverride(metadata.name, ports);
  } catch (error) {
    await deleteEnvironmentDir(metadata.name).catch((e) =>
      logger.warn(`Cleanup failed: ${errorMessage(e)}`)
    );
    return Err(new CommandError(`Failed to write docker-compose override: ${errorMessage(error)}`));
  }

  return Ok(undefined);
}

// Phase 2: Create worktree and install dependencies
async function setupWorktree(
  metadata: EnvironmentMetadata,
  worktreePath: string,
  workspaceBranch: string
): Promise<Result<void, CommandError>> {
  try {
    await createWorktree(metadata.repoRoot, worktreePath, workspaceBranch, metadata.baseBranch);
  } catch (error) {
    await deleteEnvironmentDir(metadata.name).catch((e) =>
      logger.warn(`Cleanup failed: ${errorMessage(e)}`)
    );
    return Err(new CommandError(`Failed to create worktree: ${errorMessage(error)}`));
  }

  try {
    await installAllDependencies(worktreePath, metadata.repoRoot);
  } catch (error) {
    logger.error("Spawn failed during npm install, cleaning up...");
    await cleanupPartialEnvironment(metadata.repoRoot, worktreePath, workspaceBranch).catch((e) =>
      logger.warn(`Worktree cleanup failed: ${errorMessage(e)}`)
    );
    await deleteEnvironmentDir(metadata.name).catch((e) =>
      logger.warn(`Env cleanup failed: ${errorMessage(e)}`)
    );
    return Err(new CommandError(`Failed to install dependencies: ${errorMessage(error)}`));
  }

  return Ok(undefined);
}

// Phase 3: Start SDK
async function startSdk(
  env: Environment,
  worktreePath: string
): Promise<Result<void, CommandError>> {
  const { repoRoot } = env.metadata;
  const workspaceBranch = env.metadata.workspaceBranch;

  try {
    await startService(env, "sdk");
  } catch (error) {
    logger.error("Spawn failed during SDK startup, cleaning up...");
    await cleanupPartialEnvironment(repoRoot, worktreePath, workspaceBranch).catch((e) =>
      logger.warn(`Worktree cleanup failed: ${errorMessage(e)}`)
    );
    await deleteEnvironmentDir(env.name).catch((e) =>
      logger.warn(`Env cleanup failed: ${errorMessage(e)}`)
    );
    return Err(new CommandError(`Failed to start SDK: ${errorMessage(error)}`));
  }

  try {
    await waitForSdkBuild(env.name);
  } catch (error) {
    logger.error("Spawn failed waiting for SDK build, cleaning up...");
    await cleanupPartialEnvironment(repoRoot, worktreePath, workspaceBranch).catch((e) =>
      logger.warn(`Worktree cleanup failed: ${errorMessage(e)}`)
    );
    await deleteEnvironmentDir(env.name).catch((e) =>
      logger.warn(`Env cleanup failed: ${errorMessage(e)}`)
    );
    return Err(new CommandError(`SDK build failed: ${errorMessage(error)}`));
  }

  return Ok(undefined);
}

export async function spawnCommand(options: SpawnOptions): Promise<Result<void>> {
  // Find repo root
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    return Err(new CommandError("Not in a git repository. Please run from within the Dust repo."));
  }

  // Set cache source to use binaries from main repo
  await setCacheSource(repoRoot);

  // Get or prompt for name
  let name = options.name;
  if (!name) {
    name = await promptForName();
  }

  // Validate name
  const validation = validateEnvName(name);
  if (!validation.valid) {
    return Err(new CommandError(validation.error ?? "Invalid environment name"));
  }

  // Check if already exists
  if (await environmentExists(name)) {
    return Err(new CommandError(`Environment '${name}' already exists`));
  }

  // Get base branch
  const baseBranch = options.base ?? (await getCurrentBranch(repoRoot));
  const workspaceBranch = `${name}-workspace`;
  const worktreePath = getWorktreeDir(name);

  logger.info(`Creating environment '${name}' from branch '${baseBranch}'`);

  // Allocate ports
  const basePort = await allocateNextPort();
  const ports = calculatePorts(basePort);
  logger.step(`Allocated ports ${ports.base}-${ports.base + 999}`);

  // Create environment metadata
  const metadata: EnvironmentMetadata = {
    name,
    baseBranch,
    workspaceBranch,
    createdAt: new Date().toISOString(),
    repoRoot,
  };

  // Phase 1: Setup environment files
  const filesResult = await setupEnvironmentFiles(metadata, ports);
  if (!filesResult.ok) return filesResult;

  // Phase 2: Setup worktree
  const worktreeResult = await setupWorktree(metadata, worktreePath, workspaceBranch);
  if (!worktreeResult.ok) return worktreeResult;

  // Phase 3: Start SDK
  const env: Environment = {
    name,
    metadata,
    ports,
    initialized: false,
  };

  const sdkResult = await startSdk(env, worktreePath);
  if (!sdkResult.ok) return sdkResult;

  logger.success(`Environment '${name}' created successfully!`);
  console.log();
  console.log(`  Worktree: ${worktreePath}`);
  console.log(`  Branch:   ${workspaceBranch}`);
  console.log(`  Ports:    ${ports.base}-${ports.base + 999}`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${name}    # Start all services`);
  console.log(`  dust-hive open ${name}    # Open zellij session`);
  console.log();

  // Open zellij unless --no-open
  if (!options.noOpen) {
    return openCommand(name);
  }

  return Ok(undefined);
}
