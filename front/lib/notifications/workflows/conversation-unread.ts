import { workflow } from "@novu/framework";
import z from "zod";

import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import { isContentFragmentType, isUserMessageType } from "@app/types";

const ConversationUnreadPayloadSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
});

export type ConversationUnreadPayloadType = z.infer<
  typeof ConversationUnreadPayloadSchema
>;

export const CONVERSATION_UNREAD_TRIGGER_ID = "conversation-unread";

export const conversationUnreadWorkflow = workflow(
  CONVERSATION_UNREAD_TRIGGER_ID,
  async ({ step, payload }) => {
    let isConversationMissing: boolean = false;

    let subject: string = "A dust conversation";
    let body: string = "You have a new unread message.";
    let skipPushNotification: boolean = false;

    // The payload will have empty values when novu inspect the workflow.
    // The payload will have "[placeholder]" when a step is previewed in local studio UI.
    if (payload.conversationId && payload.conversationId !== "[placeholder]") {
      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        payload.userId,
        payload.workspaceId
      );

      const conversation = await ConversationResource.fetchById(
        auth,
        payload.conversationId
      );

      if (!conversation) {
        isConversationMissing = true;
        return;
      }

      subject = conversation.title ?? "Dust conversation";
      skipPushNotification = !!conversation.triggerSId;

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
            return;
          } else if (isUserMessageType(lightMessage)) {
            body = lightMessage.content;
          } else {
            body = lightMessage.content ?? "No content";
          }
          body = body.length > 256 ? body.slice(0, 256) + "..." : body;
        }
      }
    }
    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject,
          body,
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
            skipPushNotification,
            conversationId: payload.conversationId,
          },
        };
      },
      {
        skip: () => isConversationMissing,
      }
    );
  },
  {
    payloadSchema: ConversationUnreadPayloadSchema,
  }
);
