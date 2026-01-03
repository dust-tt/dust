import { getDockerProjectName, getVolumeNames } from "../lib/docker";
import { deleteEnvironmentDir, getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import { getDockerOverridePath, getWorktreeDir } from "../lib/paths";
import { stopAllServices } from "../lib/process";
import { isDockerRunning } from "../lib/state";

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

// Check for uncommitted changes in worktree
async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "status", "--porcelain"], {
    cwd: worktreePath,
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return output.trim().length > 0;
}

// Stop docker-compose
async function stopDocker(envName: string, repoRoot: string): Promise<void> {
  logger.step("Stopping Docker containers...");

  const projectName = getDockerProjectName(envName);
  const overridePath = getDockerOverridePath(envName);
  const basePath = `${repoRoot}/tools/docker-compose.dust-hive.yml`;

  const proc = Bun.spawn(
    ["docker", "compose", "-f", basePath, "-f", overridePath, "-p", projectName, "down", "-v"],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  await proc.exited;

  if (proc.exitCode === 0) {
    logger.success("Docker containers and volumes removed");
  } else {
    logger.warn("Docker containers may not have stopped cleanly");
  }
}

// Remove docker volumes (in case docker-compose down -v didn't work)
async function removeDockerVolumes(envName: string): Promise<void> {
  const volumes = getVolumeNames(envName);

  for (const volume of volumes) {
    const proc = Bun.spawn(["docker", "volume", "rm", "-f", volume], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
  }
}

// Remove git worktree
async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  logger.step("Removing git worktree...");

  // Force remove worktree
  const proc = Bun.spawn(["git", "worktree", "remove", "--force", worktreePath], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode === 0) {
    logger.success("Git worktree removed");
  } else {
    logger.warn("Git worktree may not have been removed cleanly");
  }
}

// Delete the workspace branch
async function deleteBranch(repoRoot: string, branchName: string): Promise<void> {
  logger.step(`Deleting branch '${branchName}'...`);

  const proc = Bun.spawn(["git", "branch", "-D", branchName], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode === 0) {
    logger.success("Branch deleted");
  } else {
    logger.warn("Branch may not have been deleted");
  }
}

export async function destroyCommand(args: string[]): Promise<void> {
  const { name, options } = parseArgs(args);

  if (!name) {
    logger.error("Usage: dust-hive destroy NAME [--force]");
    process.exit(1);
  }

  // Get environment
  const env = await getEnvironment(name);
  if (!env) {
    logger.error(`Environment '${name}' not found`);
    process.exit(1);
  }

  const worktreePath = getWorktreeDir(name);

  // Check for uncommitted changes (unless --force)
  if (!options.force) {
    const worktreeExists = await Bun.file(worktreePath).exists();
    if (worktreeExists) {
      const hasChanges = await hasUncommittedChanges(worktreePath);
      if (hasChanges) {
        logger.error("Worktree has uncommitted changes. Use --force to destroy anyway.");
        process.exit(1);
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
  const dockerRunning = await isDockerRunning(name);
  if (dockerRunning) {
    await stopDocker(name, env.metadata.repoRoot);
  } else {
    // Just remove volumes in case they exist
    await removeDockerVolumes(name);
  }

  // Remove git worktree
  await removeWorktree(env.metadata.repoRoot, worktreePath);

  // Delete the workspace branch
  await deleteBranch(env.metadata.repoRoot, env.metadata.workspaceBranch);

  // Remove environment directory
  logger.step("Removing environment config...");
  await deleteEnvironmentDir(name);
  logger.success("Environment config removed");

  console.log();
  logger.success(`Environment '${name}' destroyed`);
  console.log();
}
