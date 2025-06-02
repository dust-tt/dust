import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { makeScript } from "@app/scripts/helpers";
import {
  getCoreDestinationRegionActivities,
  getCoreSourceRegionActivities,
} from "@app/temporal/relocation/workflows";
import type { ModelId } from "@app/types";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      demandOption: true,
    },
    sourceRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
    destRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
  },
  async ({ workspaceId, sourceRegion, destRegion, execute }, logger) => {
    if (!isRegionType(sourceRegion) || !isRegionType(destRegion)) {
      logger.error("Invalid region.");
      return;
    }

    if (sourceRegion === destRegion) {
      logger.error("Source and destination regions must be different.");
      return;
    }

    const sourceRegionActivities = getCoreSourceRegionActivities(sourceRegion);
    const destinationRegionActivities =
      getCoreDestinationRegionActivities(destRegion);

    let hasMoreRows = true;
    let currentId: ModelId | undefined = undefined;

    do {
      const { dustAPIProjectIds, hasMore, lastId } =
        await sourceRegionActivities.retrieveAppsCoreIdsBatch({
          lastId: currentId,
          workspaceId,
        });

      hasMoreRows = hasMore;
      currentId = lastId;

      logger.info(
        { hasMoreRows, currentId },
        "[Core] sourceRegionActivities.retrieveAppsCoreIdsBatch"
      );

      for (const dustAPIProjectId of dustAPIProjectIds) {
        const { dataPath } = await sourceRegionActivities.getApp({
          dustAPIProjectId,
          workspaceId,
          sourceRegion,
        });

        logger.info(
          {
            dustAPIProjectId,
            workspaceId,
            sourceRegion,
            dataPath,
          },
          "[Core] sourceRegionActivities getApp"
        );

        if (execute) {
          await destinationRegionActivities.processApp({
            dustAPIProjectId,
            dataPath,
            destRegion,
            sourceRegion,
            workspaceId,
          });
          logger.info("[Core] destinationRegionActivities.processApp");
        } else {
          logger.warn(
            {
              dustAPIProjectId,
              dataPath,
              destRegion,
              sourceRegion,
              workspaceId,
            },
            "[Core] NOT EXECUTING destinationRegionActivities.processApp"
          );
        }
      }
    } while (hasMoreRows);
  }
);
