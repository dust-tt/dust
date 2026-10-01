import config from "@app/lib/api/config";
import { ConsumptionExportReadyPayloadSchema } from "@app/lib/notifications/triggers/consumption-export-ready";
import { CONSUMPTION_EXPORT_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";

export const consumptionExportReadyWorkflow = workflow(
  CONSUMPTION_EXPORT_READY_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("send-in-app", async () => {
      return {
        subject: "Your consumption export is ready",
        body: "The raw consumption data you requested has finished generating and is ready to download.",
        primaryAction: {
          label: "Download",
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
