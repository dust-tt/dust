import { makeScript } from "@app/scripts/helpers";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { workspaceRelocateAppsWorkflow } from "@app/temporal/relocation/workflows";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";
import { WorkflowNotFoundError } from "@temporalio/common";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      demandOption: true,
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
    suffix: {
      type: "string",
    },
  },
  async ({ workspaceId, sourceCell, destCell, suffix, execute }, logger) => {
    if (!isCellType(sourceCell) || !isCellType(destCell)) {
      logger.error("Invalid cell.");
      return;
    }

    if (sourceCell === destCell) {
      logger.error("Source and destination cells must be different.");
      return;
    }

    const client = await getTemporalRelocationClient();
    logger.info("Got temporal client");

    let workflowId = `workspaceRelocateAppsWorkflow-${workspaceId}`;

    if (suffix != null && suffix !== "") {
      workflowId += `-${suffix}`;
    }

    const existingWorkflowHandle = client.workflow.getHandle(workflowId);
    try {
      const description = await existingWorkflowHandle.describe();
      logger.warn({ workflowId, description }, "workflow already exists");
      return;
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        // ok, don't exist
      } else {
        logger.error(
          { workflowId, err },
          "error checking if workflow already exists"
        );
        return;
      }
    }

    if (execute) {
      logger.info(
        {
          workspaceId,
          sourceCell,
          destCell,
          queue: RELOCATION_QUEUES_PER_CELL[sourceCell],
          workflowId,
        },
        "starting workspaceRelocateAppsWorkflow"
      );

      await client.workflow.start(workspaceRelocateAppsWorkflow, {
        args: [{ workspaceId, sourceCell, destCell }],
        taskQueue: RELOCATION_QUEUES_PER_CELL[sourceCell],
        workflowId,
        memo: { workspaceId },
      });
    } else {
      logger.warn("Not executing");
    }
  }
);
