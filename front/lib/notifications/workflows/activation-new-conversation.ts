import { isMessageUnread } from "@app/components/assistant/conversation/utils";
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import {
  getNovuClient,
  getUserNotificationDelay,
} from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getConversationDetails } from "@app/lib/notifications/helpers";
import type { UserResource } from "@app/lib/resources/user_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isLightAgentMessageType } from "@app/types/assistant/conversation";
import {
  ACTIVATION_NEW_CONVERSATION_TRIGGER_ID,
  NOTIFICATION_DELAY_OPTIONS,
  NOTIFICATION_PREFERENCES_DELAYS,
} from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workflow } from "@novu/framework";
import { z } from "zod";

// An unread activation conversation created through the activation nudge flow are sent
// to the target user as a dedicated, standalone email. It has no digest step, so a
// conversation sent this way is never also bundled into the unread digest for the same activity.

// For the email UI itself, right now it reuses and says something basic, will be fleshed out later.

const activationNewConversationPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
});

export type activationNewConversationPayloadType = z.infer<
  typeof activationNewConversationPayloadSchema
>;

const activationNewConversationDetailsSchema = z.object({
  subject: z.string(),
  workspaceName: z.string(),
});

export type activationNewConversationDetailsType = z.infer<
  typeof activationNewConversationDetailsSchema
>;

const userNotificationDelaySchema = z.object({
  delay: z.enum(NOTIFICATION_DELAY_OPTIONS),
});

const shouldSkipActivationNewConversation = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: activationNewConversationPayloadType;
}): Promise<boolean> => {
  if (!subscriberId) {
    return true;
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  const conversationRes = await getLightConversation(
    auth,
    payload.conversationId
  );
  if (conversationRes.isErr()) {
    return true;
  }
  const conversation = conversationRes.value;

  // Send only when the agent has actually finished replying and that reply is still unread for this user.
  const hasUnreadAgentReply = conversation.content.some(
    (msg) =>
      isLightAgentMessageType(msg) &&
      msg.status === "succeeded" &&
      isMessageUnread(msg, conversation.lastReadMs)
  );

  return !hasUnreadAgentReply;
};

const getActivationNewConversationDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: activationNewConversationPayloadType;
}): Promise<activationNewConversationDetailsType> => {
  const detailsResult = await getConversationDetails({
    subscriberId: subscriberId ?? "",
    payload: { ...payload, isNewProjectConversation: true },
  });
  if (detailsResult.isErr()) {
    // Only reached for a deleted conversation, in which case the email step is
    // already skipped, so this value is never actually delivered.
    return { subject: "A new conversation", workspaceName: "your workspace" };
  }

  return {
    subject: detailsResult.value.subject,
    workspaceName: detailsResult.value.workspaceName,
  };
};

export const activationNewConversationWorkflow = workflow(
  ACTIVATION_NEW_CONVERSATION_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-conversation-details",
      async () => {
        return getActivationNewConversationDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: activationNewConversationDetailsSchema,
      }
    );

    // Respect all the user's email notification preferences.
    const { delay } = await step.custom(
      "get-user-notification-delay",
      async () => {
        const userNotificationDelay = await getUserNotificationDelay({
          subscriberId: subscriber.subscriberId,
          workspaceId: payload.workspaceId,
          channel: "email",
        });
        return { delay: userNotificationDelay };
      },
      {
        outputSchema: userNotificationDelaySchema,
      }
    );

    await step.delay("apply-user-delay", async () => {
      return { type: "regular", ...NOTIFICATION_PREFERENCES_DELAYS[delay] };
    });

    await step.email(
      "send-email",
      async () => {
        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: details.workspaceName,
          },
          content: `There's something new waiting for you: "${details.subject}".`,
          action: {
            label: "Open conversation",
            url:
              config.getAppUrl() +
              getConversationRoute(payload.workspaceId, payload.conversationId),
          },
        });

        return {
          subject: `[Dust] ${details.subject}`,
          body,
        };
      },
      {
        skip: async () =>
          shouldSkipActivationNewConversation({
            subscriberId: subscriber.subscriberId,
            payload,
          }),
      }
    );
  },
  {
    payloadSchema: activationNewConversationPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);

export const triggerActivationNewConversationEmail = async (
  auth: Authenticator,
  {
    conversation,
    userToNotify,
  }: {
    conversation: ConversationWithoutContentType;
    userToNotify: UserResource;
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  try {
    const novuClient = await getNovuClient();

    const payload: activationNewConversationPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
    };

    const r = await novuClient.triggerBulk({
      events: [
        {
          workflowId: ACTIVATION_NEW_CONVERSATION_TRIGGER_ID,
          to: {
            subscriberId: userToNotify.sId,
            email: userToNotify.email,
            firstName: userToNotify.firstName ?? undefined,
            lastName: userToNotify.lastName ?? undefined,
          },
          payload,
        },
      ],
    });

    if (r.result.some((event) => !!event.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger activation new conversation email: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger activation new conversation email",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};
