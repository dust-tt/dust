import { config } from "@app/lib/api/cells/config";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { workspaceRelocateDataSourceCoreWorkflow } from "@app/temporal/relocation/workflows";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";
import assert from "assert";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      required: true,
    },
    sourceCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
      demandOption: true,
    },
    destCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
      demandOption: true,
    },
    dataSourceId: {
      alias: "dsId",
      type: "number",
      required: true,
    },
  },
  async (
    { workspaceId, sourceCell, destCell, dataSourceId, execute },
    logger
  ) => {
    if (!isCellType(sourceCell) || !isCellType(destCell)) {
      logger.error("Invalid cell.");
      return;
    }

    if (sourceCell === destCell) {
      logger.error("Source and destination cells must be different.");
      return;
    }

    assert(
      config.getCurrentCell().name === sourceCell,
      "Must run from the source cell"
    );

    const dataSource = await DataSourceModel.findByPk(dataSourceId, {
      include: [
        {
          model: WorkspaceModel,
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

    logger.info({ dataSource }, "found data source");

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
              dustAPIProjectId: dataSource.dustAPIProjectId,
              dustAPIDataSourceId: dataSource.dustAPIDataSourceId,
            },
            destCell,
            sourceCell,
            workspaceId,
          },
        ],
        taskQueue: RELOCATION_QUEUES_PER_CELL[sourceCell],
      });
    }
  }
);
