import { workflow } from "@novu/framework";
import z from "zod";

import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { Authenticator } from "@app/lib/auth";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserMessageOrigin } from "@app/types";
import {
  assertNever,
  isContentFragmentType,
  isUserMessageType,
} from "@app/types";

const ConversationUnreadPayloadSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
});

export type ConversationUnreadPayloadType = z.infer<
  typeof ConversationUnreadPayloadSchema
>;

export const shouldSendNotification = (
  userMessageOrigin?: UserMessageOrigin | null
): boolean => {
  switch (userMessageOrigin) {
    case "web":
    case "agent_handover":
    case "extension":
      return true;
    case "api":
    case "email":
    case "excel":
    case "github-copilot-chat":
    case "gsheet":
    case "make":
    case "n8n":
    case "powerpoint":
    case "raycast":
    case "run_agent":
    case "slack":
    case "teams":
    case "transcript":
    case "triggered_programmatic":
    case "triggered":
    case "zapier":
    case "zendesk":
    case undefined:
    case null:
      return false;
    default:
      assertNever(userMessageOrigin);
  }
};

export const CONVERSATION_UNREAD_TRIGGER_ID = "conversation-unread";

// The payload will have empty values when novu inspect the workflow.
// The payload will have "[placeholder]" when a step is previewed in local studio UI.
const isRealConversationPayload = (
  payload: ConversationUnreadPayloadType
): boolean => {
  return !!payload.conversationId && payload.conversationId !== "[placeholder]";
};

const ConversationDetailsSchema = z.object({
  recipentFullname: z.string(),
  subject: z.string(),
  author: z.string(),
  previewText: z.string(),
  avatarUrl: z.string().optional(),
  isFromTrigger: z.boolean(),
});

type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

const getConversationDetails = async (
  payload: ConversationUnreadPayloadType
): Promise<ConversationDetailsType> => {
  let recipentFullname: string = "You";
  let subject: string = "A dust conversation";
  let author: string = "Someone else";
  let previewText: string = "No preview available.";
  let avatarUrl: string | undefined;
  let isFromTrigger: boolean = false;

  if (isRealConversationPayload(payload)) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      payload.userId,
      payload.workspaceId
    );

    const conversationRes = await ConversationResource.fetchById(
      auth,
      payload.conversationId
    );

    if (conversationRes.isOk()) {
      const conversation = conversationRes.value;
      if (conversation) {
        recipentFullname = auth.getNonNullableUser().fullName();
        subject = conversation.title ?? "Dust conversation";
        isFromTrigger = !!conversation.triggerSId;

        // Retrieve the message that triggered the notification
        const messageRes = await conversation.getMessageById(
          auth,
          payload.messageId
        );

        if (messageRes.isOk()) {
          const rendered = await batchRenderMessages(
            auth,
            conversation,
            [messageRes.value],
            "light"
          );

          if (rendered.isOk() && rendered.value.length === 1) {
            const lightMessage = rendered.value[0];
            if (isContentFragmentType(lightMessage)) {
              // Do nothing. Content fragments are not displayed in the notification.
            } else if (isUserMessageType(lightMessage)) {
              author = lightMessage.user?.fullName ?? "Someone else";
              avatarUrl = lightMessage.user?.image ?? undefined;
              previewText = lightMessage.content;
            } else {
              author = lightMessage.configuration.name
                ? `@${lightMessage.configuration.name}`
                : "An agent";
              avatarUrl = lightMessage.configuration.pictureUrl ?? undefined;
              previewText = lightMessage.content ?? "No content";
            }
            previewText =
              previewText.length > 1024
                ? previewText.slice(0, 1024) + "..."
                : previewText;
          }
        }
      }
    }
  }
  return {
    recipentFullname,
    subject,
    author,
    previewText,
    avatarUrl,
    isFromTrigger,
  };
};

const shouldSkipConversation = async (
  payload: ConversationUnreadPayloadType
): Promise<boolean> => {
  if (isRealConversationPayload(payload)) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      payload.userId,
      payload.workspaceId
    );

    const conversationRes = await ConversationResource.fetchById(
      auth,
      payload.conversationId
    );

    if (conversationRes.isErr() || !conversationRes.value) {
      return true;
    }

    const conversation = conversationRes.value;

    const { actionRequired, unread } =
      await ConversationResource.getActionRequiredAndUnreadForUser(
        auth,
        conversation.id
      );

    if (!actionRequired && !unread) {
      return true;
    }
  }

  return false;
};

export const conversationUnreadWorkflow = workflow(
  CONVERSATION_UNREAD_TRIGGER_ID,
  async ({ step, payload }) => {
    const details = await step.custom(
      "get-conversation-details",
      async () => {
        return getConversationDetails(payload);
      },
      {
        outputSchema: ConversationDetailsSchema,
      }
    );

    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject: details.subject,
          body: details.previewText,
          primaryAction: {
            label: "View",
            redirect: {
              url: getConversationRoute(
                payload.workspaceId,
                payload.conversationId
              ),
            },
          },
          data: {
            // This custom flag means that the in-app message should be deleted automatically after it is received (we don't want to clutter the user's inbox).
            autoDelete: true,
            skipPushNotification: details.isFromTrigger,
            conversationId: payload.conversationId,
          },
        };
      },
      {
        skip: async () => shouldSkipConversation(payload),
      }
    );

    await step.delay("delay", () => ({
      type: "regular",
      amount: 3,
      unit: "hours",
    }));

    await step.email(
      "send-email",
      async () => {
        const body = await renderEmail({
          name: details.recipentFullname,
          avatarUrl: details.avatarUrl,
          content:
            "You have a new unread message from " +
            details.author +
            ":\n\n" +
            details.previewText,
          action: {
            label: "Open in Dust",
            url:
              process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL +
              getConversationRoute(payload.workspaceId, payload.conversationId),
          },
        });
        return {
          subject: `[Dust] ${details.subject} (new message)`,
          body,
        };
      },
      {
        // No email from trigger until we give more control over the notification to the users.
        skip: async () =>
          (await shouldSkipConversation(payload)) || details.isFromTrigger,
      }
    );
  },
  {
    payloadSchema: ConversationUnreadPayloadSchema,
  }
);
