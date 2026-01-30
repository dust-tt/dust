// Refresh command - restore node_modules links in a worktree

import { rm } from "node:fs/promises";
import { withEnvironment } from "../lib/commands";
import { directoryExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { Ok } from "../lib/result";
import { installAllDependencies } from "../lib/setup";

// Directories that have node_modules to refresh
const NODE_MODULES_DIRS = ["", "sdks/js", "front", "connectors", "sparkle", "front-spa"];

export const refreshCommand = withEnvironment("refresh", async (env) => {
  const worktreePath = getWorktreeDir(env.name);
  const repoRoot = env.metadata.repoRoot;

  logger.info(`Refreshing node_modules for '${env.name}'...`);
  console.log();

  // Remove existing node_modules directories
  logger.step("Removing existing node_modules...");
  for (const dir of NODE_MODULES_DIRS) {
    const nodeModulesPath = dir
      ? `${worktreePath}/${dir}/node_modules`
      : `${worktreePath}/node_modules`;
    if (await directoryExists(nodeModulesPath)) {
      await rm(nodeModulesPath, { recursive: true });
      logger.info(`  Removed ${dir || "root"}/node_modules`);
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
