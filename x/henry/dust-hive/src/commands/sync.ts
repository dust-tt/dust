// Sync command - pull latest main, rebuild binaries, refresh node_modules

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  ALL_BINARIES,
  type Binary,
  type SyncState,
  binaryExists,
  buildBinaries,
  coreChangedBetweenCommits,
  getHeadCommit,
  getSyncState,
  hashFile,
  saveSyncState,
  setCacheSource,
} from "../lib/cache";
import { getEnvironment, listEnvironments } from "../lib/environment";
import { directoryExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { isServiceRunning, stopService } from "../lib/process";
import { startService } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { runNpmInstall } from "../lib/setup";
import {
  getCurrentBranch,
  getMainRepoPath,
  hasUncommittedChanges,
  isWorktree,
} from "../lib/worktree";

export interface SyncOptions {
  force?: boolean;
}

type NpmDir = "sdks/js" | "front" | "connectors";

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

// Copy directory recursively
async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await cp(srcPath, destPath);
    }
  }
}

// Install Claude Code skills to repo root
async function installClaudeSkills(repoRoot: string): Promise<boolean> {
  const dustHiveClaudeDir = join(repoRoot, "x/henry/dust-hive/.claude");
  const repoClaudeDir = join(repoRoot, ".claude");

  // Check if source .claude directory exists
  if (!(await directoryExists(dustHiveClaudeDir))) {
    return true; // Nothing to install
  }

  // Copy skills directory (fully replacing dust-hive skill if it exists)
  const skillsSrc = join(dustHiveClaudeDir, "skills");
  const skillsDest = join(repoClaudeDir, "skills");
  if (await directoryExists(skillsSrc)) {
    // Remove existing dust-hive skill to ensure clean replacement
    const dustHiveSkillDest = join(skillsDest, "dust-hive");
    if (await directoryExists(dustHiveSkillDest)) {
      await rm(dustHiveSkillDest, { recursive: true });
    }
    await copyDir(skillsSrc, skillsDest);
  }

  return true;
}

// Check if any binaries are missing
async function checkMissingBinaries(repoRoot: string): Promise<Binary[]> {
  const missing: Binary[] = [];
  for (const binary of ALL_BINARIES) {
    if (!(await binaryExists(repoRoot, binary))) {
      missing.push(binary);
    }
  }
  return missing;
}

// Check preconditions for sync command
async function checkSyncPreconditions(repoRoot: string): Promise<Result<void>> {
  // Must be run from main repo, not a worktree
  const inWorktree = await isWorktree(repoRoot);
  if (inWorktree) {
    const mainRepo = await getMainRepoPath(repoRoot);
    return Err(
      new CommandError(`Cannot sync from a worktree. Run sync from the main repo: cd ${mainRepo}`)
    );
  }

  // Must be on main branch
  const currentBranch = await getCurrentBranch(repoRoot);
  if (currentBranch !== "main") {
    return Err(
      new CommandError(
        `Cannot sync from branch '${currentBranch}'. Checkout main first: git checkout main`
      )
    );
  }

  // Must have clean working directory (ignoring untracked files)
  logger.step("Checking for uncommitted changes...");
  const hasChanges = await hasUncommittedChanges(repoRoot, { ignoreUntracked: true });
  if (hasChanges) {
    return Err(
      new CommandError("Repository has uncommitted changes. Commit or stash them before syncing.")
    );
  }
  logger.success("Working directory clean");

  return Ok(undefined);
}

// Determine which npm directories need updating based on lock file changes
function getNpmDirsToUpdate(
  npmDirs: { name: NpmDir; path: string }[],
  npmHashes: { name: NpmDir; hash: string | null }[],
  savedState: SyncState | null,
  force: boolean
): { name: NpmDir; path: string }[] {
  if (force || !savedState) {
    return [...npmDirs];
  }

  const dirsToUpdate: { name: NpmDir; path: string }[] = [];
  for (const { name, hash } of npmHashes) {
    const savedHash = savedState.npm[name];
    if (hash !== savedHash) {
      const dir = npmDirs.find((d) => d.name === name);
      if (dir) {
        dirsToUpdate.push(dir);
      }
    }
  }
  return dirsToUpdate;
}

// Check if cargo build is needed
async function checkNeedsCargoBuild(
  repoRoot: string,
  savedState: SyncState | null,
  headAfterPull: string | null,
  force: boolean
): Promise<boolean> {
  if (force || !savedState) {
    return true;
  }

  // Check if core/ changed between last synced commit and current HEAD
  if (headAfterPull && savedState.lastCommit) {
    const coreChanged = await coreChangedBetweenCommits(
      repoRoot,
      savedState.lastCommit,
      headAfterPull
    );
    if (coreChanged) {
      return true;
    }
  }

  // Check if any binaries are missing
  const missingBinaries = await checkMissingBinaries(repoRoot);
  if (missingBinaries.length > 0) {
    logger.info(`Missing binaries: ${missingBinaries.join(", ")}`);
    return true;
  }

  return false;
}

// Run npm install for directories and return error if any fail
async function updateNpmDependencies(
  npmDirsToUpdate: { name: NpmDir; path: string }[]
): Promise<Result<void>> {
  if (npmDirsToUpdate.length === 0) {
    logger.info("Node dependencies up to date (no changes detected)");
    return Ok(undefined);
  }

  logger.step("Updating node dependencies...");
  console.log();

  const results = await Promise.all(
    npmDirsToUpdate.map(async ({ name, path }) => {
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
  logger.success(`Updated ${npmDirsToUpdate.length} node package(s)`);
  return Ok(undefined);
}

// Build Rust binaries if needed
async function updateRustBinaries(repoRoot: string, needsBuild: boolean): Promise<Result<void>> {
  if (!needsBuild) {
    logger.info("Rust binaries up to date (no changes in core/)");
    return Ok(undefined);
  }

  logger.step("Building Rust binaries...");
  const buildResult = await buildBinaries(repoRoot, [...ALL_BINARIES]);
  if (!buildResult.success) {
    return Err(new CommandError(`Failed to build binaries: ${buildResult.failed.join(", ")}`));
  }
  logger.success(`Built ${buildResult.built.length} binaries`);
  return Ok(undefined);
}

// Restart SDK watchers in all running environments
// This ensures environments pick up SDK changes after git pull
// Note: We don't wait for the SDK to finish building - just signal the restart
async function restartRunningSDKWatchers(): Promise<number> {
  const envNames = await listEnvironments();
  let restartedCount = 0;

  for (const envName of envNames) {
    if (await isServiceRunning(envName, "sdk")) {
      const env = await getEnvironment(envName);
      if (env) {
        logger.info(`  Restarting SDK in '${envName}'...`);
        await stopService(envName, "sdk");
        await startService(env, "sdk");
        restartedCount++;
      }
    }
  }

  return restartedCount;
}

// Install and link dust-hive if needed
async function updateDustHive(dustHivePath: string, needsInstall: boolean): Promise<Result<void>> {
  if (!needsInstall) {
    logger.info("dust-hive dependencies up to date (no changes detected)");
    return Ok(undefined);
  }

  logger.step("Installing x/henry/dust-hive dependencies...");
  const installSuccess = await runBunInstall(dustHivePath);
  if (!installSuccess) {
    return Err(new CommandError("Failed to run bun install for dust-hive"));
  }
  logger.success("x/henry/dust-hive dependencies installed");

  logger.step("Linking x/henry/dust-hive...");
  const linkSuccess = await runBunLink(dustHivePath);
  if (!linkSuccess) {
    return Err(new CommandError("Failed to run bun link for dust-hive"));
  }
  logger.success("dust-hive linked globally");
  return Ok(undefined);
}

// Build new sync state from current hashes
function buildSyncState(
  npmHashes: { name: NpmDir; hash: string | null }[],
  bunHash: string | null,
  headAfterPull: string | null
): SyncState {
  const npmState: SyncState["npm"] = {};
  for (const { name, hash } of npmHashes) {
    if (hash) {
      npmState[name] = hash;
    }
  }

  const newState: SyncState = { npm: npmState };
  if (bunHash) newState.bun = bunHash;
  if (headAfterPull) newState.lastCommit = headAfterPull;
  return newState;
}

export async function syncCommand(options: SyncOptions = {}): Promise<Result<void>> {
  const startTimeMs = Date.now();
  const force = options.force ?? false;

  // Find repo root
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    return Err(new CommandError("Not in a git repository. Run from within the Dust repo."));
  }

  // Check preconditions
  const preconditionResult = await checkSyncPreconditions(repoRoot);
  if (!preconditionResult.ok) {
    return preconditionResult;
  }

  logger.info(`Syncing: ${repoRoot}${force ? " (forced)" : ""}`);
  console.log();

  // Capture state before pull for change detection
  const savedState = await getSyncState();

  // Pull latest main
  logger.step("Pulling latest main...");
  const pullResult = await gitPull(repoRoot);
  if (!pullResult.success) {
    return Err(new CommandError(`Failed to pull: ${pullResult.error}`));
  }
  logger.success("Pulled latest changes");

  // Update cache source
  await setCacheSource(repoRoot);

  // Get current commit after pull
  const headAfterPull = await getHeadCommit(repoRoot);

  // Define directories
  const npmDirs: { name: NpmDir; path: string }[] = [
    { name: "sdks/js", path: `${repoRoot}/sdks/js` },
    { name: "front", path: `${repoRoot}/front` },
    { name: "connectors", path: `${repoRoot}/connectors` },
  ];
  const dustHiveDir = `${repoRoot}/x/henry/dust-hive`;

  // Hash all lock files in parallel
  const [npmHashes, bunHash] = await Promise.all([
    Promise.all(
      npmDirs.map(async ({ name, path }) => ({
        name,
        hash: await hashFile(`${path}/package-lock.json`),
      }))
    ),
    hashFile(`${dustHiveDir}/bun.lockb`),
  ]);

  // Determine what needs updating
  const npmDirsToUpdate = getNpmDirsToUpdate(npmDirs, npmHashes, savedState, force);
  const needsCargoBuild = await checkNeedsCargoBuild(repoRoot, savedState, headAfterPull, force);
  const needsBunInstall = force || !savedState || bunHash !== savedState.bun;

  // Run npm install for changed directories
  const npmResult = await updateNpmDependencies(npmDirsToUpdate);
  if (!npmResult.ok) {
    return npmResult;
  }

  // Build Rust binaries if needed
  const rustResult = await updateRustBinaries(repoRoot, needsCargoBuild);
  if (!rustResult.ok) {
    return rustResult;
  }

  // Install and link dust-hive if needed
  const dustHiveResult = await updateDustHive(dustHiveDir, needsBunInstall);
  if (!dustHiveResult.ok) {
    return dustHiveResult;
  }

  // Save new sync state
  const newState = buildSyncState(npmHashes, bunHash, headAfterPull);
  await saveSyncState(newState);

  // Install Claude Code skills and commands
  logger.step("Installing Claude Code skills...");
  const skillsInstalled = await installClaudeSkills(repoRoot);
  if (!skillsInstalled) {
    return Err(new CommandError("Failed to install Claude Code skills"));
  }
  logger.success("Claude Code skills installed");

  // Restart SDK watchers in running environments
  // nodemon may not detect file changes from git pull/rebase
  logger.step("Restarting SDK watchers in running environments...");
  const restartedCount = await restartRunningSDKWatchers();
  if (restartedCount > 0) {
    logger.success(`Restarted SDK in ${restartedCount} environment(s)`);
  } else {
    logger.info("No running environments with SDK watchers");
  }

  const elapsedSec = ((Date.now() - startTimeMs) / 1000).toFixed(1);
  console.log();
  logger.success(`Sync complete! (${elapsedSec}s)`);
  console.log();
  console.log("Dependencies and binaries are up to date.");
  console.log();

  return Ok(undefined);
}
