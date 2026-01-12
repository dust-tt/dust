// Cache status command - shows where cache is pointing and which binaries exist

import {
  ALL_BINARIES,
  getAvailableBinaries,
  getCacheSource,
  getMissingBinaries,
} from "../lib/cache";
import { logger } from "../lib/logger";
import { Ok, type Result } from "../lib/result";

export async function cacheCommand(): Promise<Result<void>> {
  const cacheSource = await getCacheSource();

  if (!cacheSource) {
    logger.warn("Cache not configured");
    console.log();
    console.log("Run 'dust-hive sync' from the main repo to configure cache.");
    return Ok(undefined);
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
    console.log("Run 'dust-hive sync' from the main repo to build missing binaries.");
  }

  return Ok(undefined);
}
