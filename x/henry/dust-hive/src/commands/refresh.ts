// Refresh command - restore node_modules links in a worktree

import { lstat, rm, unlink } from "node:fs/promises";
import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { Ok } from "../lib/result";
import { installAllDependencies } from "../lib/setup";

// Workspace directories that have symlinked node_modules
const WORKSPACE_DIRS = [
  "sdks/js",
  "front",
  "connectors",
  "sparkle",
  "front-spa",
  "extension",
  "viz",
];

// Remove a path whether it's a symlink, real directory, or doesn't exist
async function removePath(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      await unlink(path);
    } else {
      await rm(path, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

export const refreshCommand = withEnvironment("refresh", async (env) => {
  const worktreePath = getWorktreeDir(env.name, env.metadata.repoRoot);
  const repoRoot = env.metadata.repoRoot;

  logger.info(`Refreshing node_modules for '${env.name}'...`);
  console.log();

  // Remove root node_modules (real dir with @dust-tt overrides)
  logger.step("Removing existing node_modules...");
  if (await removePath(`${worktreePath}/node_modules`)) {
    logger.info("  Removed root/node_modules");
  }

  // Remove workspace node_modules (symlinks to main repo)
  for (const dir of WORKSPACE_DIRS) {
    if (await removePath(`${worktreePath}/${dir}/node_modules`)) {
      logger.info(`  Removed ${dir}/node_modules`);
    }
  }
  console.log();

  // Recreate links
  logger.step("Recreating node_modules links...");
  await installAllDependencies(worktreePath, repoRoot);

  console.log();
  logger.success("node_modules refreshed");

  return Ok(undefined);
});
