import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import logger from "@app/logger/logger";
import {
  MANUAL_ACTION_REQUIRED_TAG,
  MANUAL_ACTION_REQUIRED_TRIGGER_ID,
  SOUND_NOTIFICATION_METADATA_KEYS,
} from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workflow } from "@novu/framework";
import z from "zod";

const ManualActionRequiredPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  actionId: z.string().optional(),
});

type ManualActionRequiredPayloadType = z.infer<
  typeof ManualActionRequiredPayloadSchema
>;

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

const triggerManualActionRequiredNotification = async (
  auth: Authenticator,
  { conversationId, actionId }: { conversationId: string; actionId?: string }
): Promise<Result<void, DustError<"internal_error">>> => {
  const user = auth.user();
  if (!user) {
    return new Ok(undefined);
  }

  const soundEnabled = await user.getMetadata(
    SOUND_NOTIFICATION_METADATA_KEYS.enabled
  );
  if (soundEnabled?.value !== "true") {
    return new Ok(undefined);
  }

  const novuPayload: ManualActionRequiredPayloadType = {
    workspaceId: auth.getNonNullableWorkspace().sId,
    conversationId,
    actionId,
  };

  try {
    const novuClient = await getNovuClient();

    const r = await novuClient.triggerBulk({
      events: [
        {
          workflowId: MANUAL_ACTION_REQUIRED_TRIGGER_ID,
          to: {
            subscriberId: user.sId,
            email: user.email,
            firstName: user.firstName ?? undefined,
            lastName: user.lastName ?? undefined,
          },
          payload: novuPayload,
        },
      ],
    });

    if (r.result.some((res) => !!res.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger manual action required notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger manual action required notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

export function notifyManualActionRequired(
  auth: Authenticator,
  { conversationId, actionId }: { conversationId: string; actionId?: string }
): void {
  void triggerManualActionRequiredNotification(auth, {
    conversationId,
    actionId,
  }).then((notifRes) => {
    if (notifRes.isErr()) {
      logger.error(
        {
          error: notifRes.error,
          workspaceId: auth.getNonNullableWorkspace().sId,
          conversationId,
        },
        "Failed to trigger manual action required notification"
      );
    }
  });
}
