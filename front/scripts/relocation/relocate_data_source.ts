import assert from "assert";

import {
  config,
  isRegionType,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
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

    assert(
      config.getCurrentRegion() === sourceRegion,
      "Must run from source region"
    );

    const dataSource = await DataSourceModel.findByPk(dataSourceId, {
      include: [
        {
          model: Workspace,
          required: true,
        },
      ],
    });

    if (!dataSource) {
      logger.error("DataSource not found");
      return;
    }

    if (dataSource.workspace.sId !== workspaceId) {
      logger.error("DataSource is not part of the workspaceId you gave");
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
