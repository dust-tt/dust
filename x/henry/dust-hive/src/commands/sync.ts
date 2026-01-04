// Sync command - update main repo cache source with latest main, rebuild binaries, refresh node_modules

import { ALL_BINARIES, buildBinaries, getCacheSource, setCacheSource } from "../lib/cache";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";

// Check if repo has uncommitted changes
async function hasUncommittedChanges(repoRoot: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "status", "--porcelain"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output.trim().length > 0;
}

// Get current branch name
async function getCurrentBranch(repoRoot: string): Promise<string | null> {
  const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    return null;
  }
  return output.trim();
}

// Run git fetch
async function gitFetch(repoRoot: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "fetch", "origin"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Switch to main and pull
async function switchToMain(repoRoot: string): Promise<boolean> {
  const checkout = Bun.spawn(["git", "checkout", "main"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  await checkout.exited;
  if (checkout.exitCode !== 0) {
    return false;
  }

  const pull = Bun.spawn(["git", "pull", "origin", "main"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  await pull.exited;
  return pull.exitCode === 0;
}

// Run npm ci in a directory
async function runNpmCi(dir: string): Promise<boolean> {
  const proc = Bun.spawn(["npm", "ci", "--prefer-offline"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

export async function syncCommand(): Promise<Result<void>> {
  const startTime = Date.now();

  // Find repo root (or use existing cache source)
  let repoRoot = await getCacheSource();
  if (!repoRoot) {
    repoRoot = await findRepoRoot();
  }

  if (!repoRoot) {
    return Err(
      new CommandError(
        "Not in a git repository and no cache source configured. Run from within the Dust repo."
      )
    );
  }

  logger.info(`Syncing cache source: ${repoRoot}`);
  console.log();

  // Check for uncommitted changes
  logger.step("Checking for uncommitted changes...");
  const hasChanges = await hasUncommittedChanges(repoRoot);
  if (hasChanges) {
    return Err(
      new CommandError("Repository has uncommitted changes. Commit or stash them before syncing.")
    );
  }
  logger.success("Working directory clean");

  // Get current branch for reporting
  const currentBranch = await getCurrentBranch(repoRoot);

  // Fetch from origin
  logger.step("Fetching from origin...");
  const fetched = await gitFetch(repoRoot);
  if (!fetched) {
    return Err(new CommandError("Failed to fetch from origin"));
  }
  logger.success("Fetched latest changes");

  // Switch to main and pull
  logger.step("Switching to main and pulling...");
  const switched = await switchToMain(repoRoot);
  if (!switched) {
    return Err(new CommandError("Failed to switch to main branch"));
  }
  if (currentBranch && currentBranch !== "main") {
    logger.success(`Switched from '${currentBranch}' to 'main'`);
  } else {
    logger.success("Updated main branch");
  }

  // Update cache source
  await setCacheSource(repoRoot);

  // Run npm ci in all project directories (parallel)
  logger.step("Installing node dependencies (npm ci)...");
  console.log();

  const dirs = [
    { name: "sdks/js", path: `${repoRoot}/sdks/js` },
    { name: "front", path: `${repoRoot}/front` },
    { name: "connectors", path: `${repoRoot}/connectors` },
  ];

  const results = await Promise.all(
    dirs.map(async ({ name, path }) => {
      logger.step(`  ${name}...`);
      const success = await runNpmCi(path);
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
    return Err(new CommandError(`npm ci failed in: ${failed.map((r) => r.name).join(", ")}`));
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  logger.success(`Sync complete! (${elapsed}s)`);
  console.log();
  console.log("Your cache source is now up to date with latest main.");
  console.log("New environments will use these fresh dependencies and binaries.");
  console.log();

  return Ok(undefined);
}
