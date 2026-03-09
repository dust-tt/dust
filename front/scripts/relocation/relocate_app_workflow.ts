import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { makeScript } from "@app/scripts/helpers";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { workspaceRelocateAppWorkflow } from "@app/temporal/relocation/workflows";
import { WorkflowNotFoundError } from "@temporalio/common";

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
    projectId: {
      type: "string",
      require: true,
    },
  },
  async (
    { workspaceId, sourceRegion, destRegion, projectId, execute },
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

    const client = await getTemporalRelocationClient();
    logger.info("Got temporal client");

    const workflowId = `workspaceRelocateAppWorkflow-${workspaceId}-${projectId}`;

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
          sourceRegion,
          destRegion,
          queue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
          workflowId,
        },
        "starting workspaceRelocateAppsWorkflow"
      );

      await client.workflow.start(workspaceRelocateAppWorkflow, {
        args: [
          {
            workspaceId,
            sourceRegion,
            destRegion,
            dustAPIProjectId: projectId,
          },
        ],
        taskQueue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
        workflowId,
        memo: { workspaceId },
      });
    } else {
      logger.warn("Not executing");
    }
  }
);
