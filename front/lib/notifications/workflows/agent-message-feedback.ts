import type { Authenticator } from "@app/lib/auth";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getActiveSubscriberAuth } from "@app/lib/notifications";
import { renderEmail as renderDigestEmail } from "@app/lib/notifications/email-templates/agent-message-feedback-digest";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import type { AgentMessageFeedbackPayloadType } from "@app/lib/notifications/triggers/agent-message-feedback";
import {
  AGENT_MESSAGE_FEEDBACK_TRIGGER_ID,
  AgentMessageFeedbackPayloadSchema,
} from "@app/lib/notifications/triggers/agent-message-feedback";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import { DEFAULT_LOCALE } from "@app/types/locale";
import { isDevelopment } from "@app/types/shared/env";
import { workflow } from "@novu/framework";
import z from "zod";

const isAgentMessageFeedbackPayload = (
  payload: unknown
): payload is AgentMessageFeedbackPayloadType => {
  return AgentMessageFeedbackPayloadSchema.safeParse(payload).success;
};

const FeedbackDetailsSchema = z.object({
  userWhoGaveFeedbackFullName: z.string(),
  agentName: z.string(),
  workspaceName: z.string(),
  isConversationShared: z.boolean(),
});

type FeedbackDetailsType = z.infer<typeof FeedbackDetailsSchema>;

const getFeedbackDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: AgentMessageFeedbackPayloadType;
}): Promise<FeedbackDetailsType> => {
  let userWhoGaveFeedbackFullName: string = "Someone";
  let agentName: string = "an agent";
  let workspaceName: string = "A workspace";
  let isConversationShared = false;

  if (subscriberId) {
    const auth = await getActiveSubscriberAuth(
      subscriberId,
      payload.workspaceId
    );

    const conversation = auth
      ? await ConversationResource.fetchById(auth, payload.conversationId)
      : null;

    if (auth && conversation) {
      workspaceName = auth.getNonNullableWorkspace().name;

      const userWhoGaveFeedback = await UserResource.fetchById(
        payload.userWhoGaveFeedbackId
      );

      if (userWhoGaveFeedback) {
        userWhoGaveFeedbackFullName = userWhoGaveFeedback.fullName();
      }

      const agent = await AgentResource.fetchById(
        auth,
        payload.agentConfigurationId
      );

      if (agent) {
        agentName = agent.name;
      }

      const feedback = await AgentMessageFeedbackResource.fetchById(auth, {
        feedbackId: payload.feedbackId,
        agentConfigurationId: payload.agentConfigurationId,
      });

      isConversationShared = feedback?.isConversationShared ?? false;
    }
  }

  return {
    userWhoGaveFeedbackFullName,
    agentName,
    workspaceName,
    isConversationShared,
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

  const auth = await getActiveSubscriberAuth(subscriberId, payload.workspaceId);
  if (!auth) {
    return true;
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  if (!conversation) {
    return true;
  }

  const agentConfiguration = await AgentResource.fetchById(
    auth,
    payload.agentConfigurationId
  );

  return !agentConfiguration || !auth.can("read", agentConfiguration);
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
          ...(details.isConversationShared
            ? {
                primaryAction: {
                  label: "View",
                  redirect: {
                    url: getConversationRoute(
                      payload.workspaceId,
                      payload.conversationId
                    ),
                  },
                },
              }
            : {}),
          data: {
            autoDelete: true,
            ...(details.isConversationShared
              ? { conversationId: payload.conversationId }
              : {}),
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
          feedbackAuth = await getActiveSubscriberAuth(
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
          let conversation: { id: string; title: string } | undefined;

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

              // The conversation title may leak private content: only expose it (and the link)
              // when the user who gave the feedback chose to share the conversation.
              if (eventDetails.isConversationShared) {
                const conversationResource =
                  await ConversationResource.fetchById(
                    feedbackAuth,
                    event.payload.conversationId
                  );
                if (conversationResource) {
                  conversation = {
                    id: conversationResource.sId,
                    title: getConversationDisplayTitle(
                      conversationResource.toJSON()
                    ),
                  };
                }
              }
            }
          }

          feedbacks.push({
            agentName: eventDetails.agentName,
            conversation,
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
          i18n: await getNotificationI18n(DEFAULT_LOCALE),
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
