// Environment setup operations
// NOTE: node_modules are symlinked from main repo for speed.
// Running `npm install` in a worktree will modify the main repo's node_modules.
// NOTE: Rust compilation uses sccache for caching across worktrees (content-addressed).

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

// Install all dependencies for a worktree by symlinking from main repo
export async function installAllDependencies(
  worktreePath: string,
  repoRoot: string
): Promise<void> {
  logger.step("Linking dependencies from main repo...");

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
