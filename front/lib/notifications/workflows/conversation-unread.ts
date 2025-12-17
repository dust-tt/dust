import { workflow } from "@novu/framework";
import type { ChannelPreference } from "@novu/react";
import uniqBy from "lodash/uniqBy";
import { Op } from "sequelize";
import z from "zod";

import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/conversations-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { getConversationRoute } from "@app/lib/utils/router";
import type { Result, UserMessageOrigin } from "@app/types";
import {
  assertNever,
  Err,
  isContentFragmentType,
  isDevelopment,
  isUserMessageType,
  Ok,
} from "@app/types";
import type { NotificationPreferencesDelay } from "@app/types/notification_preferences";

const CONVERSATION_UNREAD_TRIGGER_ID = "conversation-unread";

const ConversationUnreadPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
});

type ConversationUnreadPayloadType = z.infer<
  typeof ConversationUnreadPayloadSchema
>;

export const shouldSendNotificationForAgentAnswer = (
  userMessageOrigin?: UserMessageOrigin | null
): boolean => {
  switch (userMessageOrigin) {
    case "web":
    case "extension":
      return true;
    case "onboarding_conversation":
      // Internal bootstrap conversations shouldn't trigger unread notifications.
      return false;
    case "api":
    case "cli":
    case "cli_programmatic":
    case "email":
    case "excel":
    case "gsheet":
    case "make":
    case "n8n":
    case "powerpoint":
    case "raycast":
    case "slack":
    case "slack_workflow":
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

const ConversationDetailsSchema = z.object({
  subject: z.string(),
  author: z.string(),
  authorIsAgent: z.boolean(),
  avatarUrl: z.string().optional(),
  isFromTrigger: z.boolean(),
  workspaceName: z.string(),
});

type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

/**
 * Configuration for a notification delay option.
 */
type NotificationDelayConfig = {
  amount: number;
  unit: "minutes" | "hours" | "days";
};

/**
 * Maps delay option keys to their time configurations.
 */
const NOTIFICATION_PREFERENCES_DELAYS: Record<
  NotificationPreferencesDelay,
  NotificationDelayConfig | { cron: string }
> = {
  "5_minutes": { amount: 5, unit: "minutes" },
  "15_minutes": { amount: 15, unit: "minutes" },
  "30_minutes": { amount: 30, unit: "minutes" },
  "1_hour": { amount: 1, unit: "hours" },
  daily: { cron: "0 6 * * *" }, // Every day at 6am
};

const getConversationDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ConversationUnreadPayloadType;
}): Promise<ConversationDetailsType> => {
  let subject: string = "A dust conversation";
  let author: string = "Someone else";
  let authorIsAgent: boolean = false;
  let avatarUrl: string | undefined;
  let isFromTrigger: boolean = false;
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
            authorIsAgent = false;
          } else {
            author = lightMessage.configuration.name
              ? `@${lightMessage.configuration.name}`
              : "An agent";
            avatarUrl = lightMessage.configuration.pictureUrl ?? undefined;
            authorIsAgent = true;
          }
        }
      }
    }
  }
  return {
    subject,
    author,
    authorIsAgent,
    avatarUrl,
    isFromTrigger,
    workspaceName,
  };
};

const getUserPreferences = async ({
  subscriberId,
  workspaceId,
  channel,
}: {
  subscriberId?: string;
  workspaceId: string;
  channel: keyof ChannelPreference;
}): Promise<NotificationPreferencesDelay | undefined> => {
  if (!subscriberId) {
    return undefined;
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    workspaceId
  );
  const user = auth.user();
  if (!user) {
    return undefined;
  }
  const metadata = await UserMetadataModel.findOne({
    where: {
      userId: user.id,
      key: {
        [Op.eq]: `${channel}_notification_preferences`,
      },
    },
  });
  return metadata?.value as NotificationPreferencesDelay | undefined;
};

const shouldSkipConversation = async ({
  subscriberId,
  payload,
  triggerShouldSkip,
}: {
  subscriberId?: string | null;
  payload: ConversationUnreadPayloadType;
  triggerShouldSkip: boolean;
}): Promise<boolean> => {
  if (subscriberId) {
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

    if (triggerShouldSkip && conversation.triggerSId) {
      return true;
    }

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
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-conversation-details",
      async () => {
        return getConversationDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: ConversationDetailsSchema,
      }
    );

    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject: `New message from ${details.author}`,
          body: details.authorIsAgent
            ? `${details.author} replied in the conversation "${details.subject}".`
            : `You have a new message from ${details.author} in the conversation "${details.subject}".`,
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
        skip: async () =>
          shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
            triggerShouldSkip: false,
          }),
      }
    );

    const { events } = await step.digest(
      "digest",
      async () => {
        const digestKey = `${subscriber.subscriberId}-workspace-${payload.workspaceId}-unread-conversations`;
        const userPreferences = await getUserPreferences({
          subscriberId: subscriber.subscriberId,
          workspaceId: payload.workspaceId,
          channel: "email",
        });
        if (
          userPreferences !== undefined &&
          NOTIFICATION_PREFERENCES_DELAYS[userPreferences]
        ) {
          return {
            ...NOTIFICATION_PREFERENCES_DELAYS[userPreferences],
            digestKey,
          };
        }
        return isDevelopment()
          ? {
              amount: 2,
              unit: "minutes",
              digestKey,
            }
          : {
              amount: 1,
              unit: "hours",
              digestKey,
            };
      },
      {
        // No email from trigger until we give more control over the notification to the users.
        skip: async () =>
          shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
            triggerShouldSkip: true,
          }),
      }
    );

    await step.email(
      "send-email",
      async () => {
        const conversations: Parameters<
          typeof renderEmail
        >[0]["conversations"] = [];

        const uniqEventsPerConversation = uniqBy(
          events,
          (event) => event.payload.conversationId
        );

        for (const event of uniqEventsPerConversation) {
          const shouldSkip = await shouldSkipConversation({
            payload: event.payload as ConversationUnreadPayloadType,
            triggerShouldSkip: true,
          });
          if (shouldSkip) {
            continue;
          }

          const payload = event.payload as ConversationUnreadPayloadType;
          const details = await getConversationDetails({
            subscriberId: subscriber.subscriberId,
            payload,
          });

          conversations.push({
            id: payload.conversationId,
            title: details.subject as string,
          });
        }

        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: details.workspaceName,
          },
          conversations,
        });
        return {
          subject:
            conversations.length > 1
              ? `[Dust] new unread message(s) in ${conversations.length} conversations`
              : `[Dust] new unread message(s) in conversation`,
          body,
        };
      },
      {
        // No email from trigger until we give more control over the notification to the users.
        skip: async () => {
          const shouldSkip = await Promise.all(
            events.map(async (event) =>
              shouldSkipConversation({
                payload: event.payload as ConversationUnreadPayloadType,
                triggerShouldSkip: true,
              })
            )
          );

          // Do not skip if at least one conversation is not skipped.
          return shouldSkip.every(Boolean);
        },
      }
    );
  },
  {
    payloadSchema: ConversationUnreadPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);

export const triggerConversationUnreadNotifications = async (
  auth: Authenticator,
  {
    conversation,
    messageId,
  }: { conversation: ConversationResource; messageId: string }
): Promise<
  Result<
    void,
    Omit<DustError, "code"> & {
      code: "internal_server_error";
    }
  >
> => {
  // Skip any sub-conversations.
  if (conversation.depth > 0) {
    return new Ok(undefined);
  }

  const participants = await conversation.listParticipants(auth, true);

  if (participants.length !== 0) {
    try {
      const novuClient = await getNovuClient();

      const r = await novuClient.bulkTrigger(
        participants.map((p) => {
          const payload: ConversationUnreadPayloadType = {
            conversationId: conversation.sId,
            workspaceId: auth.getNonNullableWorkspace().sId,
            messageId,
          };
          return {
            name: CONVERSATION_UNREAD_TRIGGER_ID,
            to: {
              subscriberId: p.sId,
              email: p.email,
              firstName: p.firstName ?? undefined,
              lastName: p.lastName ?? undefined,
            },
            payload,
          };
        })
      );
      if (r.status !== 200) {
        return new Err({
          name: "dust_error",
          code: "internal_server_error",
          message: "Failed to trigger conversation unread notification",
        });
      }
      return new Ok(undefined);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return new Err({
        name: "dust_error",
        code: "internal_server_error",
        message: "Failed to trigger conversation unread notification",
      });
    }
  }
  return new Ok(undefined);
};
