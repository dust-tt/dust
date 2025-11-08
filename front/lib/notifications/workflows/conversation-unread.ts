import { workflow } from "@novu/framework";
import z from "zod";

import { getConversationRoute } from "@app/lib/utils/router";

const ConversationUnreadPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  conversationTitle: z.string(),
});

export type ConversationUnreadPayloadType = z.infer<
  typeof ConversationUnreadPayloadSchema
>;

export const CONVERSATION_UNREAD_TRIGGER_ID = "conversation-unread";

export const conversationUnreadWorkflow = workflow(
  CONVERSATION_UNREAD_TRIGGER_ID,
  async ({ step, payload }) => {
    await step.inApp("send-in-app", async () => {
      return {
        subject: payload.conversationTitle,
        body: `You have a new unread message.`,
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
        },
      };
    });
  },
  {
    payloadSchema: ConversationUnreadPayloadSchema,
  }
);
