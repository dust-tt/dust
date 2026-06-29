// Bee-mode provisioning: register the baked-image checkout itself as a
// single-tenant environment. Unlike `spawn`, there is no main repo to worktree
// from and no deps to symlink — the image *is* the worktree, with node_modules
// and cargo target already in place. So we skip worktree/symlink creation and
// `sync`, keep only the service-start path, and pin the base port (single
// tenant). The env is marked `worktreeOwner: "external"` so `destroy` never
// removes the checkout, plus `beeMode` so clients can tell bees apart.

import { setCacheSource } from "../lib/cache";
import { removeDirenvIntegration, setupDirenv } from "../lib/direnv";
import {
  deleteEnvironmentDir,
  type Environment,
  type EnvironmentMetadata,
  environmentExists,
  validateEnvName,
} from "../lib/environment";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { BASE_PORT, calculatePorts } from "../lib/ports";
import { stopAllServices } from "../lib/process";
import { startService, waitForServiceReady } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { loadSettings } from "../lib/settings";
import { getCurrentBranch } from "../lib/worktree";
import { setupEnvironmentFiles, tryCreateTestDatabase } from "./spawn";
import { warmCommand } from "./warm";

interface BeeInitOptions {
  name?: string | undefined;
  warm?: boolean | undefined;
  wait?: boolean | undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Build the metadata for a bee env. repoRoot and worktreePath are the same path:
// the checkout itself. Pure for testing.
export function buildBeeMetadata(opts: {
  name: string;
  repoRoot: string;
  workspaceBranch: string;
  createdAt: string;
}): EnvironmentMetadata {
  return {
    name: opts.name,
    baseBranch: "main",
    workspaceBranch: opts.workspaceBranch,
    createdAt: opts.createdAt,
    repoRoot: opts.repoRoot,
    worktreePath: opts.repoRoot,
    worktreeOwner: "external",
    beeMode: true,
  };
}

// Tear down a partially-provisioned bee. Never touches the checkout's git
// worktree or branch — for a bee those are the image itself.
async function cleanupBee(name: string, repoRoot: string): Promise<void> {
  await removeDirenvIntegration(name, repoRoot).catch((error) =>
    logger.warn(`Direnv cleanup failed: ${errorMessage(error)}`)
  );
  await deleteEnvironmentDir(name).catch((error) =>
    logger.warn(`Env cleanup failed: ${errorMessage(error)}`)
  );
}

async function startBeeBuildWatchers(
  env: Environment,
  repoRoot: string,
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
    await cleanupBee(env.name, repoRoot);
    return Err(new CommandError(`Failed to start build watchers: ${errorMessage(error)}`));
  }

  return Ok(undefined);
}

export async function beeInitCommand(options: BeeInitOptions): Promise<Result<void>> {
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    return Err(new CommandError("Not in a git repository. Run from within the bee's checkout."));
  }

  const name = options.name;
  if (!name) {
    return Err(new CommandError("Environment name is required"));
  }

  const validation = validateEnvName(name);
  if (!validation.valid) {
    return Err(new CommandError(validation.error ?? "Invalid environment name"));
  }

  if (await environmentExists(name)) {
    return Err(new CommandError(`Environment '${name}' already exists`));
  }

  // A bee is single-tenant: the env owns the whole machine, so ports are always
  // the base block. No allocation/lock needed.
  const ports = calculatePorts(BASE_PORT);

  // Binaries resolve from the checkout itself — it is the only repo present.
  await setCacheSource(repoRoot);

  const workspaceBranch = await getCurrentBranch(repoRoot);
  const metadata = buildBeeMetadata({
    name,
    repoRoot,
    workspaceBranch,
    createdAt: new Date().toISOString(),
  });

  logger.info(`Provisioning bee '${name}' from checkout '${repoRoot}'`);
  logger.step(`Using ports ${ports.base}-${ports.base + 999} (single tenant)`);

  const settings = await loadSettings();
  const filesResult = await setupEnvironmentFiles(metadata, ports, settings);
  if (!filesResult.ok) return filesResult;

  await tryCreateTestDatabase(name);

  try {
    await setupDirenv(name, repoRoot, { preserveExisting: true });
  } catch (error) {
    logger.warn(`Failed to setup direnv: ${errorMessage(error)}`);
  }

  const env: Environment = { name, metadata, ports, initialized: false };

  const buildResult = await startBeeBuildWatchers(
    env,
    repoRoot,
    Boolean(options.wait || options.warm)
  );
  if (!buildResult.ok) return buildResult;

  logger.success(`Bee '${name}' provisioned!`);
  logger.info(`Checkout: ${repoRoot}`);
  logger.info(`Branch:   ${workspaceBranch}`);
  logger.info(`Ports:    ${ports.base}-${ports.base + 999}`);

  if (options.warm) {
    console.log();
    return warmCommand(name, {});
  }

  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${name}     # Start docker + all services`);
  console.log(`  dust-hive status ${name}   # Check service health`);

  return Ok(undefined);
}
