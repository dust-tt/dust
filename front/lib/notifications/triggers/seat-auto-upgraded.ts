import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import {
  SEAT_AUTO_UPGRADED_TAG,
  SEAT_AUTO_UPGRADED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { isDevelopment } from "@app/types/shared/env";
import { workflow } from "@novu/framework";
import { z } from "zod";

const SeatAutoUpgradedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  memberName: z.string(),
  memberEmail: z.string().nullable(),
  previousSeatType: z.string(),
  newSeatType: z.string(),
});

type SeatAutoUpgradedPayloadType = z.infer<
  typeof SeatAutoUpgradedPayloadSchema
>;

const isSeatAutoUpgradedPayload = (
  payload: unknown
): payload is SeatAutoUpgradedPayloadType =>
  SeatAutoUpgradedPayloadSchema.safeParse(payload).success;

function formatMember(payload: SeatAutoUpgradedPayloadType): string {
  return payload.memberEmail
    ? `${payload.memberName} (${payload.memberEmail})`
    : payload.memberName;
}

export const seatAutoUpgradedWorkflow = workflow(
  SEAT_AUTO_UPGRADED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const { events } = await step.digest("digest", async () => {
      const digestKey = `${subscriber.subscriberId}-workspace-${payload.workspaceId}-seat-auto-upgrades`;
      return isDevelopment()
        ? { amount: 2, unit: "minutes", digestKey }
        : { cron: "0 */5 * * *", digestKey }; // Every 5 hours
    });

    await step.email(
      "seat-auto-upgraded-email",
      async () => {
        // Dedupe by member (a member could be upgraded more than once across
        // the window) and keep insertion order so the email lists each once.
        const memberByKey = new Map<string, SeatAutoUpgradedPayloadType>();
        for (const event of events) {
          if (!isSeatAutoUpgradedPayload(event.payload)) {
            continue;
          }
          const key = event.payload.memberEmail ?? event.payload.memberName;
          if (!memberByKey.has(key)) {
            memberByKey.set(key, event.payload);
          }
        }
        const members = Array.from(memberByKey.values());
        const count = members.length;

        const subject =
          count > 1
            ? `[Dust] ${count} members were auto-upgraded to higher seats`
            : `[Dust] ${formatMember(members[0])} was auto-upgraded to a ${members[0].newSeatType} seat`;

        const intro =
          count > 1
            ? `${count} members reached their credit limit and were automatically upgraded to higher seats so they can keep working:`
            : `${formatMember(members[0])} reached their credit limit and was automatically upgraded from a ${members[0].previousSeatType} seat to a ${members[0].newSeatType} seat so they can keep working.`;
        const list =
          count > 1
            ? members
                .map(
                  (m) =>
                    `• ${formatMember(m)} — ${m.previousSeatType} → ${m.newSeatType}`
                )
                .join("\n")
            : "";
        const outro = `This might increase your subscription cost. You can turn off automatic seat upgrades from your workspace usage settings.`;
        const content = [intro, list, outro].filter(Boolean).join("\n\n");

        const body = await renderEmail({
          name: subscriber.firstName ?? "there",
          workspace: {
            id: payload.workspaceId,
            name: payload.workspaceName,
          },
          content,
          action: {
            label: "Go to workspace usage",
            url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
          },
        });
        return { subject, body };
      },
      {
        skip: async () =>
          !events.some((event) => isSeatAutoUpgradedPayload(event.payload)),
      }
    );
  },
  {
    payloadSchema: SeatAutoUpgradedPayloadSchema,
    tags: [SEAT_AUTO_UPGRADED_TAG],
  }
);

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
