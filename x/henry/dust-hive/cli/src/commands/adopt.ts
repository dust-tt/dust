import { relative, resolve } from "node:path";
import { setCacheSource } from "../lib/cache";
import { removeDirenvIntegration, setupDirenv } from "../lib/direnv";
import {
  deleteEnvironmentDir,
  type Environment,
  type EnvironmentMetadata,
  environmentExists,
  validateEnvName,
} from "../lib/environment";
import { directoryExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import type { PortAllocation } from "../lib/ports";
import { allocateNextPort, calculatePorts } from "../lib/ports";
import { stopAllServices } from "../lib/process";
import { startService, waitForServiceReady } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { loadSettings } from "../lib/settings";
import { installAllDependencies } from "../lib/setup";
import {
  getCurrentBranch,
  getMainRepoPath,
  hasUncommittedChanges,
  isWorktree,
} from "../lib/worktree";
import { setupEnvironmentFiles, tryCreateTestDatabase } from "./spawn";

interface AdoptOptions {
  name?: string | undefined;
  path?: string | undefined;
  branchName?: string | undefined;
  baseBranch?: string | undefined;
  wait?: boolean | undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return relativePath === "" || !(relativePath.startsWith("..") || relativePath.startsWith("/"));
}

function validateName(name: string): Result<void, CommandError> {
  const validation = validateEnvName(name);
  if (!validation.valid) {
    return Err(new CommandError(validation.error ?? "Invalid environment name"));
  }

  return Ok(undefined);
}

async function resolveWorktreePath(pathArg: string | undefined): Promise<Result<string>> {
  const requestedPath = resolve(pathArg ?? process.cwd());
  if (!(await directoryExists(requestedPath))) {
    return Err(new CommandError(`Worktree path does not exist: ${requestedPath}`));
  }

  const repoRoot = await findRepoRoot(requestedPath);
  if (!repoRoot) {
    return Err(new CommandError(`No git repository found at or above: ${requestedPath}`));
  }

  if (repoRoot !== requestedPath) {
    return Err(new CommandError(`Adopt path must be the worktree root. Did you mean: ${repoRoot}`));
  }

  if (!(await isWorktree(repoRoot))) {
    return Err(new CommandError("Adopt path must be an existing git worktree, not the main repo"));
  }

  return Ok(repoRoot);
}

async function cleanupAdoptedEnvironment(name: string, worktreePath?: string): Promise<void> {
  if (worktreePath) {
    await removeDirenvIntegration(name, worktreePath).catch((error) =>
      logger.warn(`Direnv cleanup failed: ${errorMessage(error)}`)
    );
  }

  await deleteEnvironmentDir(name).catch((error) =>
    logger.warn(`Env cleanup failed: ${errorMessage(error)}`)
  );
}

async function setupAdoptedWorktree(
  metadata: EnvironmentMetadata,
  worktreePath: string
): Promise<Result<void, CommandError>> {
  try {
    await setupDirenv(metadata.name, worktreePath, { preserveExisting: true });
  } catch (error) {
    logger.warn(`Failed to setup direnv: ${errorMessage(error)}`);
  }

  try {
    await installAllDependencies(worktreePath, metadata.repoRoot);
  } catch (error) {
    await cleanupAdoptedEnvironment(metadata.name, worktreePath);
    return Err(new CommandError(`Failed to install dependencies: ${errorMessage(error)}`));
  }

  return Ok(undefined);
}

async function createAdoptedEnvironment(
  metadata: EnvironmentMetadata,
  ports: PortAllocation,
  worktreePath: string
): Promise<Result<Environment, CommandError>> {
  const settings = await loadSettings();
  const filesResult = await setupEnvironmentFiles(metadata, ports, settings);
  if (!filesResult.ok) {
    return filesResult;
  }

  await tryCreateTestDatabase(metadata.name);

  const worktreeResult = await setupAdoptedWorktree(metadata, worktreePath);
  if (!worktreeResult.ok) {
    return worktreeResult;
  }

  return Ok({
    name: metadata.name,
    metadata,
    ports,
    initialized: false,
  });
}

async function startAdoptedBuildWatchers(
  env: Environment,
  worktreePath: string,
  waitForReady: boolean
): Promise<Result<void, CommandError>> {
  try {
    await Promise.all([startService(env, "sparkle"), startService(env, "sdk")]);
    if (waitForReady) {
      await Promise.all([waitForServiceReady(env, "sparkle"), waitForServiceReady(env, "sdk")]);
    }
  } catch (error) {
    await stopAllServices(env.name).catch((e) =>
      logger.warn(`Service cleanup failed: ${errorMessage(e)}`)
    );
    await cleanupAdoptedEnvironment(env.name, worktreePath);
    return Err(new CommandError(`Failed to start build watchers: ${errorMessage(error)}`));
  }

  return Ok(undefined);
}

export async function adoptCommand(options: AdoptOptions): Promise<Result<void>> {
  const worktreeResult = await resolveWorktreePath(options.path);
  if (!worktreeResult.ok) return worktreeResult;
  const worktreePath = worktreeResult.value;

  const mainRepoRoot = await getMainRepoPath(worktreePath);
  if (!isPathInside(mainRepoRoot, worktreePath)) {
    return Err(
      new CommandError(
        `Adopted worktree must live inside the main repo root (${mainRepoRoot}) so dependencies resolve from the shared node_modules.`
      )
    );
  }

  await setCacheSource(mainRepoRoot);

  const name = options.name;
  if (!name) {
    return Err(new CommandError("Environment name is required"));
  }

  const nameResult = validateName(name);
  if (!nameResult.ok) return nameResult;

  if (await environmentExists(name)) {
    return Err(new CommandError(`Environment '${name}' already exists`));
  }

  if (await hasUncommittedChanges(worktreePath)) {
    logger.warn("Adopting a worktree with uncommitted changes");
  }

  const basePort = await allocateNextPort();
  const ports = calculatePorts(basePort);
  const workspaceBranch = options.branchName ?? (await getCurrentBranch(worktreePath));
  const metadata: EnvironmentMetadata = {
    name,
    baseBranch: options.baseBranch ?? "main",
    workspaceBranch,
    createdAt: new Date().toISOString(),
    repoRoot: mainRepoRoot,
    worktreePath,
    worktreeOwner: "external",
  };

  logger.info(`Adopting worktree '${worktreePath}' as environment '${name}'`);
  logger.step(`Allocated ports ${ports.base}-${ports.base + 999}`);

  const envResult = await createAdoptedEnvironment(metadata, ports, worktreePath);
  if (!envResult.ok) return envResult;

  const buildResult = await startAdoptedBuildWatchers(
    envResult.value,
    worktreePath,
    Boolean(options.wait)
  );
  if (!buildResult.ok) {
    return buildResult;
  }

  logger.success(`Environment '${name}' adopted successfully!`);
  logger.info(`Worktree: ${worktreePath}`);
  logger.info(`Branch: ${workspaceBranch}`);
  logger.info(`Ports: ${ports.base}-${ports.base + 999}`);
  logger.info("Next steps:");
  logger.info(`dust-hive start ${name}         # Ensure cold services are running`);
  logger.info(`dust-hive warm ${name}          # Only when the full app stack is needed`);
  logger.info(`dust-hive unregister ${name}    # Remove Hive resources, keep worktree`);

  return Ok(undefined);
}
