import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import {
  UPGRADE_REQUEST_CREATED_TAG,
  UPGRADE_REQUEST_CREATED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { isDevelopment } from "@app/types/shared/env";
import { workflow } from "@novu/framework";
import z from "zod";

const UpgradeRequestCreatedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  requesterName: z.string(),
  requesterEmail: z.string().nullable(),
});

type UpgradeRequestCreatedPayloadType = z.infer<
  typeof UpgradeRequestCreatedPayloadSchema
>;

const isUpgradeRequestCreatedPayload = (
  payload: unknown
): payload is UpgradeRequestCreatedPayloadType =>
  UpgradeRequestCreatedPayloadSchema.safeParse(payload).success;

function formatRequester(payload: UpgradeRequestCreatedPayloadType): string {
  return payload.requesterEmail
    ? `${payload.requesterName} (${payload.requesterEmail})`
    : payload.requesterName;
}

export const upgradeRequestCreatedWorkflow = workflow(
  UPGRADE_REQUEST_CREATED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const { events } = await step.digest("digest", async () => {
      const digestKey = `${subscriber.subscriberId}-workspace-${payload.workspaceId}-upgrade-requests`;
      return isDevelopment()
        ? { amount: 2, unit: "minutes", digestKey }
        : { amount: 15, unit: "minutes", digestKey };
    });

    await step.email(
      "upgrade-request-created-email",
      async () => {
        // Dedupe by requester (a member could re-request across the window) and
        // keep insertion order so the email lists distinct people once.
        const requesterByKey = new Map<string, string>();
        for (const event of events) {
          if (!isUpgradeRequestCreatedPayload(event.payload)) {
            continue;
          }
          const key =
            event.payload.requesterEmail ?? event.payload.requesterName;
          if (!requesterByKey.has(key)) {
            requesterByKey.set(key, formatRequester(event.payload));
          }
        }
        const requesters = Array.from(requesterByKey.values());
        const count = requesters.length;

        const subject =
          count > 1
            ? `[Dust] ${count} members requested a spend-limit upgrade`
            : `[Dust] ${requesters[0]} requested a spend-limit upgrade`;

        const intro =
          count > 1
            ? `${count} members have reached their per-user spend limit and are requesting an upgrade:`
            : `${requesters[0]} has reached their per-user spend limit and is requesting an upgrade.`;
        const list =
          count > 1 ? requesters.map((r) => `• ${r}`).join("\n") : "";
        const outro =
          count > 1
            ? `Review the requests and adjust their limits from your workspace usage page.`
            : `Review the request and adjust their limit from your workspace usage page.`;
        const content = [intro, list, outro].filter(Boolean).join("\n");

        const body = await renderEmail({
          name: subscriber.firstName ?? "there",
          workspace: {
            id: payload.workspaceId,
            name: payload.workspaceName,
          },
          content,
          action: {
            label: count > 1 ? "Review requests" : "Review request",
            url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
          },
        });
        return { subject, body };
      },
      {
        skip: async () =>
          !events.some((event) =>
            isUpgradeRequestCreatedPayload(event.payload)
          ),
      }
    );
  },
  {
    payloadSchema: UpgradeRequestCreatedPayloadSchema,
    tags: [UPGRADE_REQUEST_CREATED_TAG],
  }
);

/**
 * Email a workspace's admins that a member requested a spend-limit upgrade. One
 * Novu event is triggered per admin (subscribed by their Dust user sId), deduped
 * via a `transactionId` keyed on the upgrade-request sId so redeliveries don't
 * re-send. Fire-and-forget — errors are logged but don't block the caller.
 */
export function notifyAdminsUpgradeRequested({
  admins,
  workspaceId,
  workspaceName,
  requestId,
  requesterName,
  requesterEmail,
}: {
  admins: Array<{
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
}): void {
  if (admins.length === 0) {
    return;
  }

  const payload: UpgradeRequestCreatedPayloadType = {
    workspaceId,
    workspaceName,
    requesterName,
    requesterEmail,
  };

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: admins.map((admin) => ({
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
