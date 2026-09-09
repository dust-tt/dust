import { makeScript } from "@app/scripts/helpers";
import {
  launchSearchUsageSchedule,
  launchWorkspaceSearchUsageWorkflow,
} from "@app/temporal/es_indexation/client";

makeScript(
  {
    wId: {
      type: "string",
      describe:
        "Refresh one workspace now; omit to install the daily regional schedule.",
    },
  },
  async ({ execute, wId }, logger) => {
    if (!execute) {
      logger.info(
        { wId },
        "Search usage snapshot dry run: no workflow or schedule launched"
      );
      return;
    }
    const result = wId
      ? await launchWorkspaceSearchUsageWorkflow(wId)
      : await launchSearchUsageSchedule();
    if (result.isErr()) {
      throw result.error;
    }
    logger.info(
      { wId },
      wId
        ? "Search usage refresh launched"
        : "Daily search usage schedule installed"
    );
  }
);
