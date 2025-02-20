import type { LightWorkspaceType } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";

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
