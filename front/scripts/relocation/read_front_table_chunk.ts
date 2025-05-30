import type { RegionType } from "@app/lib/api/regions/config";
import {
  config,
  isRegionType,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { readFrontTableChunk } from "@app/temporal/relocation/activities/source_region/front";

function assertCorrectRegion(region: RegionType) {
  if (config.getCurrentRegion() !== region) {
    throw new Error(
      `Relocation must be run from ${region}. Current region is ${config.getCurrentRegion()}.`
    );
  }
}

makeScript(
  {
    destRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      required: true,
    },
    lastId: {
      type: "number",
    },
    limit: {
      type: "number",
      require: true,
    },
    sourceRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
    },
    tableName: {
      type: "string",
      required: true,
    },
    workspaceId: {
      type: "string",
      required: true,
    },
  },
  async ({
    destRegion,
    lastId,
    limit,
    sourceRegion,
    tableName,
    workspaceId,
    execute,
  }) => {
    if (!isRegionType(sourceRegion) || !isRegionType(destRegion)) {
      logger.error("Invalid region.");
      return;
    }

    if (sourceRegion === destRegion) {
      logger.error("Source and destination regions must be different.");
      return;
    }

    assertCorrectRegion(sourceRegion);

    if (execute) {
      try {
        const res = await readFrontTableChunk({
          destRegion,
          lastId,
          sourceRegion,
          tableName,
          workspaceId,
          limit,
        });
        logger.info(res, "readFrontTableChunk");
      } catch (err) {
        logger.error(err);
      }
    } else {
      logger.info("Nothing will be executed");
    }
  }
);
