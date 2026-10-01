import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import z from "zod";

export const AgentMessageFeedbackPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  agentConfigurationId: z.string(),
  userWhoGaveFeedbackId: z.string(),
  thumbDirection: z.union([z.literal("up"), z.literal("down")]),
  feedbackId: z.string(),
});

export type AgentMessageFeedbackPayloadType = z.infer<
  typeof AgentMessageFeedbackPayloadSchema
>;

export const AGENT_MESSAGE_FEEDBACK_TRIGGER_ID = "agent-message-feedback";

export const triggerAgentMessageFeedbackNotification = async (
  auth: Authenticator,
  {
    conversationId,
    messageId,
    agentConfigurationId,
    thumbDirection,
    feedbackId,
  }: {
    conversationId: string;
    messageId: string;
    agentConfigurationId: string;
    thumbDirection: AgentMessageFeedbackDirection;
    feedbackId: string;
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  const userWhoGaveFeedback = auth.user();

  if (!userWhoGaveFeedback) {
    return new Ok(undefined);
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    return new Err(new DustError("internal_error", "Conversation not found"));
  }

  if (conversation.depth > 0) {
    logger.info(
      { conversationDepth: conversation.depth },
      "Skipping notification for sub-conversation"
    );
    return new Ok(undefined);
  }

  const agent = await AgentResource.fetchById(auth, agentConfigurationId);

  if (!agent) {
    return new Err(
      new DustError("internal_error", "Agent configuration not found")
    );
  }

  const editors = (await agent.listEditors(auth)) ?? [];

  if (editors.length === 0) {
    logger.info(
      { agentConfigurationId },
      "No editors found for agent, skipping notification"
    );
    return new Ok(undefined);
  }

  // In development, allow sending notifications to yourself for debugging
  const editorsToNotify = isDevelopment()
    ? editors
    : editors.filter((editor) => editor.sId !== userWhoGaveFeedback.sId);

  if (editorsToNotify.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const payload: AgentMessageFeedbackPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId,
      messageId,
      agentConfigurationId,
      userWhoGaveFeedbackId: userWhoGaveFeedback.sId,
      thumbDirection,
      feedbackId,
    };

    const r = await novuClient.triggerBulk({
      events: editorsToNotify.map((editor) => ({
        workflowId: AGENT_MESSAGE_FEEDBACK_TRIGGER_ID,
        to: {
          subscriberId: editor.sId,
          email: editor.email,
          firstName: editor.firstName ?? undefined,
          lastName: editor.lastName ?? undefined,
        },
        payload,
      })),
    });

    if (r.result.some((res) => !!res.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger agent message feedback notification: errors: ${eventErrors}`,
      });
    }
  } catch {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger agent message feedback notification",
    });
  }

  return new Ok(undefined);
};
