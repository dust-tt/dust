import assert from "assert";

import {
  config,
  isRegionType,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { workspaceRelocateDataSourceCoreWorkflow } from "@app/temporal/relocation/workflows";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      required: true,
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
    dataSourceId: {
      alias: "dsId",
      type: "number",
      required: true,
    },
  },
  async (
    { workspaceId, sourceRegion, destRegion, dataSourceId, execute },
    logger
  ) => {
    if (!isRegionType(sourceRegion) || !isRegionType(destRegion)) {
      logger.error("Invalid region.");
      return;
    }

    if (sourceRegion === destRegion) {
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

    const dataSource = await DataSourceModel.findOne({
      attributes: ["id", "dustAPIDataSourceId", "dustAPIProjectId"],
      where: {
        id: dataSourceId,
      },
      order: [["id", "ASC"]],
    });

    if (!dataSource) {
      logger.error("DataSource not found");
      return;
    }

    const client = await getTemporalRelocationClient();

    const workflowId = `workspaceRelocateDataSourceCoreWorkflow-${workspaceId}-${
      dataSourceId
    }`;

    if (execute) {
      await client.workflow.start(workspaceRelocateDataSourceCoreWorkflow, {
        workflowId,
        args: [
          {
            dataSourceCoreIds: {
              id: dataSourceId,
              dustAPIProjectId: dataSource.dustAPIDataSourceId,
              dustAPIDataSourceId: dataSource.dustAPIProjectId,
            },
            destRegion,
            sourceRegion,
            workspaceId,
          },
        ],
        taskQueue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
      });
    }
  }
);
