import {
  type EnvironmentNameArg,
  normalizeEnvironmentNames,
  requireEnvironment,
} from "../lib/commands";
import { removeDockerVolumes, stopDocker } from "../lib/docker";
import { type Environment, deleteEnvironmentDir, getEnvironment } from "../lib/environment";
import { directoryExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { getConfiguredMultiplexer, getSessionName } from "../lib/multiplexer";
import { getWorktreeDir } from "../lib/paths";
import { getInstallInstructions } from "../lib/platform";
import { cleanupServicePorts, formatBlockedPorts } from "../lib/ports";
import { readPid, stopAllServices } from "../lib/process";
import { restoreTerminal, selectMultipleEnvironments } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import type { ServiceName } from "../lib/services";
import { type Settings, loadSettings } from "../lib/settings";
import { isDockerRunning } from "../lib/state";
import { getTemporalNamespaces } from "../lib/temporal";
import { isTemporalServerRunning } from "../lib/temporal-server";
import { dropTestDatabase } from "../lib/test-postgres";
import { deleteBranch, hasUncommittedChanges, removeWorktree } from "../lib/worktree";

async function cleanupMultiplexerSession(envName: string): Promise<void> {
  const multiplexer = await getConfiguredMultiplexer();
  const sessionName = getSessionName(envName);

  // Kill session first (stops it)
  await multiplexer.killSession(sessionName);

  // Then delete it (removes from list)
  await multiplexer.deleteSession(sessionName);
}

interface DestroyOptions {
  force: boolean;
  keepBranch: boolean;
}

async function cleanupTemporalNamespaces(envName: string): Promise<void> {
  logger.step("Removing Temporal namespaces...");

  const status = await isTemporalServerRunning();
  if (!status.running) {
    logger.info("Temporal is not running, skipping namespace deletion");
    return;
  }

  const temporalPath = Bun.which("temporal");
  if (!temporalPath) {
    logger.warn(
      `temporal CLI not found in PATH, skipping namespace deletion. ${getInstallInstructions("temporal")}`
    );
    return;
  }

  const namespaces = getTemporalNamespaces(envName);
  const failures: { namespace: string; error: string }[] = [];

  for (const namespace of namespaces) {
    const proc = Bun.spawn(
      [temporalPath, "operator", "namespace", "delete", "-n", namespace, "-y"],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;

    if (proc.exitCode !== 0) {
      const message = stderr.trim() || stdout.trim() || `exit code ${proc.exitCode}`;
      const messageLower = message.toLowerCase();
      const namespaceNotFound =
        messageLower.includes("namespace") && messageLower.includes("not found");
      if (namespaceNotFound) {
        continue;
      }
      failures.push({ namespace, error: message });
    }
  }

  if (failures.length === 0) {
    logger.success("Temporal namespaces removed");
    return;
  }

  logger.warn(
    `Could not remove Temporal namespaces: ${failures
      .map(({ namespace, error }) => `${namespace} (${error})`)
      .join(", ")}`
  );
}

async function cleanupDocker(envName: string): Promise<void> {
  const dockerRunning = await isDockerRunning(envName);
  let needsVolumeCleanup = !dockerRunning;

  if (dockerRunning) {
    const dockerStopped = await stopDocker(envName, { removeVolumes: true });
    needsVolumeCleanup = !dockerStopped;
  }

  if (needsVolumeCleanup) {
    const failedVolumes = await removeDockerVolumes(envName);
    if (failedVolumes.length > 0) {
      logger.warn(`Could not remove volumes: ${failedVolumes.join(", ")}`);
    }
  }
}

// Destroy a single environment (internal helper)
async function destroySingleEnvironment(
  env: Environment,
  options: DestroyOptions,
  settings: Settings
): Promise<Result<void>> {
  const worktreePath = getWorktreeDir(env.name, env.metadata.repoRoot);

  // Check for uncommitted changes (unless --force)
  if (!options.force) {
    const worktreeExists = await directoryExists(worktreePath);
    if (worktreeExists) {
      const hasChanges = await hasUncommittedChanges(worktreePath);
      if (hasChanges) {
        return Err(
          new CommandError(
            `Environment '${env.name}' has uncommitted changes. Use --force to destroy anyway.`
          )
        );
      }
    }
  }

  logger.info(`Destroying environment '${env.name}'...`);
  console.log();

  const portServices: ServiceName[] = ["front", "core", "connectors", "oauth"];
  const servicePids = await Promise.all(portServices.map((service) => readPid(env.name, service)));
  const allowedPids = new Set(servicePids.filter((pid): pid is number => pid !== null));

  // Stop all services
  logger.step("Stopping all services...");
  await stopAllServices(env.name);

  // Clean up multiplexer session
  logger.step("Cleaning up multiplexer session...");
  await cleanupMultiplexerSession(env.name);

  // Force cleanup any orphaned processes on service ports
  const { killedPorts, blockedPorts } = await cleanupServicePorts(env.ports, {
    allowedPids,
    force: options.force,
  });
  if (blockedPorts.length > 0) {
    const details = formatBlockedPorts(blockedPorts);
    return Err(
      new CommandError(
        `Ports in use by other processes: ${details}. Stop them or rerun destroy with --force to terminate.`
      )
    );
  }
  if (killedPorts.length > 0) {
    logger.warn(`Killed processes on ports: ${killedPorts.join(", ")}`);
  }
  logger.success("All services stopped");

  await cleanupTemporalNamespaces(env.name);

  // Stop Docker and remove volumes
  await cleanupDocker(env.name);

  // Drop test database
  logger.step("Dropping test database...");
  const testDbResult = await dropTestDatabase(env.name);
  if (testDbResult.success) {
    logger.success("Test database dropped");
  } else {
    logger.warn(`Could not drop test database: ${testDbResult.error}`);
  }

  // Remove git worktree
  logger.step("Removing git worktree...");
  await removeWorktree(env.metadata.repoRoot, worktreePath);
  logger.success("Git worktree removed");

  // Delete the workspace branch (unless --keep-branch is specified)
  if (!options.keepBranch) {
    logger.step(`Deleting branch '${env.metadata.workspaceBranch}'...`);
    await deleteBranch(env.metadata.repoRoot, env.metadata.workspaceBranch, settings);
    logger.success("Branch deleted");
  } else {
    logger.info(`Keeping branch '${env.metadata.workspaceBranch}'`);
  }

  // Remove environment directory
  logger.step("Removing environment config...");
  await deleteEnvironmentDir(env.name);
  logger.success("Environment config removed");

  console.log();
  logger.success(`Environment '${env.name}' destroyed`);
  console.log();

  return Ok(undefined);
}

export async function destroyCommand(
  namesArg: EnvironmentNameArg,
  options?: Partial<DestroyOptions>
): Promise<Result<void>> {
  const resolvedOptions: DestroyOptions = { force: false, keepBranch: false, ...options };
  const names = normalizeEnvironmentNames(namesArg);

  // Load settings for git-spice support
  const settings = await loadSettings();

  const envsResult =
    names.length > 0 ? await resolveExplicitDestroyEnvs(names) : await selectDestroyEnvs();
  if (!envsResult.ok) return envsResult;

  return destroyEnvironments(envsResult.value, resolvedOptions, settings);
}

async function selectDestroyEnvs(): Promise<Result<Environment[]>> {
  // No name provided - use multi-select for batch destruction
  const selectedNames = await selectMultipleEnvironments({
    message: "Select environments to destroy (space to toggle, enter to confirm)",
    confirmMessage: "Destroy {count} environment(s): {names}?",
  });

  // Restore terminal after interactive prompt
  restoreTerminal();

  if (selectedNames.length === 0) {
    return Err(new CommandError("No environments selected"));
  }

  return resolveSelectedDestroyEnvs(selectedNames);
}

async function resolveExplicitDestroyEnvs(names: string[]): Promise<Result<Environment[]>> {
  const envs: Environment[] = [];
  for (const name of names) {
    const envResult = await requireEnvironment(name, "destroy");
    if (!envResult.ok) return envResult;
    envs.push(envResult.value);
  }

  return Ok(envs);
}

async function resolveSelectedDestroyEnvs(selectedNames: string[]): Promise<Result<Environment[]>> {
  // Resolve all environments first
  const envs: Environment[] = [];
  for (const envName of selectedNames) {
    const env = await getEnvironment(envName);
    if (!env) {
      return Err(new CommandError(`Environment '${envName}' not found`));
    }
    envs.push(env);
  }

  return Ok(envs);
}

async function destroyEnvironments(
  envs: Environment[],
  options: DestroyOptions,
  settings: Settings
): Promise<Result<void>> {
  // Destroy each environment sequentially
  for (const env of envs) {
    const result = await destroySingleEnvironment(env, options, settings);
    if (!result.ok) {
      return result;
    }
  }

  if (envs.length > 1) {
    logger.success(`All ${envs.length} environments destroyed`);
    console.log();
  }

  return Ok(undefined);
}
