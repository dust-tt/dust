import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { makeScript } from "@app/scripts/helpers";
import { getApp } from "@app/temporal/relocation/activities/source_region/core";

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

    const workspace = await getWorkspaceInfos(workspaceId);

    if (!workspace) {
      logger.error("Workspace not found");
      return;
    }

    const apps = await AppModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
      order: [["id", "ASC"]],
    });

    logger.info(`Found ${apps.length} apps`);

    for (const app of apps) {
      if (execute) {
        try {
          const { dataPath } = await getApp({
            dustAPIProjectId: app.dustAPIProjectId,
            workspaceId,
            sourceRegion,
          });

          logger.info({ dataPath }, "uploaded apps");
        } catch (err) {
          if (
            err instanceof Error &&
            err.message === `DUST_RELOCATION_BUCKET is required but not set`
          ) {
            console.log(`${app.sId} OK`);
          } else {
            console.error(`${app.sId} BAD: ${err}`);
          }
        }
      }
    }
  }
);
