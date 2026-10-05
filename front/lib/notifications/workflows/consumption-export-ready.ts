import config from "@app/lib/api/config";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import { ConsumptionExportReadyPayloadSchema } from "@app/lib/notifications/triggers/consumption-export-ready";
import { CONSUMPTION_EXPORT_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildConsumptionExportReadyInAppCopy(i18n: I18n): {
  subject: string;
  body: string;
  actionLabel: string;
} {
  return {
    subject: i18n._(msg`Your consumption export is ready`),
    body: i18n._(
      msg`The raw consumption data you requested has finished generating and is ready to download.`
    ),
    actionLabel: i18n._(msg({ message: "Download", context: "action" })),
  };
}

export const consumptionExportReadyWorkflow = workflow(
  CONSUMPTION_EXPORT_READY_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.inApp("send-in-app", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, body, actionLabel } =
        buildConsumptionExportReadyInAppCopy(i18n);
      return {
        subject,
        body,
        primaryAction: {
          label: actionLabel,
          redirect: {
            url: `${config.getAppUrl()}/w/${payload.workspaceId}/analytics/consumption`,
          },
        },
        data: {
          workspaceId: payload.workspaceId,
        },
      };
    });
  },
  {
    payloadSchema: ConsumptionExportReadyPayloadSchema,
    tags: ["admin"],
  }
);
