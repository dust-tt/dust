import { removeDockerVolumes, stopDocker } from "../lib/docker";
import { deleteEnvironmentDir, getEnvironment } from "../lib/environment";
import { directoryExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { cleanupServicePorts } from "../lib/ports";
import { readPid, stopAllServices } from "../lib/process";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import type { ServiceName } from "../lib/services";
import { isDockerRunning } from "../lib/state";
import { deleteBranch, hasUncommittedChanges, removeWorktree } from "../lib/worktree";

interface DestroyOptions {
  force: boolean;
}

async function cleanupDocker(envName: string, repoRoot: string): Promise<void> {
  const dockerRunning = await isDockerRunning(envName);
  let needsVolumeCleanup = !dockerRunning;

  if (dockerRunning) {
    const dockerStopped = await stopDocker(envName, repoRoot, { removeVolumes: true });
    needsVolumeCleanup = !dockerStopped;
  }

  if (needsVolumeCleanup) {
    const failedVolumes = await removeDockerVolumes(envName);
    if (failedVolumes.length > 0) {
      logger.warn(`Could not remove volumes: ${failedVolumes.join(", ")}`);
    }
  }
}

export async function destroyCommand(
  name: string | undefined,
  options?: Partial<DestroyOptions>
): Promise<Result<void>> {
  const resolvedOptions: DestroyOptions = { force: false, ...options };
  if (!name) {
    return Err(new CommandError("Usage: dust-hive destroy NAME [--force]"));
  }

  // Get environment
  const env = await getEnvironment(name);
  if (!env) {
    return Err(new CommandError(`Environment '${name}' not found`));
  }

  const worktreePath = getWorktreeDir(name);

  // Check for uncommitted changes (unless --force)
  if (!resolvedOptions.force) {
    const worktreeExists = await directoryExists(worktreePath);
    if (worktreeExists) {
      const hasChanges = await hasUncommittedChanges(worktreePath);
      if (hasChanges) {
        return Err(
          new CommandError("Worktree has uncommitted changes. Use --force to destroy anyway.")
        );
      }
    }
  }

  logger.info(`Destroying environment '${name}'...`);
  console.log();

  const portServices: ServiceName[] = ["front", "core", "connectors", "oauth"];
  const servicePids = await Promise.all(portServices.map((service) => readPid(name, service)));
  const allowedPids = new Set(servicePids.filter((pid): pid is number => pid !== null));

  // Stop all services
  logger.step("Stopping all services...");
  await stopAllServices(name);

  // Force cleanup any orphaned processes on service ports
  const { killedPorts, blockedPorts } = await cleanupServicePorts(env.ports, {
    allowedPids,
    force: resolvedOptions.force,
  });
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
        `Ports in use by other processes: ${details}. Stop them or rerun destroy with --force to terminate.`
      )
    );
  }
  if (killedPorts.length > 0) {
    logger.warn(`Killed processes on ports: ${killedPorts.join(", ")}`);
  }
  logger.success("All services stopped");

  // Stop Docker and remove volumes
  await cleanupDocker(name, env.metadata.repoRoot);

  // Remove git worktree
  logger.step("Removing git worktree...");
  await removeWorktree(env.metadata.repoRoot, worktreePath);
  logger.success("Git worktree removed");

  // Delete the workspace branch
  logger.step(`Deleting branch '${env.metadata.workspaceBranch}'...`);
  await deleteBranch(env.metadata.repoRoot, env.metadata.workspaceBranch);
  logger.success("Branch deleted");

  // Remove environment directory
  logger.step("Removing environment config...");
  await deleteEnvironmentDir(name);
  logger.success("Environment config removed");

  console.log();
  logger.success(`Environment '${name}' destroyed`);
  console.log();

  return Ok(undefined);
}
