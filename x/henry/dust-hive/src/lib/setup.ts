// Environment setup operations
// NOTE: node_modules are symlinked from main repo for speed.
// Running `npm install` in a worktree will modify the main repo's node_modules.
// NOTE: cargo target is symlinked to share Rust compilation cache (including linked artifacts).

import { ALL_BINARIES, buildBinaries } from "./cache";
import { directoryExists } from "./fs";
import { logger } from "./logger";

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

// Run npm install in a directory
export async function runNpmInstall(dir: string): Promise<boolean> {
  const proc = Bun.spawn(["npm", "install", "--prefer-offline"], {
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

  // Handle node_modules for each project
  const projects = [
    {
      key: "sdks" as const,
      name: "sdks/js",
      src: `${repoRoot}/sdks/js`,
      dest: `${worktreePath}/sdks/js`,
    },
    {
      key: "front" as const,
      name: "front",
      src: `${repoRoot}/front`,
      dest: `${worktreePath}/front`,
    },
    {
      key: "connectors" as const,
      name: "connectors",
      src: `${repoRoot}/connectors`,
      dest: `${worktreePath}/connectors`,
    },
  ];

  for (const { key, name, src, dest } of projects) {
    const mode = config[key];
    if (mode === "symlink") {
      logger.step(`${name}: Linking from cache...`);
      const success = await symlinkNodeModules(src, dest);
      if (!success) {
        failed.push(name);
      } else {
        logger.success(`${name}: Linked`);
      }
    } else {
      logger.step(`${name}: Installing dependencies...`);
      const success = await runNpmInstall(dest);
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
}
