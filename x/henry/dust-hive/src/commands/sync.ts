// Sync command - rebase current branch on latest main, rebuild binaries, refresh node_modules

import { ALL_BINARIES, buildBinaries, getCacheSource, setCacheSource } from "../lib/cache";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { runNpmInstall } from "../lib/setup";
import { getCurrentBranch } from "../lib/worktree";

export interface SyncOptions {
  targetBranch?: string;
  switch?: boolean;
}

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

type RebaseResult = { success: true } | { success: false; conflict: boolean; error: string };

// Checkout a branch and pull latest
async function checkoutAndPull(
  repoRoot: string,
  branch: string
): Promise<{ success: boolean; error?: string }> {
  // Checkout the branch
  const checkoutProc = Bun.spawn(["git", "checkout", branch], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const checkoutStderr = await new Response(checkoutProc.stderr).text();
  await checkoutProc.exited;

  if (checkoutProc.exitCode !== 0) {
    return { success: false, error: checkoutStderr };
  }

  // Pull latest
  const pullProc = Bun.spawn(["git", "pull", "--rebase"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const pullStderr = await new Response(pullProc.stderr).text();
  await pullProc.exited;

  if (pullProc.exitCode !== 0) {
    return { success: false, error: pullStderr };
  }

  return { success: true };
}

// Rebase current branch on origin/<branch>
async function rebaseOnBranch(repoRoot: string, branch: string): Promise<RebaseResult> {
  const proc = Bun.spawn(["git", "rebase", `origin/${branch}`], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode === 0) {
    return { success: true };
  }

  // Check if it's a conflict
  const isConflict =
    stderr.includes("CONFLICT") ||
    stderr.includes("could not apply") ||
    stderr.includes("Resolve all conflicts");

  return { success: false, conflict: isConflict, error: stderr };
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration function with multiple steps
export async function syncCommand(options: SyncOptions = {}): Promise<Result<void>> {
  const startTimeMs = Date.now();

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
  let currentBranch: string;
  try {
    currentBranch = await getCurrentBranch(repoRoot);
  } catch {
    return Err(new CommandError("Could not determine current branch"));
  }

  // Determine target branch (default to main)
  const targetBranch = options.targetBranch ?? "main";

  // Fetch from origin
  logger.step("Fetching from origin...");
  const fetched = await gitFetch(repoRoot);
  if (!fetched) {
    return Err(new CommandError("Failed to fetch from origin"));
  }
  logger.success("Fetched latest changes");

  // Sync to target branch
  if (options.switch) {
    // --switch: checkout target branch and pull
    logger.step(`Switching to '${targetBranch}' and pulling latest...`);
    const switchResult = await checkoutAndPull(repoRoot, targetBranch);
    if (!switchResult.success) {
      return Err(new CommandError(`Failed to switch to ${targetBranch}: ${switchResult.error}`));
    }
    logger.success(`Switched to '${targetBranch}' with latest changes`);
  } else {
    // Rebase current branch on origin/<targetBranch>
    logger.step(`Rebasing '${currentBranch}' on origin/${targetBranch}...`);
    const rebaseResult = await rebaseOnBranch(repoRoot, targetBranch);
    if (!rebaseResult.success) {
      if (rebaseResult.conflict) {
        console.log();
        logger.error("Rebase failed due to conflicts.");
        console.log();
        console.log("To resolve:");
        console.log("  1. Fix the conflicts in the listed files");
        console.log("  2. Stage your changes: git add <files>");
        console.log("  3. Continue the rebase: git rebase --continue");
        console.log("  4. Run dust-hive sync again");
        console.log();
        console.log("Or abort the rebase: git rebase --abort");
        return Err(new CommandError("Rebase conflicts - resolve and run sync again"));
      }
      return Err(new CommandError(`Rebase failed: ${rebaseResult.error}`));
    }
    logger.success(`Rebased '${currentBranch}' on latest ${targetBranch}`);
  }

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

  // Install and link dust-hive globally (only on main)
  logger.step(`Installing ${dustHiveDir.name} dependencies...`);
  const installSuccess = await runBunInstall(dustHiveDir.path);
  if (!installSuccess) {
    return Err(new CommandError("Failed to run bun install for dust-hive"));
  }
  logger.success(`${dustHiveDir.name} dependencies installed`);

  // Only bun link when we're actually on main's code
  // With --switch: we end up on targetBranch
  // Without --switch: we stay on currentBranch (just rebased)
  const finalBranch = options.switch ? targetBranch : currentBranch;
  if (finalBranch === "main") {
    logger.step(`Linking ${dustHiveDir.name}...`);
    const linkSuccess = await runBunLink(dustHiveDir.path);
    if (!linkSuccess) {
      return Err(new CommandError("Failed to run bun link for dust-hive"));
    }
    logger.success("dust-hive linked globally");
  } else {
    logger.info("Skipping bun link (only done when on main branch)");
  }

  const elapsed = ((Date.now() - startTimeMs) / 1000).toFixed(1);
  console.log();
  logger.success(`Sync complete! (${elapsed}s)`);
  console.log();
  if (options.switch) {
    console.log(`Now on '${targetBranch}' with latest changes.`);
  } else {
    console.log(`Branch '${currentBranch}' is now rebased on latest ${targetBranch}.`);
  }
  console.log("Dependencies and binaries are up to date.");
  console.log();

  return Ok(undefined);
}
