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
import { directoryExists } from "../lib/fs";
import { isGitSpiceAvailable, repoSyncWithGitSpice } from "../lib/git-spice";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { checkMainRepoPreconditions } from "../lib/repo-preconditions";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { loadSettings } from "../lib/settings";
import { runNpmInstall } from "../lib/setup";

export interface SyncOptions {
  force?: boolean;
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

// Check if npm install needs to run based on root lock file changes
function needsNpmInstall(
  rootLockHash: string | null,
  savedState: SyncState | null,
  force: boolean
): boolean {
  if (force || !savedState) {
    return true;
  }
  return rootLockHash !== savedState.npm.root;
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

// Run npm install at root level if needed
async function updateNpmDependencies(
  repoRoot: string,
  needsUpdate: boolean
): Promise<Result<void>> {
  if (!needsUpdate) {
    logger.info("Node dependencies up to date (no changes detected)");
    return Ok(undefined);
  }

  logger.step("Running npm install at root level...");
  const success = await runNpmInstall(repoRoot);
  if (!success) {
    return Err(new CommandError("npm install failed at root level"));
  }
  logger.success("Node dependencies updated");
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
  rootLockHash: string | null,
  bunHash: string | null,
  headAfterPull: string | null
): SyncState {
  const npmState: SyncState["npm"] = {};
  if (rootLockHash) {
    npmState.root = rootLockHash;
  }

  const newState: SyncState = { npm: npmState };
  if (bunHash) newState.bun = bunHash;
  if (headAfterPull) newState.lastCommit = headAfterPull;
  return newState;
}

// Pull and sync repository (uses git-spice if enabled, otherwise standard git)
async function pullAndSync(repoRoot: string): Promise<Result<void>> {
  const settings = await loadSettings();

  // Use git-spice repo sync if enabled
  if (settings.useGitSpice) {
    const gsAvailable = await isGitSpiceAvailable();
    if (gsAvailable) {
      logger.step("Syncing repository with git-spice...");
      const syncResult = await repoSyncWithGitSpice(repoRoot);
      if (!syncResult.success) {
        return Err(new CommandError(`Failed to sync with git-spice: ${syncResult.error}`));
      }
      logger.success("Repository synced with git-spice");
      return Ok(undefined);
    }
    logger.warn("git-spice not available, falling back to standard git pull");
  }

  // Fall back to standard git pull
  logger.step("Pulling latest main...");
  const pullResult = await gitPull(repoRoot);
  if (!pullResult.success) {
    return Err(new CommandError(`Failed to pull: ${pullResult.error}`));
  }
  logger.success("Pulled latest changes");
  return Ok(undefined);
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
  const preconditionResult = await checkMainRepoPreconditions(repoRoot, { commandName: "sync" });
  if (!preconditionResult.ok) {
    return preconditionResult;
  }

  logger.info(`Syncing: ${repoRoot}${force ? " (forced)" : ""}`);
  console.log();

  // Capture state before pull for change detection
  const savedState = await getSyncState();

  // Pull and sync (uses git-spice if enabled, otherwise standard git)
  const pullResult = await pullAndSync(repoRoot);
  if (!pullResult.ok) {
    return pullResult;
  }

  // Update cache source
  await setCacheSource(repoRoot);

  // Get current commit after pull
  const headAfterPull = await getHeadCommit(repoRoot);

  const dustHiveDir = `${repoRoot}/x/henry/dust-hive`;

  // Hash lock files in parallel
  const [rootLockHash, bunHash] = await Promise.all([
    hashFile(`${repoRoot}/package-lock.json`),
    hashFile(`${dustHiveDir}/bun.lockb`),
  ]);

  // Determine what needs updating
  const needsNpmUpdate = needsNpmInstall(rootLockHash, savedState, force);
  const needsCargoBuild = await checkNeedsCargoBuild(repoRoot, savedState, headAfterPull, force);
  const needsBunInstall = force || !savedState || bunHash !== savedState.bun;

  // Run npm ci at root level if needed
  const npmResult = await updateNpmDependencies(repoRoot, needsNpmUpdate);
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
  const newState = buildSyncState(rootLockHash, bunHash, headAfterPull);
  await saveSyncState(newState);

  // Install Claude Code skills and commands
  logger.step("Installing Claude Code skills...");
  const skillsInstalled = await installClaudeSkills(repoRoot);
  if (!skillsInstalled) {
    return Err(new CommandError("Failed to install Claude Code skills"));
  }
  logger.success("Claude Code skills installed");

  const elapsedSec = ((Date.now() - startTimeMs) / 1000).toFixed(1);
  console.log();
  logger.success(`Sync complete! (${elapsedSec}s)`);
  console.log();
  console.log("Dependencies and binaries are up to date.");
  console.log();

  return Ok(undefined);
}
