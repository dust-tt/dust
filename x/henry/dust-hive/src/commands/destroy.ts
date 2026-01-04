import { removeDockerVolumes, stopDocker } from "../lib/docker";
import { deleteEnvironmentDir, getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { stopAllServices } from "../lib/process";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { isDockerRunning } from "../lib/state";
import { deleteBranch, hasUncommittedChanges, removeWorktree } from "../lib/worktree";

interface DestroyOptions {
  force: boolean;
}

function parseArgs(args: string[]): { name: string | undefined; options: DestroyOptions } {
  const options: DestroyOptions = { force: false };
  let name: string | undefined;

  for (const arg of args) {
    if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (!arg.startsWith("-")) {
      name = arg;
    }
  }

  return { name, options };
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

export async function destroyCommand(args: string[]): Promise<Result<void>> {
  const { name, options } = parseArgs(args);

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
  if (!options.force) {
    const worktreeExists = await Bun.file(worktreePath).exists();
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

  // Stop all services
  logger.step("Stopping all services...");
  await stopAllServices(name);
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
