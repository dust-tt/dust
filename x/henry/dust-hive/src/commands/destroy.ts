import { requireEnvironment } from "../lib/commands";
import { removeDockerVolumes, stopDocker } from "../lib/docker";
import { deleteEnvironmentDir } from "../lib/environment";
import { directoryExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { cleanupServicePorts } from "../lib/ports";
import { readPid, stopAllServices } from "../lib/process";
import { confirm, restoreTerminal } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import type { ServiceName } from "../lib/services";
import { isDockerRunning } from "../lib/state";
import { deleteBranch, hasUncommittedChanges, removeWorktree } from "../lib/worktree";

async function cleanupZellijSession(envName: string): Promise<void> {
  const sessionName = `dust-hive-${envName}`;

  // Kill session first (stops it)
  const killProc = Bun.spawn(["zellij", "kill-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await killProc.exited;

  // Then delete it (removes from list)
  const deleteProc = Bun.spawn(["zellij", "delete-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await deleteProc.exited;
}

interface DestroyOptions {
  force: boolean;
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

export async function destroyCommand(
  name: string | undefined,
  options?: Partial<DestroyOptions>
): Promise<Result<void>> {
  const resolvedOptions: DestroyOptions = { force: false, ...options };

  // Track if we used interactive selection (name was not provided)
  const usedSelector = name === undefined;

  const envResult = await requireEnvironment(name, "destroy");
  if (!envResult.ok) return envResult;
  const env = envResult.value;

  // If we used the selector, ask for confirmation before destroying
  if (usedSelector) {
    const confirmed = await confirm(`Destroy environment '${env.name}'?`, false);
    restoreTerminal();

    if (!confirmed) {
      logger.info("Cancelled");
      return Ok(undefined);
    }
  }

  const worktreePath = getWorktreeDir(env.name);

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

  logger.info(`Destroying environment '${env.name}'...`);
  console.log();

  const portServices: ServiceName[] = ["front", "core", "connectors", "oauth"];
  const servicePids = await Promise.all(portServices.map((service) => readPid(env.name, service)));
  const allowedPids = new Set(servicePids.filter((pid): pid is number => pid !== null));

  // Stop all services
  logger.step("Stopping all services...");
  await stopAllServices(env.name);

  // Clean up zellij session
  logger.step("Cleaning up zellij session...");
  await cleanupZellijSession(env.name);

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
  await cleanupDocker(env.name);

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
  await deleteEnvironmentDir(env.name);
  logger.success("Environment config removed");

  console.log();
  logger.success(`Environment '${env.name}' destroyed`);
  console.log();

  return Ok(undefined);
}
