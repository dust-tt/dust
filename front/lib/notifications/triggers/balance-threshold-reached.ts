import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import {
  BALANCE_THRESHOLD_REACHED_TAG,
  BALANCE_THRESHOLD_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";
import z from "zod";

const BalanceThresholdReachedPayloadSchema = z.object({
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

type BalanceThresholdReachedPayloadType = z.infer<
  typeof BalanceThresholdReachedPayloadSchema
>;

function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US");
}

// Email-only for now (no in-app step).
export const balanceThresholdReachedWorkflow = workflow(
  BALANCE_THRESHOLD_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("balance-threshold-reached-email", async () => {
      const subject = `[Dust] Credit balance alert - your workspace balance dropped below ${formatCredits(
        payload.balanceThresholdCredits
      )} credits`;

      const remainingLine =
        payload.remainingBalanceCredits !== null
          ? `\nRemaining balance: ${formatCredits(payload.remainingBalanceCredits)} credits`
          : "";
      const purchaseLine = payload.isEnterprise
        ? `To avoid running out of credits, please reach out to your Dust representative.`
        : `To avoid running out of credits, you can purchase more from your workspace usage page.`;
      const content =
        `Your workspace's remaining credit balance has dropped below the threshold you configured.\n` +
        `Alert threshold: ${formatCredits(payload.balanceThresholdCredits)} credits${remainingLine}\n` +
        purchaseLine;

      const body = await renderEmail({
        name: subscriber.firstName ?? "there",
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: payload.isEnterprise ? "Manage credits" : "See usage details",
          url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
        },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: BalanceThresholdReachedPayloadSchema,
    tags: [BALANCE_THRESHOLD_REACHED_TAG],
  }
);

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
