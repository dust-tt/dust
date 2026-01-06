// Sync command - pull latest main, rebuild binaries, refresh node_modules

import { ALL_BINARIES, buildBinaries, setCacheSource } from "../lib/cache";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { runNpmInstall } from "../lib/setup";
import { getCurrentBranch, getMainRepoPath, isWorktree } from "../lib/worktree";

// Check if repo has uncommitted changes (ignores untracked files)
async function hasUncommittedChanges(repoRoot: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "status", "--porcelain"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  // Filter out untracked files (lines starting with ??)
  const lines = output
    .trim()
    .split("\n")
    .filter((line) => line && !line.startsWith("??"));
  return lines.length > 0;
}

// Pull latest from origin (with rebase)
async function gitPull(repoRoot: string): Promise<{ success: boolean; error?: string }> {
  const proc = Bun.spawn(["git", "pull", "--rebase"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    return { success: false, error: stderr.trim() };
  }
  return { success: true };
}

// Run bun install in a directory
async function runBunInstall(dir: string): Promise<boolean> {
  const proc = Bun.spawn(["bun", "install"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Run bun link in a directory
async function runBunLink(dir: string): Promise<boolean> {
  const proc = Bun.spawn(["bun", "link"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

export async function syncCommand(): Promise<Result<void>> {
  const startTimeMs = Date.now();

  // Find repo root
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    return Err(new CommandError("Not in a git repository. Run from within the Dust repo."));
  }

  // Precondition: Must be run from main repo, not a worktree
  const inWorktree = await isWorktree(repoRoot);
  if (inWorktree) {
    const mainRepo = await getMainRepoPath(repoRoot);
    return Err(
      new CommandError(`Cannot sync from a worktree. Run sync from the main repo: cd ${mainRepo}`)
    );
  }

  // Precondition: Must be on main branch
  const currentBranch = await getCurrentBranch(repoRoot);
  if (currentBranch !== "main") {
    return Err(
      new CommandError(
        `Cannot sync from branch '${currentBranch}'. Checkout main first: git checkout main`
      )
    );
  }

  // Precondition: Must have clean working directory
  logger.step("Checking for uncommitted changes...");
  const hasChanges = await hasUncommittedChanges(repoRoot);
  if (hasChanges) {
    return Err(
      new CommandError("Repository has uncommitted changes. Commit or stash them before syncing.")
    );
  }
  logger.success("Working directory clean");

  logger.info(`Syncing: ${repoRoot}`);
  console.log();

  // Pull latest main
  logger.step("Pulling latest main...");
  const pullResult = await gitPull(repoRoot);
  if (!pullResult.success) {
    return Err(new CommandError(`Failed to pull: ${pullResult.error}`));
  }
  logger.success("Pulled latest changes");

  // Update cache source
  await setCacheSource(repoRoot);

  // Run npm install in all project directories (parallel)
  logger.step("Updating node dependencies...");
  console.log();

  const npmDirs = [
    { name: "sdks/js", path: `${repoRoot}/sdks/js` },
    { name: "front", path: `${repoRoot}/front` },
    { name: "connectors", path: `${repoRoot}/connectors` },
  ];
  const dustHiveDir = { name: "x/henry/dust-hive", path: `${repoRoot}/x/henry/dust-hive` };

  const results = await Promise.all(
    npmDirs.map(async ({ name, path }) => {
      logger.step(`  ${name}...`);
      const success = await runNpmInstall(path);
      if (success) {
        logger.success(`  ${name} done`);
      } else {
        logger.error(`  ${name} failed`);
      }
      return { name, success };
    })
  );

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    return Err(new CommandError(`npm install failed in: ${failed.map((r) => r.name).join(", ")}`));
  }
  console.log();
  logger.success("All node dependencies installed");

  // Build all Rust binaries
  logger.step("Building Rust binaries...");
  const buildResult = await buildBinaries(repoRoot, [...ALL_BINARIES]);
  if (!buildResult.success) {
    return Err(new CommandError(`Failed to build binaries: ${buildResult.failed.join(", ")}`));
  }
  logger.success(`Built ${buildResult.built.length} binaries`);

  // Install and link dust-hive globally
  logger.step(`Installing ${dustHiveDir.name} dependencies...`);
  const installSuccess = await runBunInstall(dustHiveDir.path);
  if (!installSuccess) {
    return Err(new CommandError("Failed to run bun install for dust-hive"));
  }
  logger.success(`${dustHiveDir.name} dependencies installed`);

  logger.step(`Linking ${dustHiveDir.name}...`);
  const linkSuccess = await runBunLink(dustHiveDir.path);
  if (!linkSuccess) {
    return Err(new CommandError("Failed to run bun link for dust-hive"));
  }
  logger.success("dust-hive linked globally");

  const elapsed = ((Date.now() - startTimeMs) / 1000).toFixed(1);
  console.log();
  logger.success(`Sync complete! (${elapsed}s)`);
  console.log();
  console.log("Dependencies and binaries are up to date.");
  console.log();

  return Ok(undefined);
}
