import { checkSeatCountForWorkspace } from "@app/lib/api/workspace";
import {
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { PlanModel, Subscription } from "@app/lib/resources/storage/models/plans";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

async function checkWorkspaceSeatCount(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const subscription = await Subscription.findOne({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    include: [PlanModel],
  });
  const localLogger = logger.child({
    workspaceId: workspace.sId,
    subscription: subscription?.plan.code,
  });
  if (
    subscription?.plan.code === PRO_PLAN_SEAT_29_CODE ||
    subscription?.plan.code === PRO_PLAN_SEAT_39_CODE
  ) {
    if (execute) {
      const result = await checkSeatCountForWorkspace(workspace);
      if (result.isOk()) {
        localLogger.info(
          { message: result.value },
          "Seat count check succeeded."
        );
      }
      if (result.isErr()) {
        localLogger.error(
          { workspaceId: workspace.sId, error: result.error },
          "Seat count check failed."
        );
      }
    } else {
      localLogger.info("Found workspace.");
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await checkWorkspaceSeatCount(workspace, logger, execute);
  });
});
