import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import { BALANCE_THRESHOLD_REACHED_TRIGGER_ID } from "@app/types/notification_preferences";
import z from "zod";

export const BalanceThresholdReachedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  // The credit-balance threshold (in credits) the admin configured.
  balanceThresholdCredits: z.number(),
  // The remaining balance reported by Metronome when the alert fired, if known.
  remainingBalanceCredits: z.number().nullable(),
  // Enterprise workspaces can't self-serve credits, so we point them to their
  // Dust representative instead of the usage page.
  isEnterprise: z.boolean(),
});

export type BalanceThresholdReachedPayloadType = z.infer<
  typeof BalanceThresholdReachedPayloadSchema
>;

/**
 * Email a workspace's admins that their configured credit-balance threshold has
 * been reached. One Novu event is triggered per admin (subscribed by their Dust
 * user sId), deduped via a `transactionId` keyed on the Metronome event so
 * redeliveries don't re-send. Fire-and-forget — errors are logged but don't
 * block the caller.
 */
export function notifyAdminsBalanceThresholdReached({
  admins,
  workspaceId,
  workspaceName,
  balanceThresholdCredits,
  remainingBalanceCredits,
  isEnterprise,
  eventId,
}: {
  admins: Array<{
    sId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }>;
  workspaceId: string;
  workspaceName: string;
  balanceThresholdCredits: number;
  remainingBalanceCredits: number | null;
  isEnterprise: boolean;
  eventId: string;
}): void {
  if (admins.length === 0) {
    return;
  }

  const payload: BalanceThresholdReachedPayloadType = {
    workspaceId,
    workspaceName,
    balanceThresholdCredits,
    remainingBalanceCredits,
    isEnterprise,
  };

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: admins.map((admin) => ({
          workflowId: BALANCE_THRESHOLD_REACHED_TRIGGER_ID,
          to: {
            subscriberId: admin.sId,
            email: admin.email,
            firstName: admin.firstName ?? undefined,
            lastName: admin.lastName ?? undefined,
          },
          payload,
          transactionId: `${BALANCE_THRESHOLD_REACHED_TRIGGER_ID}-${eventId}-${admin.sId}`,
        })),
      })
    )
    .then((r) => {
      if (r.result.some((res) => !!res.error?.length)) {
        logger.error(
          { workspaceId, balanceThresholdCredits },
          "Failed to trigger balance threshold reached notification"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { err, workspaceId, balanceThresholdCredits },
        "Failed to trigger balance threshold reached notification"
      );
    });
}
