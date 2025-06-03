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
    appId: {
      type: "string",
      required: true,
    },
  },
  async ({ workspaceId, sourceRegion, destRegion, appId, execute }, logger) => {
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

    const app = await AppModel.findOne({
      where: {
        workspaceId: workspace.id,
        sId: appId,
      },
    });

    if (!app) {
      logger.error("App not found");
      return;
    }

    logger.info({ app }, "found app");

    if (execute) {
      const { dataPath } = await getApp({
        dustAPIProjectId: app.dustAPIProjectId,
        workspaceId,
        sourceRegion,
      });

      logger.info({ dataPath }, "uploaded apps");
    }
  }
);
