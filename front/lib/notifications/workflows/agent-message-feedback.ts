import { workflow } from "@novu/framework";
import z from "zod";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { getEditors } from "@app/lib/api/assistant/editors";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { renderEmail as renderDigestEmail } from "@app/lib/notifications/email-templates/agent-message-feedback-digest";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isDevelopment, Ok } from "@app/types";

const AgentMessageFeedbackPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  agentConfigurationId: z.string(),
  userWhoGaveFeedbackId: z.string(),
  thumbDirection: z.union([z.literal("up"), z.literal("down")]),
  feedbackId: z.string(),
});

type AgentMessageFeedbackPayloadType = z.infer<
  typeof AgentMessageFeedbackPayloadSchema
>;

const isAgentMessageFeedbackPayload = (
  payload: unknown
): payload is AgentMessageFeedbackPayloadType => {
  return AgentMessageFeedbackPayloadSchema.safeParse(payload).success;
};

const AGENT_MESSAGE_FEEDBACK_TRIGGER_ID = "agent-message-feedback";

const FeedbackDetailsSchema = z.object({
  conversationTitle: z.string(),
  userWhoGaveFeedbackFullName: z.string(),
  agentName: z.string(),
  workspaceName: z.string(),
});

type FeedbackDetailsType = z.infer<typeof FeedbackDetailsSchema>;

const getFeedbackDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: AgentMessageFeedbackPayloadType;
}): Promise<FeedbackDetailsType> => {
  let conversationTitle: string = "A conversation";
  let userWhoGaveFeedbackFullName: string = "Someone";
  let agentName: string = "an agent";
  let workspaceName: string = "A workspace";

  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const conversation = await ConversationResource.fetchById(
      auth,
      payload.conversationId
    );

    if (conversation) {
      workspaceName = auth.getNonNullableWorkspace().name;
      conversationTitle = conversation.title ?? "Dust conversation";

      const userWhoGaveFeedback = await UserResource.fetchById(
        payload.userWhoGaveFeedbackId
      );

      if (userWhoGaveFeedback) {
        userWhoGaveFeedbackFullName = userWhoGaveFeedback.fullName();
      }

      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: payload.agentConfigurationId,
        variant: "light",
      });

      if (agentConfiguration) {
        agentName = `@${agentConfiguration.name}`;
      }
    }
  }

  return {
    conversationTitle,
    userWhoGaveFeedbackFullName,
    agentName,
    workspaceName,
  };
};

const shouldSkipNotification = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: AgentMessageFeedbackPayloadType;
}): Promise<boolean> => {
  if (!subscriberId) {
    return true;
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  const conversation = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  if (!conversation) {
    return true;
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: payload.agentConfigurationId,
    variant: "light",
  });

  return !agentConfiguration;
};

export const agentMessageFeedbackWorkflow = workflow(
  AGENT_MESSAGE_FEEDBACK_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-feedback-details",
      async () => {
        return getFeedbackDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: FeedbackDetailsSchema,
      }
    );

    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject: `New feedback on ${details.agentName}`,
          body: `${details.userWhoGaveFeedbackFullName} left a ${payload.thumbDirection === "up" ? "positive" : "negative"} feedback on ${details.agentName}.`,
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
            autoDelete: true,
            conversationId: payload.conversationId,
          },
        };
      },
      {
        skip: async () =>
          shouldSkipNotification({
            subscriberId: subscriber.subscriberId,
            payload,
          }),
      }
    );

    const { events } = await step.digest(
      "digest",
      async () => {
        const digestKey = `${subscriber.subscriberId}-workspace-${payload.workspaceId}-agent-feedbacks`;
        return isDevelopment()
          ? {
              amount: 2,
              unit: "minutes",
              digestKey,
            }
          : {
              cron: "0 9 * * *", // Every day at 9:00 AM UTC
              digestKey,
            };
      },
      {
        skip: async () =>
          shouldSkipNotification({
            subscriberId: subscriber.subscriberId,
            payload,
          }),
      }
    );

    await step.email(
      "send-email",
      async () => {
        const feedbacks: Parameters<typeof renderDigestEmail>[0]["feedbacks"] =
          [];

        let feedbackAuth: Authenticator | null = null;

        if (subscriber.subscriberId) {
          feedbackAuth = await Authenticator.fromUserIdAndWorkspaceId(
            subscriber.subscriberId,
            payload.workspaceId
          );
        }

        for (const event of events) {
          if (!isAgentMessageFeedbackPayload(event.payload)) {
            continue;
          }

          const shouldSkip = await shouldSkipNotification({
            subscriberId: subscriber.subscriberId,
            payload: event.payload,
          });
          if (shouldSkip) {
            continue;
          }

          const eventDetails = await getFeedbackDetails({
            subscriberId: subscriber.subscriberId,
            payload: event.payload,
          });

          let feedbackContent: string | undefined;

          if (feedbackAuth) {
            const feedback = await AgentMessageFeedbackResource.fetchById(
              feedbackAuth,
              {
                feedbackId: event.payload.feedbackId,
                agentConfigurationId: event.payload.agentConfigurationId,
              }
            );

            if (feedback) {
              feedbackContent = feedback.content ?? undefined;
            }
          }

          feedbacks.push({
            agentName: eventDetails.agentName,
            conversationId: event.payload.conversationId,
            conversationTitle: eventDetails.conversationTitle,
            userWhoGaveFeedbackFullName:
              eventDetails.userWhoGaveFeedbackFullName,
            thumbDirection: event.payload.thumbDirection,
            feedbackContent,
          });
        }

        const positiveCount = feedbacks.filter(
          (f) => f.thumbDirection === "up"
        ).length;
        const negativeCount = feedbacks.filter(
          (f) => f.thumbDirection === "down"
        ).length;

        const body = await renderDigestEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: details.workspaceName,
          },
          feedbacks,
        });

        return {
          subject: `[Dust] ${feedbacks.length} feedback${feedbacks.length > 1 ? "s" : ""} on your agents (👍 ${positiveCount} - 👎 ${negativeCount})`,
          body,
        };
      },
      {
        skip: async () => {
          const validEvents = events.filter((event) =>
            isAgentMessageFeedbackPayload(event.payload)
          );

          if (validEvents.length === 0) {
            return true;
          }

          const shouldSkip = await concurrentExecutor(
            validEvents,
            async (event) =>
              shouldSkipNotification({
                subscriberId: subscriber.subscriberId,
                payload: event.payload as AgentMessageFeedbackPayloadType,
              }),
            { concurrency: 8 }
          );

          // Skip email if all events should be skipped (meaning 0 valid feedbacks)
          return shouldSkip.every(Boolean);
        },
      }
    );
  },
  {
    payloadSchema: AgentMessageFeedbackPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);

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

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });

  if (!agentConfiguration) {
    return new Err(
      new DustError("internal_error", "Agent configuration not found")
    );
  }

  const editors = await getEditors(auth, agentConfiguration);

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

    const r = await novuClient.bulkTrigger(
      editorsToNotify.map((editor) => ({
        name: AGENT_MESSAGE_FEEDBACK_TRIGGER_ID,
        to: {
          subscriberId: editor.sId,
          email: editor.email,
          firstName: editor.firstName ?? undefined,
          lastName: editor.lastName ?? undefined,
        },
        payload,
      }))
    );

    if (r.status !== 200) {
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger agent message feedback notification: status=${r.status}`,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger agent message feedback notification",
    });
  }

  return new Ok(undefined);
};
