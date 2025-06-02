import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { getTemporalClient } from "@app/lib/temporal";
import { makeScript } from "@app/scripts/helpers";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import { workspaceRelocateAppsWorkflow } from "@app/temporal/relocation/workflows";

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

    if (execute) {
      const client = await getTemporalClient();
      await client.workflow.start(workspaceRelocateAppsWorkflow, {
        args: [{ workspaceId, sourceRegion, destRegion }],
        taskQueue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
        workflowId: `workspaceRelocateAppsWorkflow-${workspaceId}`,
        memo: { workspaceId },
      });
    }
  }
);
