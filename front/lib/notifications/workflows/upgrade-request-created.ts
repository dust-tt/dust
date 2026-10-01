import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import type { UpgradeRequestCreatedPayloadType } from "@app/lib/notifications/triggers/upgrade-request-created";
import { UpgradeRequestCreatedPayloadSchema } from "@app/lib/notifications/triggers/upgrade-request-created";
import { DEFAULT_LOCALE } from "@app/types/locale";
import {
  UPGRADE_REQUEST_CREATED_TAG,
  UPGRADE_REQUEST_CREATED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { isDevelopment } from "@app/types/shared/env";
import { workflow } from "@novu/framework";

const isUpgradeRequestCreatedPayload = (
  payload: unknown
): payload is UpgradeRequestCreatedPayloadType =>
  UpgradeRequestCreatedPayloadSchema.safeParse(payload).success;

function formatRequester(payload: UpgradeRequestCreatedPayloadType): string {
  return payload.requesterEmail
    ? `${payload.requesterName} (${payload.requesterEmail})`
    : payload.requesterName;
}

function formatRequestDetails(
  payload: UpgradeRequestCreatedPayloadType
): string {
  return payload.reason ? ` (reason: ${payload.reason})` : "";
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
        const requesterByKey = new Map<
          string,
          { label: string; details: string }
        >();
        for (const event of events) {
          if (!isUpgradeRequestCreatedPayload(event.payload)) {
            continue;
          }
          const key =
            event.payload.requesterEmail ?? event.payload.requesterName;
          if (!requesterByKey.has(key)) {
            requesterByKey.set(key, {
              label: formatRequester(event.payload),
              details: formatRequestDetails(event.payload),
            });
          }
        }
        const requesters = Array.from(requesterByKey.values());
        const count = requesters.length;

        const subject =
          count > 1
            ? `[Dust] ${count} members requested a spend-limit upgrade`
            : `[Dust] ${requesters[0].label} requested a spend-limit upgrade`;

        const intro =
          count > 1
            ? `${count} members have reached their per-user spend limit and are requesting an upgrade:`
            : `${requesters[0].label} has reached their per-user spend limit and is requesting an upgrade${requesters[0].details}.`;
        const list =
          count > 1
            ? requesters.map((r) => `• ${r.label}${r.details}`).join("\n")
            : "";
        const outro =
          count > 1
            ? `Review the requests and adjust their limits from your workspace usage page.`
            : `Review the request and adjust their limit from your workspace usage page.`;
        const content = [intro, list, outro].filter(Boolean).join("\n");

        const body = await renderEmail({
          i18n: await getNotificationI18n(DEFAULT_LOCALE),
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
