import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import { MEMBERSHIP_UPGRADE_REQUEST_CAUSES } from "@app/types/memberships";
import type { MembershipUpgradeRequestCause } from "@app/types/memberships";
import { UPGRADE_REQUEST_CREATED_TRIGGER_ID } from "@app/types/notification_preferences";
import z from "zod";

export const UpgradeRequestCreatedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  requesterName: z.string(),
  requesterEmail: z.string().nullable(),
  reason: z.string().nullable(),
  cause: z.enum(MEMBERSHIP_UPGRADE_REQUEST_CAUSES).optional(),
  groupName: z.string().nullable().optional(),
});

export type UpgradeRequestCreatedPayloadType = z.infer<
  typeof UpgradeRequestCreatedPayloadSchema
>;

/**
 * Email a workspace's admins and managers that a member requested an upgrade (a higher personal
 * limit, a raise of their group budget, or a seat, depending on `cause`). One Novu event is triggered per admin (subscribed by their Dust user sId),
 * deduped via a `transactionId` keyed on the upgrade-request sId so redeliveries don't
 * re-send. Fire-and-forget — errors are logged but don't block the caller.
 */
export function notifyUpgradeRequested({
  users,
  workspaceId,
  workspaceName,
  requestId,
  requesterName,
  requesterEmail,
  reason,
  cause,
  groupName,
}: {
  users: Array<{
    sId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }>;
  workspaceId: string;
  workspaceName: string;
  requestId: string;
  requesterName: string;
  requesterEmail: string | null;
  reason: string | null;
  cause: MembershipUpgradeRequestCause;
  groupName: string | null;
}): void {
  if (users.length === 0) {
    return;
  }

  const payload: UpgradeRequestCreatedPayloadType = {
    workspaceId,
    workspaceName,
    requesterName,
    requesterEmail,
    reason,
    cause,
    groupName,
  };

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: users.map((admin) => ({
          workflowId: UPGRADE_REQUEST_CREATED_TRIGGER_ID,
          to: {
            subscriberId: admin.sId,
            email: admin.email,
            firstName: admin.firstName ?? undefined,
            lastName: admin.lastName ?? undefined,
          },
          payload,
          transactionId: `${UPGRADE_REQUEST_CREATED_TRIGGER_ID}-${requestId}-${admin.sId}`,
        })),
      })
    )
    .then((r) => {
      if (r.result.some((res) => !!res.error?.length)) {
        logger.error(
          { workspaceId, requestId },
          "Failed to trigger upgrade request created notification"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { err, workspaceId, requestId },
        "Failed to trigger upgrade request created notification"
      );
    });
}
