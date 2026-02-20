// Environment setup operations
// NOTE: node_modules uses shallow copy from main repo for speed (with SDK override).
// To run `npm install` in a worktree, first delete node_modules manually.
// NOTE: cargo target is symlinked to share Rust compilation cache (including linked artifacts).

import { mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { ALL_BINARIES, buildBinaries } from "./cache";
import { directoryExists } from "./fs";
import { logger } from "./logger";

// User config directories to copy from main repo to worktree
// These are personal/local files that aren't tracked in git
const USER_CONFIG_DIRS: string[] = [];

// @dust-tt packages mapping: npm scope name -> workspace directory relative to repo root
// These are workspace packages that need to be overridden to point to the worktree
const DUST_TT_PACKAGES: Record<string, string> = {
  client: "sdks/js",
  "dust-cli": "cli",
  extension: "extension",
  sparkle: "sparkle",
};

// Configuration for how to install each dependency type
export interface DependencyConfig {
  rust: "symlink" | "build";
  sdks: "symlink" | "install";
  front: "symlink" | "install";
  connectors: "symlink" | "install";
}

// Symlink node_modules from source to destination
async function symlinkNodeModules(srcDir: string, destDir: string): Promise<boolean> {
  const srcNodeModules = `${srcDir}/node_modules`;
  const destNodeModules = `${destDir}/node_modules`;

  // Check if source node_modules exists
  if (!(await directoryExists(srcNodeModules))) {
    return false;
  }

  // Create symlink
  const proc = Bun.spawn(["ln", "-s", srcNodeModules, destNodeModules], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Setup root node_modules with workspace package overrides
// Creates a real node_modules directory with symlinks to main repo packages,
// but overrides @dust-tt/* packages to point to the worktree's workspaces.
// This ensures TypeScript and runtime resolve workspace packages from the worktree,
// not the main repo (which may have stale types).
function setupRootNodeModules(mainNodeModules: string, worktreePath: string): void {
  const target = join(worktreePath, "node_modules");

  // Create target/node_modules/@dust-tt directory
  mkdirSync(join(target, "@dust-tt"), { recursive: true });

  // Symlink all top-level packages except @dust-tt
  for (const item of readdirSync(mainNodeModules)) {
    if (item !== "@dust-tt") {
      symlinkSync(join(mainNodeModules, item), join(target, item));
    }
  }

  // Override @dust-tt packages to point to worktree's workspaces
  for (const [pkgName, workspaceDir] of Object.entries(DUST_TT_PACKAGES)) {
    symlinkSync(join(worktreePath, workspaceDir), join(target, "@dust-tt", pkgName));
  }
}

// Setup shallow node_modules for workspace packages (front, connectors)
// Creates a real node_modules directory with symlinks to main repo packages.
// With npm workspaces, @dust-tt packages are in root node_modules, not here.
function setupShallowNodeModules(mainNodeModules: string, targetDir: string): void {
  const target = join(targetDir, "node_modules");
  mkdirSync(target, { recursive: true });

  // Symlink all packages from main repo
  for (const item of readdirSync(mainNodeModules)) {
    symlinkSync(join(mainNodeModules, item), join(target, item));
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
  sdks: "symlink",
  front: "symlink",
  connectors: "symlink",
};

// Install all dependencies for a worktree
// With config, can either symlink from cache or install/build in worktree
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles multiple dependency types with different modes
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

  // Handle root node_modules (npm workspaces hoists deps here)
  // Override @dust-tt/* packages to point to worktree's workspaces
  logger.step("root: Linking from cache (with workspace overrides)...");
  try {
    setupRootNodeModules(`${repoRoot}/node_modules`, worktreePath);
    logger.success("root: Linked");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`root: Failed to link - ${message}`);
    failed.push("root");
  }

  // Handle node_modules for sdks/js (simple symlink, it IS the SDK)
  if (config.sdks === "symlink") {
    logger.step("sdks/js: Linking from cache...");
    const success = await symlinkNodeModules(`${repoRoot}/sdks/js`, `${worktreePath}/sdks/js`);
    if (!success) {
      failed.push("sdks/js");
    } else {
      logger.success("sdks/js: Linked");
    }
  } else {
    logger.step("sdks/js: Installing dependencies...");
    const success = await runNpmInstall(`${worktreePath}/sdks/js`, {
      preferOffline: true,
    });
    if (!success) {
      failed.push("sdks/js");
    } else {
      logger.success("sdks/js: Installed");
    }
  }

  // Handle node_modules for front, connectors, sparkle, and front-spa
  // With npm workspaces, most deps are hoisted to root. These only have local overrides.
  const workspaceProjects = [
    {
      key: "front" as const,
      name: "front",
      mainNodeModules: `${repoRoot}/front/node_modules`,
      dest: `${worktreePath}/front`,
    },
    {
      key: "connectors" as const,
      name: "connectors",
      mainNodeModules: `${repoRoot}/connectors/node_modules`,
      dest: `${worktreePath}/connectors`,
    },
    {
      key: "front" as const, // Uses same config as front
      name: "sparkle",
      mainNodeModules: `${repoRoot}/sparkle/node_modules`,
      dest: `${worktreePath}/sparkle`,
    },
    {
      key: "front" as const, // Uses same config as front
      name: "front-spa",
      mainNodeModules: `${repoRoot}/front-spa/node_modules`,
      dest: `${worktreePath}/front-spa`,
    },
  ];

  for (const { key, name, mainNodeModules, dest } of workspaceProjects) {
    const mode = config[key];
    if (mode === "symlink") {
      logger.step(`${name}: Linking from cache...`);
      try {
        setupShallowNodeModules(mainNodeModules, dest);
        logger.success(`${name}: Linked`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`${name}: Failed to link - ${message}`);
        failed.push(name);
      }
    } else {
      logger.step(`${name}: Installing dependencies...`);
      const success = await runNpmInstall(dest, { preferOffline: true });
      if (!success) {
        failed.push(name);
      } else {
        logger.success(`${name}: Installed`);
      }
    }
  }

  if (failed.length > 0) {
    throw new Error(`Failed to install dependencies for: ${failed.join(", ")}`);
  }

  // Copy user config files (AGENTS.local.md, AGENTS.override.md, .claude/) if they exist
  logger.step("Copying user config files...");
  await copyUserConfigFiles(repoRoot, worktreePath);
}
