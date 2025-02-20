import type { LightWorkspaceType } from "@dust-tt/types";

import { checkSeatCountForWorkspace } from "@app/lib/api/workspace";
import { Plan, Subscription } from "@app/lib/models/plan";
import {
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

async function checkWorkspaceSeatCount(
  workspace: LightWorkspaceType,
  logger: Logger
) {
  const subscription = await Subscription.findOne({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    include: [Plan],
  });
  if (
    subscription?.plan.code === PRO_PLAN_SEAT_29_CODE ||
    subscription?.plan.code === PRO_PLAN_SEAT_39_CODE
  ) {
    const result = await checkSeatCountForWorkspace(workspace, false);
    if (result.isOk()) {
      logger.info(
        { workspaceId: workspace.sId, message: result.value },
        "Seat count check succeeded."
      );
    }
    if (result.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, error: result.error },
        "Seat count check failed."
      );
    }
  }
}

makeScript({}, async (args, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await checkWorkspaceSeatCount(workspace, logger);
  });
});
