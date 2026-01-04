// Environment setup operations
// NOTE: node_modules are symlinked from main repo for speed.
// Running `npm install` in a worktree will modify the main repo's node_modules.

import { directoryExists } from "./fs";
import { logger } from "./logger";

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

// Install all dependencies for a worktree by symlinking from main repo
export async function installAllDependencies(
  worktreePath: string,
  repoRoot: string
): Promise<void> {
  logger.step("Linking dependencies from main repo...");

  // Symlink cargo target to share Rust compilation cache
  await symlinkCargoTarget(repoRoot, worktreePath);

  // Symlink node_modules for each project
  const projects = [
    { name: "sdks/js", src: `${repoRoot}/sdks/js`, dest: `${worktreePath}/sdks/js` },
    { name: "front", src: `${repoRoot}/front`, dest: `${worktreePath}/front` },
    { name: "connectors", src: `${repoRoot}/connectors`, dest: `${worktreePath}/connectors` },
  ];

  const failed: string[] = [];

  for (const { name, src, dest } of projects) {
    const success = await symlinkNodeModules(src, dest);
    if (!success) {
      failed.push(name);
    }
  }

  if (failed.length > 0) {
    throw new Error(
      `Failed to symlink node_modules for: ${failed.join(", ")}. Make sure main repo has node_modules installed.`
    );
  }

  logger.success("Dependencies linked");
}
