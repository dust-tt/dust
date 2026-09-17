import { makeScript } from "@app/scripts/helpers";
import { launchWorkspaceSearchUsageWorkflow } from "@app/temporal/es_indexation/client";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      describe: "Workspace sId to refresh search usage for.",
    },
  },
  async ({ execute, wId }, logger) => {
    if (!execute) {
      logger.info(
        { wId },
        "Search usage snapshot dry run: no workflow launched"
      );
      return;
    }
    const result = await launchWorkspaceSearchUsageWorkflow(wId);
    if (result.isErr()) {
      throw result.error;
    }
    logger.info({ wId }, "Search usage refresh launched");
  }
);
