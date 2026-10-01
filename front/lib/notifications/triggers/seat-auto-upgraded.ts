import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import { SEAT_AUTO_UPGRADED_TRIGGER_ID } from "@app/types/notification_preferences";
import { z } from "zod";

export const SeatAutoUpgradedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  memberName: z.string(),
  memberEmail: z.string().nullable(),
  previousSeatType: z.string(),
  newSeatType: z.string(),
});

export type SeatAutoUpgradedPayloadType = z.infer<
  typeof SeatAutoUpgradedPayloadSchema
>;

/**
 * Email a workspace's admins that a member's seat was automatically upgraded
 * after they hit their credit limit. One Novu event is triggered per admin
 * (subscribed by their Dust user sId), deduped via a `transactionId` keyed on
 * the member sId and the new seat type so redeliveries don't re-send.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function notifyAdminsSeatAutoUpgraded({
  admins,
  workspaceId,
  workspaceName,
  memberId,
  memberName,
  memberEmail,
  previousSeatType,
  newSeatType,
}: {
  admins: Array<{
    sId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }>;
  workspaceId: string;
  workspaceName: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  previousSeatType: string;
  newSeatType: string;
}): void {
  if (admins.length === 0) {
    return;
  }

  const payload: SeatAutoUpgradedPayloadType = {
    workspaceId,
    workspaceName,
    memberName,
    memberEmail,
    previousSeatType,
    newSeatType,
  };

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: admins.map((admin) => ({
          workflowId: SEAT_AUTO_UPGRADED_TRIGGER_ID,
          to: {
            subscriberId: admin.sId,
            email: admin.email,
            firstName: admin.firstName ?? undefined,
            lastName: admin.lastName ?? undefined,
          },
          payload,
          transactionId: `${SEAT_AUTO_UPGRADED_TRIGGER_ID}-${memberId}-${newSeatType}-${admin.sId}`,
        })),
      })
    )
    .then((r) => {
      if (r.result.some((res) => !!res.error?.length)) {
        logger.error(
          { workspaceId, memberId },
          "Failed to trigger seat auto-upgraded notification"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { err, workspaceId, memberId },
        "Failed to trigger seat auto-upgraded notification"
      );
    });
}
