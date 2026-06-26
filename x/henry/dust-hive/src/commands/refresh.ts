// Refresh command - restore node_modules links in a worktree

import { withEnvironment } from "../lib/commands";
import { getEnvironmentWorktreeDir } from "../lib/environment";
import { logger } from "../lib/logger";
import { Ok } from "../lib/result";
import { refreshAllDependencies } from "../lib/setup";

export const refreshCommand = withEnvironment("refresh", async (env) => {
  const worktreePath = getEnvironmentWorktreeDir(env.metadata);
  const repoRoot = env.metadata.repoRoot;

  logger.info(`Refreshing node_modules for '${env.name}'...`);
  console.log();

  logger.step("Recreating node_modules links...");
  await refreshAllDependencies(worktreePath, repoRoot);

  console.log();
  logger.success("node_modules refreshed");

  return Ok(undefined);
});
