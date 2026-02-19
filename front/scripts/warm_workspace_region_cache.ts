import { getRedisCacheClient } from "@app/lib/api/redis";
import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { makeScript } from "@app/scripts/helpers";
import * as fs from "fs";

const WORKSPACE_REGION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours.

function getCacheKey(wId: string): string {
  return `cacheWithRedis-_lookupWorkspaceUncached-workspace-region:${wId}`;
}

makeScript(
  {
    jsonFile: {
      alias: "f",
      type: "string" as const,
      demandOption: true,
      describe:
        'Path to a JSON file with workspace sIds (e.g., [{"sId":"abc"},{"sId":"def"}])',
    },
    region: {
      alias: "r",
      type: "string" as const,
      choices: SUPPORTED_REGIONS,
      demandOption: true,
      describe: "The region to associate with these workspaces in the cache",
    },
  },
  async ({ jsonFile, region, execute }, logger) => {
    if (!isRegionType(region)) {
      logger.error("Invalid region.");
      return;
    }

    const raw = fs.readFileSync(jsonFile, "utf-8");
    const entries: { sId: string }[] = JSON.parse(raw);

    const sIds = entries.map((e) => e.sId).filter(Boolean);
    logger.info(`Found ${sIds.length} workspace(s) to warm.`);

    if (!execute) {
      logger.info("Dry run — pass --execute to write to cache.");
      return;
    }

    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

    let count = 0;
    for (const sId of sIds) {
      const key = getCacheKey(sId);
      await redisCli.set(key, JSON.stringify(region), {
        PX: WORKSPACE_REGION_CACHE_TTL_MS,
      });
      count++;
      if (count % 100 === 0) {
        logger.info(`Warmed ${count}/${sIds.length}`);
      }
    }

    logger.info(`Done — warmed ${count} workspace region cache entries.`);
  }
);
