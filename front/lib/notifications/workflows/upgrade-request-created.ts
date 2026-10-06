import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { UpgradeRequestCreatedPayloadType } from "@app/lib/notifications/triggers/upgrade-request-created";
import { UpgradeRequestCreatedPayloadSchema } from "@app/lib/notifications/triggers/upgrade-request-created";
import {
  UPGRADE_REQUEST_CREATED_TAG,
  UPGRADE_REQUEST_CREATED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { isDevelopment } from "@app/types/shared/env";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
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

function formatRequesterLine(
  i18n: I18n,
  payload: UpgradeRequestCreatedPayloadType
): string {
  const requester = formatRequester(payload);
  const { reason } = payload;
  return reason
    ? i18n._(msg`• ${requester} (reason: ${reason})`)
    : `• ${requester}`;
}

export function buildUpgradeRequestCreatedEmailCopy(
  i18n: I18n,
  requests: UpgradeRequestCreatedPayloadType[]
): { subject: string; content: string; actionLabel: string } {
  const count = requests.length;

  if (count > 1) {
    return {
      subject: i18n._(
        msg`[Dust] ${count} members requested a spend-limit upgrade`
      ),
      content: [
        i18n._(
          msg`${count} members have reached their per-user spend limit and are requesting an upgrade:`
        ),
        requests.map((r) => formatRequesterLine(i18n, r)).join("\n"),
        i18n._(
          msg`Review the requests and adjust their limits from your workspace usage page.`
        ),
      ].join("\n"),
      actionLabel: i18n._(msg`Review requests`),
    };
  }

  const requester = formatRequester(requests[0]);
  const { reason } = requests[0];
  return {
    subject: i18n._(msg`[Dust] ${requester} requested a spend-limit upgrade`),
    content: [
      reason
        ? i18n._(
            msg`${requester} has reached their per-user spend limit and is requesting an upgrade (reason: ${reason}).`
          )
        : i18n._(
            msg`${requester} has reached their per-user spend limit and is requesting an upgrade.`
          ),
      i18n._(
        msg`Review the request and adjust their limit from your workspace usage page.`
      ),
    ].join("\n"),
    actionLabel: i18n._(msg`Review request`),
  };
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
        const requestByKey = new Map<
          string,
          UpgradeRequestCreatedPayloadType
        >();
        for (const event of events) {
          if (!isUpgradeRequestCreatedPayload(event.payload)) {
            continue;
          }
          const key =
            event.payload.requesterEmail ?? event.payload.requesterName;
          if (!requestByKey.has(key)) {
            requestByKey.set(key, event.payload);
          }
        }

        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );
        const { subject, content, actionLabel } =
          buildUpgradeRequestCreatedEmailCopy(
            i18n,
            Array.from(requestByKey.values())
          );

        const body = await renderEmail({
          i18n,
          name: subscriber.firstName ?? undefined,
          workspace: {
            id: payload.workspaceId,
            name: payload.workspaceName,
          },
          content,
          action: {
            label: actionLabel,
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
