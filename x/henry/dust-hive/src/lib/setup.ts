// Environment setup operations

import { logger } from "./logger";
import { buildShell } from "./shell";

// Check if a directory exists
async function directoryExists(path: string): Promise<boolean> {
  const proc = Bun.spawn(["test", "-d", path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Check if two files have identical content
async function filesMatch(file1: string, file2: string): Promise<boolean> {
  const proc = Bun.spawn(["cmp", "-s", file1, file2], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Create a symlink to node_modules (fastest possible)
async function symlinkNodeModules(srcDir: string, destDir: string): Promise<boolean> {
  const srcNodeModules = `${srcDir}/node_modules`;
  const destNodeModules = `${destDir}/node_modules`;

  // Check if source node_modules exists
  const srcExists = await directoryExists(srcNodeModules);
  if (!srcExists) {
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

// Run npm install (not npm ci) to reconcile any differences
// This is fast when node_modules already exists and matches
async function runNpmInstall(cwd: string): Promise<boolean> {
  const command = buildShell({
    sourceNvm: true,
    run: "npm install --prefer-offline",
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;
  return proc.exitCode === 0;
}

// Setup dependencies for a single directory
// If package-lock.json matches: symlink node_modules (instant)
// If different: symlink + npm install to reconcile
// If no source: npm ci from scratch
async function setupDependencies(
  srcDir: string,
  destDir: string,
  name: string
): Promise<{ success: boolean; name: string; mode: "symlink" | "reconcile" | "fresh" }> {
  const srcLock = `${srcDir}/package-lock.json`;
  const destLock = `${destDir}/package-lock.json`;

  // Check if source node_modules exists
  const srcNodeModulesExists = await directoryExists(`${srcDir}/node_modules`);

  if (srcNodeModulesExists) {
    // Check if package-lock.json is identical
    const locksMatch = await filesMatch(srcLock, destLock);

    // Create symlink to source node_modules
    const symlinked = await symlinkNodeModules(srcDir, destDir);

    if (!symlinked) {
      // Symlink failed, fall back to npm ci
      const command = buildShell({ sourceNvm: true, run: "npm ci" });
      const proc = Bun.spawn(["bash", "-c", command], {
        cwd: destDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      return { success: proc.exitCode === 0, name, mode: "fresh" };
    }

    if (locksMatch) {
      // Perfect match - symlink is all we need
      return { success: true, name, mode: "symlink" };
    }

    // package-lock.json differs - need to run npm install to reconcile
    // First, remove symlink and copy for isolation
    await Bun.spawn(["rm", `${destDir}/node_modules`]).exited;
    await Bun.spawn(["cp", "-R", `${srcDir}/node_modules`, `${destDir}/node_modules`]).exited;

    const success = await runNpmInstall(destDir);
    return { success, name, mode: "reconcile" };
  }

  // No source node_modules, fall back to npm ci
  const command = buildShell({ sourceNvm: true, run: "npm ci" });
  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: destDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return { success: proc.exitCode === 0, name, mode: "fresh" };
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

// Install all dependencies for a worktree using cache from main repo
export async function installAllDependencies(
  worktreePath: string,
  repoRoot: string
): Promise<void> {
  logger.step("Setting up dependencies (using cache from main repo)...");

  // Symlink cargo target to share Rust compilation cache
  await symlinkCargoTarget(repoRoot, worktreePath);

  // Run all three in parallel - they're independent
  const [sdkResult, frontResult, connectorsResult] = await Promise.all([
    setupDependencies(`${repoRoot}/sdks/js`, `${worktreePath}/sdks/js`, "sdks/js"),
    setupDependencies(`${repoRoot}/front`, `${worktreePath}/front`, "front"),
    setupDependencies(`${repoRoot}/connectors`, `${worktreePath}/connectors`, "connectors"),
  ]);

  const results = [sdkResult, frontResult, connectorsResult];
  const failed = results.filter((r) => !r.success);

  if (failed.length > 0) {
    throw new Error(`Dependency setup failed in: ${failed.map((r) => r.name).join(", ")}`);
  }

  // Report what happened
  const symlinked = results.filter((r) => r.mode === "symlink").map((r) => r.name);
  const reconciled = results.filter((r) => r.mode === "reconcile").map((r) => r.name);
  const fresh = results.filter((r) => r.mode === "fresh").map((r) => r.name);

  const parts: string[] = [];
  if (symlinked.length > 0) parts.push(`symlinked: ${symlinked.join(", ")}`);
  if (reconciled.length > 0) parts.push(`reconciled: ${reconciled.join(", ")}`);
  if (fresh.length > 0) parts.push(`fresh: ${fresh.join(", ")}`);

  logger.success(`Dependencies ready (${parts.join("; ")})`);
}
