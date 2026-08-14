import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getNovuClient } from "@app/lib/notifications";
import logger from "@app/logger/logger";
import { CONSUMPTION_EXPORT_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";
import z from "zod";

const ConsumptionExportReadyPayloadSchema = z.object({
  workspaceId: z.string(),
});

type ConsumptionExportReadyPayloadType = z.infer<
  typeof ConsumptionExportReadyPayloadSchema
>;

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

/**
 * Fire-and-forget helper to notify the requesting user that their consumption export is
 * ready to download. Errors are logged but don't block the caller.
 */
export function notifyConsumptionExportReady(
  auth: Authenticator,
  exportId: string
): void {
  const user = auth.user();
  if (!user) {
    return;
  }
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const userSId = user.sId;

  const payload: ConsumptionExportReadyPayloadType = { workspaceId };

  // Ties the Novu transaction to the stable exportId so a Temporal retry after the
  // completion ack is lost re-sends the same transaction instead of a duplicate notification.
  const transactionId = `consumption-export-ready-${workspaceId}-${userSId}-${exportId}`;

  void getNovuClient()
    .then((novuClient) =>
      novuClient.triggerBulk({
        events: [
          {
            workflowId: CONSUMPTION_EXPORT_READY_TRIGGER_ID,
            transactionId,
            to: {
              subscriberId: userSId,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName ?? undefined,
            },
            payload,
          },
        ],
      })
    )
    .then((r) => {
      if (r.result.some((res) => !!res.error?.length)) {
        logger.error(
          { workspaceId, userSId, transactionId },
          "Failed to trigger consumption export ready notification"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { err, workspaceId, userSId, transactionId },
        "Failed to trigger consumption export ready notification"
      );
    });
}
