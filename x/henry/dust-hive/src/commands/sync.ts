// Sync command - rebase current branch on latest main, rebuild binaries, refresh node_modules

import { ALL_BINARIES, buildBinaries, getCacheSource, setCacheSource } from "../lib/cache";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";

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

type RebaseResult = { success: true } | { success: false; conflict: boolean; error: string };

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

// Run npm install in a directory
async function runNpmInstall(dir: string): Promise<boolean> {
  const proc = Bun.spawn(["npm", "install", "--prefer-offline"], {
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

export async function syncCommand(targetBranch?: string): Promise<Result<void>> {
  const startTime = Date.now();
  const branch = targetBranch ?? "main";

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
  if (!currentBranch) {
    return Err(new CommandError("Could not determine current branch"));
  }

  // Fetch from origin
  logger.step("Fetching from origin...");
  const fetched = await gitFetch(repoRoot);
  if (!fetched) {
    return Err(new CommandError("Failed to fetch from origin"));
  }
  logger.success("Fetched latest changes");

  // Rebase current branch on origin/<branch>
  logger.step(`Rebasing '${currentBranch}' on origin/${branch}...`);
  const rebaseResult = await rebaseOnBranch(repoRoot, branch);
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
  logger.success(`Rebased '${currentBranch}' on latest ${branch}`);

  // Update cache source
  await setCacheSource(repoRoot);

  // Run npm install in all project directories (parallel)
  logger.step("Updating node dependencies...");
  console.log();

  const dirs = [
    { name: "sdks/js", path: `${repoRoot}/sdks/js` },
    { name: "front", path: `${repoRoot}/front` },
    { name: "connectors", path: `${repoRoot}/connectors` },
  ];

  const results = await Promise.all(
    dirs.map(async ({ name, path }) => {
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

  // Link dust-hive globally
  logger.step("Linking dust-hive...");
  const dustHiveDir = `${repoRoot}/x/henry/dust-hive`;
  const linkSuccess = await runBunLink(dustHiveDir);
  if (!linkSuccess) {
    return Err(new CommandError("Failed to run bun link for dust-hive"));
  }
  logger.success("dust-hive linked globally");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  logger.success(`Sync complete! (${elapsed}s)`);
  console.log();
  console.log(`Branch '${currentBranch}' is now rebased on latest ${branch}.`);
  console.log("Dependencies and binaries are up to date.");
  console.log();

  return Ok(undefined);
}
