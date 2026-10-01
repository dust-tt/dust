import { ManualActionRequiredPayloadSchema } from "@app/lib/notifications/triggers/manual-action-required";
import {
  MANUAL_ACTION_REQUIRED_TAG,
  MANUAL_ACTION_REQUIRED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";

export const manualActionRequiredWorkflow = workflow(
  MANUAL_ACTION_REQUIRED_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("manual-action-required-in-app", async () => {
      return {
        subject: "Action required",
        body: "A manual action requires your approval.",
        data: {
          autoDelete: true,
          conversationId: payload.conversationId,
          actionId: payload.actionId,
        },
      };
    });
  },
  {
    payloadSchema: ManualActionRequiredPayloadSchema,
    tags: [MANUAL_ACTION_REQUIRED_TAG],
  }
);
