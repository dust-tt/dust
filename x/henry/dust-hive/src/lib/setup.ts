// Environment setup operations
// Worktrees live under {repoRoot} so Node module resolution naturally walks up
// to find {repoRoot}/node_modules/. Hive-owned worktrees use
// {repoRoot}/.hives/{name}/; adopted worktrees can use any path under
// {repoRoot}. We only need:
// 1. A small node_modules/@dust-tt/ override so workspace packages resolve
//    from the worktree (not the main repo).
// 2. Shallow copies of workspace-level node_modules (version overrides).
// NOTE: cargo target is symlinked to share Rust compilation cache.

import { mkdirSync, readdirSync, readlinkSync, symlinkSync } from "node:fs";
import { lstat, mkdir, readlink, rm, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { ALL_BINARIES, buildBinaries } from "./cache";
import { hasDirenvIntegration, setupDirenv } from "./direnv";
import { type EnvironmentMetadata, getEnvironmentWorktreeDir } from "./environment";
import { isErrnoException } from "./errors";
import { directoryExists } from "./fs";
import { logger } from "./logger";

// User config directories to copy from main repo to worktree
// These are personal/local files that aren't tracked in git
const USER_CONFIG_DIRS = [".claude"];

// Configuration for how to install each dependency type
export interface DependencyConfig {
  rust: "symlink" | "build";
}

// Setup a shallow copy of node_modules: a real directory with symlinks to
// each package from the source. Unlike a direct symlink, this keeps module
// resolution anchored to the hive path (no symlink target walk-up issues).
function setupShallowNodeModules(srcNodeModules: string, destDir: string): void {
  const target = join(destDir, "node_modules");
  mkdirSync(target, { recursive: true });

  for (const item of readdirSync(srcNodeModules)) {
    symlinkSync(join(srcNodeModules, item), join(target, item));
  }
}

// Setup @dust-tt workspace overrides in hive's node_modules.
// Since worktrees are under the repo root, Node resolution walks up to find
// {repoRoot}/node_modules/ for all packages. But @dust-tt/* packages in
// the root node_modules point to the main repo's workspaces via relative
// symlinks. We override them here to point to the hive's workspaces instead,
// so TypeScript and runtime resolve the worktree's types (not the main repo's).
function setupDustTtOverrides(repoRoot: string, worktreePath: string): void {
  const mainDustTt = join(repoRoot, "node_modules", "@dust-tt");
  const hiveDustTt = join(worktreePath, "node_modules", "@dust-tt");

  mkdirSync(hiveDustTt, { recursive: true });

  for (const pkg of readdirSync(mainDustTt)) {
    const linkTarget = readlinkSync(join(mainDustTt, pkg));
    const absoluteTarget = resolve(mainDustTt, linkTarget);
    const workspaceRelative = absoluteTarget.slice(repoRoot.length + 1);
    symlinkSync(join(worktreePath, workspaceRelative), join(hiveDustTt, pkg));
  }
}

// Symlink cargo target directory to share compilation cache
async function symlinkCargoTarget(srcDir: string, destDir: string): Promise<void> {
  const srcTarget = `${srcDir}/core/target`;
  const destTarget = `${destDir}/core/target`;

  // Check if source target exists
  if (await directoryExists(srcTarget)) {
    // Create symlink (ignore errors if already exists)
    await Bun.spawn(["ln", "-sf", srcTarget, destTarget]).exited;
  }
}

// Find all files matching filename in the repo (excluding node_modules and other large dirs)
// Uses -prune to skip entire directory trees rather than filtering after traversal
async function findAgentsFiles(srcDir: string, filename: string): Promise<string[]> {
  const proc = Bun.spawn(
    [
      "find",
      "-L", // Follow symlinks so -type f matches symlinked files
      srcDir,
      // Prune large directories (skips traversal entirely, much faster than -not -path)
      "-type",
      "d",
      "(",
      "-name",
      "node_modules",
      "-o",
      "-name",
      ".git",
      "-o",
      "-name",
      "target",
      "-o",
      "-name",
      ".next",
      "-o",
      "-name",
      ".turbo",
      "-o",
      "-name",
      ".hives",
      ")",
      "-prune",
      "-o",
      "-name",
      filename,
      "-type",
      "f",
      "-print",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    return [];
  }

  return output
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);
}

// Copy user config files (AGENTS.local.md, AGENTS.override.md files, .claude/) from main repo to worktree
async function copyUserConfigFiles(srcDir: string, destDir: string): Promise<void> {
  // Find and copy all AGENTS.local.md and AGENTS.override.md files, preserving directory structure
  const filenames = ["AGENTS.local.md", "AGENTS.override.md"];
  for (const filename of filenames) {
    const agentsFiles = await findAgentsFiles(srcDir, filename);
    for (const srcPath of agentsFiles) {
      // Get relative path from srcDir
      const relativePath = srcPath.slice(srcDir.length + 1);
      const destPath = `${destDir}/${relativePath}`;
      await Bun.spawn(["cp", srcPath, destPath]).exited;
      logger.success(`Copied ${relativePath}`);
    }
  }

  // Copy directories recursively, merging with existing content
  // Note: We use "cp -r srcPath/. destPath/" to copy CONTENTS rather than the directory itself.
  // This is critical when destPath already exists (e.g., when git creates .claude/ with tracked skills).
  // Without the "/." pattern, cp -r creates a nested srcPath inside destPath.
  for (const dir of USER_CONFIG_DIRS) {
    const srcPath = `${srcDir}/${dir}`;
    const destPath = `${destDir}/${dir}`;
    if (await directoryExists(srcPath)) {
      await mkdir(destPath, { recursive: true });
      await Bun.spawn(["cp", "-r", `${srcPath}/.`, destPath]).exited;
      logger.success(`Copied ${dir}/`);
    }
  }

  await setupCodexConfigAlias(destDir);
}

// Run npm install in a directory
export async function runNpmInstall(
  dir: string,
  options?: { preferOffline?: boolean }
): Promise<boolean> {
  const args = ["install"];
  if (options?.preferOffline) {
    args.push("--prefer-offline");
  }
  const proc = Bun.spawn(["npm", ...args], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Build Rust binaries in worktree (no symlink from cache)
async function buildRustInWorktree(worktreePath: string): Promise<boolean> {
  const result = await buildBinaries(worktreePath, [...ALL_BINARIES]);
  return result.success;
}

// Default config: symlink everything from cache
const DEFAULT_CONFIG: DependencyConfig = {
  rust: "symlink",
};

// Workspace directories that have their own node_modules (version overrides)
export const WORKSPACE_NODE_MODULES = [
  { name: "sdks/js", dir: "sdks/js" },
  { name: "front", dir: "front" },
  { name: "front-api", dir: "front-api" },
  { name: "marketing", dir: "marketing" },
  { name: "connectors", dir: "connectors" },
  { name: "sparkle", dir: "sparkle" },
  { name: "front-spa", dir: "front-spa" },
  { name: "extension", dir: "extension" },
  { name: "viz", dir: "viz" },
];

const COMPATIBILITY_NODE_MODULE_LINKS = [
  {
    name: "node_modules/@modelcontextprotocol",
    src: "node_modules/@modelcontextprotocol",
    dest: "node_modules/@modelcontextprotocol",
  },
  {
    name: "sdks/node_modules/@modelcontextprotocol",
    src: "node_modules/@modelcontextprotocol",
    dest: "sdks/node_modules/@modelcontextprotocol",
  },
];

async function removePath(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      await unlink(path);
    } else {
      await rm(path, { recursive: true });
    }
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function isSymlinkToPath(path: string, expectedTarget: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (!info.isSymbolicLink()) {
      return false;
    }

    const target = await readlink(path);
    return resolve(dirname(path), target) === expectedTarget;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function setupCodexConfigAlias(worktreePath: string): Promise<void> {
  const claudePath = join(worktreePath, ".claude");
  if (!(await directoryExists(claudePath))) {
    return;
  }

  const codexPath = join(worktreePath, ".codex");
  if (await pathExists(codexPath)) {
    return;
  }

  symlinkSync(".claude", codexPath);
  logger.success("Linked .codex -> .claude");
}

// Link workspace-level node_modules using shallow copies.
// Returns names of workspaces that failed.
async function linkWorkspaceNodeModules(worktreePath: string, repoRoot: string): Promise<string[]> {
  const failed: string[] = [];

  for (const { name, dir } of WORKSPACE_NODE_MODULES) {
    const srcNodeModules = `${repoRoot}/${dir}/node_modules`;
    if (await directoryExists(srcNodeModules)) {
      logger.step(`${name}: Linking node_modules...`);
      try {
        setupShallowNodeModules(srcNodeModules, `${worktreePath}/${dir}`);
        logger.success(`${name}: Linked`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`${name}: Failed to link - ${message}`);
        failed.push(name);
      }
    } else {
      logger.info(`${name}: No node_modules to link (all deps hoisted)`);
    }
  }

  return failed;
}

async function setupCompatibilityNodeModules(
  worktreePath: string,
  repoRoot: string
): Promise<void> {
  for (const { src, dest } of COMPATIBILITY_NODE_MODULE_LINKS) {
    const sourcePath = join(repoRoot, src);
    if (!(await directoryExists(sourcePath))) {
      continue;
    }

    const destPath = join(worktreePath, dest);
    await mkdir(dirname(destPath), { recursive: true });
    await removePath(destPath);
    symlinkSync(sourcePath, destPath);
  }
}

// Install all dependencies for a worktree
// Since worktrees are under the repo root, Node module resolution walks up to
// find {repoRoot}/node_modules/ automatically. We only need to:
// 1. Override @dust-tt/* packages to point to the worktree's workspaces
// 2. Shallow-copy workspace-level node_modules (version overrides)
export async function installAllDependencies(
  worktreePath: string,
  repoRoot: string,
  config: DependencyConfig = DEFAULT_CONFIG
): Promise<void> {
  const failed: string[] = [];

  // Handle Rust / cargo target
  if (config.rust === "symlink") {
    logger.step("Rust binaries: Linking from cache...");
    await symlinkCargoTarget(repoRoot, worktreePath);
    logger.success("Rust binaries: Linked");
  } else {
    logger.step("Rust binaries: Building from scratch...");
    const success = await buildRustInWorktree(worktreePath);
    if (!success) {
      failed.push("rust");
    } else {
      logger.success("Rust binaries: Built");
    }
  }

  // Setup @dust-tt/* overrides (small node_modules/@dust-tt/ directory).
  // Everything else resolves by walking up to {repoRoot}/node_modules/.
  logger.step("Setting up @dust-tt workspace overrides...");
  try {
    setupDustTtOverrides(repoRoot, worktreePath);
    logger.success("@dust-tt overrides: Linked");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`@dust-tt overrides: Failed - ${message}`);
    failed.push("@dust-tt");
  }

  // Shallow-copy workspace-level node_modules (real dirs with per-package symlinks).
  // This avoids symlink target walk-up issues with TypeScript resolution.
  const workspaceFailed = await linkWorkspaceNodeModules(worktreePath, repoRoot);
  failed.push(...workspaceFailed);

  // Some package-level tsconfig paths reference parent node_modules directories.
  // Create focused compatibility links so those paths work from arbitrary external worktree depths.
  await setupCompatibilityNodeModules(worktreePath, repoRoot);

  if (failed.length > 0) {
    throw new Error(`Failed to install dependencies for: ${failed.join(", ")}`);
  }

  // Copy user config files (AGENTS.local.md, AGENTS.override.md, .claude/) if they exist
  logger.step("Copying user config files...");
  await copyUserConfigFiles(repoRoot, worktreePath);
}

export async function getMissingEnvironmentSetup(metadata: EnvironmentMetadata): Promise<string[]> {
  const worktreePath = getEnvironmentWorktreeDir(metadata);
  const missing: string[] = [];

  if (!(await hasDirenvIntegration(metadata.name, worktreePath))) {
    missing.push(".envrc");
  }

  if (
    (await directoryExists(`${metadata.repoRoot}/.claude`)) &&
    !(await directoryExists(`${worktreePath}/.claude`))
  ) {
    missing.push(".claude");
  }

  if (
    (await directoryExists(`${worktreePath}/.claude`)) &&
    !(await directoryExists(`${worktreePath}/.codex`))
  ) {
    missing.push(".codex");
  }

  if (!(await directoryExists(`${worktreePath}/node_modules/@dust-tt`))) {
    missing.push("node_modules/@dust-tt");
  }

  for (const { name, dir } of WORKSPACE_NODE_MODULES) {
    const srcNodeModules = `${metadata.repoRoot}/${dir}/node_modules`;
    const targetNodeModules = `${worktreePath}/${dir}/node_modules`;
    if ((await directoryExists(srcNodeModules)) && !(await directoryExists(targetNodeModules))) {
      missing.push(`${name}/node_modules`);
    }
  }

  for (const { name, src, dest } of COMPATIBILITY_NODE_MODULE_LINKS) {
    if (
      (await directoryExists(join(metadata.repoRoot, src))) &&
      !(await isSymlinkToPath(join(worktreePath, dest), join(metadata.repoRoot, src)))
    ) {
      missing.push(name);
    }
  }

  return missing;
}

export async function refreshAllDependencies(
  worktreePath: string,
  repoRoot: string
): Promise<void> {
  await removePath(`${worktreePath}/node_modules`);

  for (const { dir } of WORKSPACE_NODE_MODULES) {
    await removePath(`${worktreePath}/${dir}/node_modules`);
  }

  for (const { dest } of COMPATIBILITY_NODE_MODULE_LINKS) {
    await removePath(join(worktreePath, dest));
  }

  await installAllDependencies(worktreePath, repoRoot);
}

export interface EnvironmentSetupRepair {
  repairedArtifacts: string[];
  dependenciesRepaired: boolean;
}

export async function repairEnvironmentSetup(
  metadata: EnvironmentMetadata
): Promise<EnvironmentSetupRepair> {
  const worktreePath = getEnvironmentWorktreeDir(metadata);
  const missingArtifacts = await getMissingEnvironmentSetup(metadata);
  if (missingArtifacts.length === 0) {
    return { repairedArtifacts: [], dependenciesRepaired: false };
  }

  if (missingArtifacts.includes(".envrc")) {
    await setupDirenv(metadata.name, worktreePath, { preserveExisting: true });
  }

  if (missingArtifacts.includes(".claude") || missingArtifacts.includes(".codex")) {
    await copyUserConfigFiles(metadata.repoRoot, worktreePath);
  }

  const dependenciesMissing = missingArtifacts.some((artifact) =>
    artifact.includes("node_modules")
  );
  if (dependenciesMissing) {
    await refreshAllDependencies(worktreePath, metadata.repoRoot);
  }

  return {
    repairedArtifacts: missingArtifacts,
    dependenciesRepaired: dependenciesMissing,
  };
}
