// Cache management command

import {
  ALL_BINARIES,
  buildBinaries,
  getAvailableBinaries,
  getCacheSource,
  getMissingBinaries,
  setCacheSource,
} from "../lib/cache";
import { logger } from "../lib/logger";
import { findRepoRoot } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";

interface CacheOptions {
  rebuild?: boolean;
  status?: boolean;
}

async function showCacheStatus(): Promise<void> {
  const cacheSource = await getCacheSource();

  if (!cacheSource) {
    logger.warn("Cache not configured");
    console.log();
    console.log("Run 'dust-hive spawn' or 'dust-hive cache --rebuild' to configure cache.");
    return;
  }

  console.log(`Cache source: ${cacheSource}`);
  console.log();

  const available = await getAvailableBinaries(cacheSource);
  const missing = await getMissingBinaries(cacheSource);

  console.log(`Binaries (${available.length}/${ALL_BINARIES.length}):`);
  for (const binary of ALL_BINARIES) {
    const status = available.includes(binary) ? "✓" : "✗";
    console.log(`  ${status} ${binary}`);
  }

  if (missing.length > 0) {
    console.log();
    console.log(`Missing: ${missing.join(", ")}`);
    console.log("Run 'dust-hive cache --rebuild' to build missing binaries.");
  }
}

async function rebuildCache(): Promise<void> {
  // Find repo root to use as cache source
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    throw new Error("Not in a git repository. Please run from within the Dust repo.");
  }

  await setCacheSource(repoRoot);
  logger.info(`Using cache source: ${repoRoot}`);

  const missing = await getMissingBinaries(repoRoot);

  if (missing.length === 0) {
    logger.success("All binaries already built");
    return;
  }

  logger.info(`Building ${missing.length} missing binaries: ${missing.join(", ")}`);

  const result = await buildBinaries(repoRoot, missing);

  if (result.success) {
    logger.success("Cache rebuild complete");
  } else {
    logger.error(`Failed to build: ${result.failed.join(", ")}`);
  }
}

export async function cacheCommand(options: CacheOptions): Promise<Result<void>> {
  const resolved: CacheOptions = { ...options };
  if (!(resolved.rebuild || resolved.status)) {
    resolved.status = true;
  }
  try {
    if (resolved.rebuild) {
      await rebuildCache();
    } else {
      await showCacheStatus();
    }
    return Ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Err(new CommandError(message));
  }
}
