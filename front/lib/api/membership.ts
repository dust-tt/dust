import type { Transaction } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type { LightWorkspaceType } from "@app/types";

export async function revokeAndTrackMembership(
  workspace: LightWorkspaceType,
  user: UserResource,
  transaction?: Transaction
) {
  const revokeResult = await MembershipResource.revokeMembership({
    user,
    workspace,
    transaction,
  });

  if (revokeResult.isOk()) {
    // Delete all triggers created by the user
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const deleteTriggerResult =
      await TriggerResource.deleteAllForUser(userAuth);
    if (deleteTriggerResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          userId: user.sId,
          error: deleteTriggerResult.error,
        },
        "Failed to delete triggers for revoked user"
      );
    }

    await launchUpdateUsageWorkflow({ workspaceId: workspace.sId });
    void ServerSideTracking.trackRevokeMembership({
      user: user.toJSON(),
      workspace,
      role: revokeResult.value.role,
      startAt: revokeResult.value.startAt,
      endAt: revokeResult.value.endAt,
    });
  }

  return revokeResult;
}
