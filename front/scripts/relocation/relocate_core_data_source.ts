import assert from "assert";

import {
  config,
  isRegionType,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { launchCoreDataSourceRelocationWorkflow } from "@app/temporal/relocation/client";

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
    destinationRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      demandOption: true,
    },
    dataSourceCoreIds: {
      type: "string",
      description:
        "The core ids of the data source to relocate (stringified JSON)",
      demandOption: true,
    },
    destIds: {
      type: "string",
      description:
        "The ids of the data source in the destination region (stringified JSON)",
      demandOption: true,
    },
    pageCursor: {
      type: "string",
      description: "The page cursor to start from",
      default: null,
    },
  },
  async (
    {
      dataSourceCoreIds,
      destIds,
      destinationRegion,
      execute,
      pageCursor,
      sourceRegion,
      workspaceId,
    },
    logger
  ) => {
    if (!isRegionType(sourceRegion) || !isRegionType(destinationRegion)) {
      logger.error("Invalid region.");
      return;
    }

    if (sourceRegion === destinationRegion) {
      logger.error("Source and destination regions must be different.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const owner = auth.getNonNullableWorkspace();

    if (owner.metadata?.maintenance !== "relocation") {
      logger.error("Workspace is not relocating.");
      return;
    }

    assert(
      config.getCurrentRegion() === sourceRegion,
      "Must run from source region"
    );

    const parsedDataSourceCoreIds = JSON.parse(dataSourceCoreIds);
    const parsedDestIds = JSON.parse(destIds);

    if (execute) {
      await launchCoreDataSourceRelocationWorkflow({
        dataSourceCoreIds: parsedDataSourceCoreIds,
        destIds: parsedDestIds,
        destRegion: destinationRegion,
        pageCursor,
        sourceRegion,
        workspaceId,
      });
    }
  }
);
