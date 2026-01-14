import { workflow } from "@novu/framework";
import type { ChannelPreference } from "@novu/react";
import assert from "assert";
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
import type { Result, UserMessageOrigin, UserType } from "@app/types";
import {
  assertNever,
  Err,
  isContentFragmentType,
  isDevelopment,
  isUserMessageType,
  normalizeError,
  Ok,
} from "@app/types";
import { isRichUserMention } from "@app/types/assistant/mentions";
import type {
  NotificationCondition,
  NotificationPreferencesDelay,
} from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  CONVERSATION_UNREAD_TRIGGER_ID,
  isNotificationCondition,
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
  NOTIFICATION_DELAY_OPTIONS,
} from "@app/types/notification_preferences";

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
    case "cli":
    case "cli_programmatic":
      return true;
    case "onboarding_conversation":
      // Internal bootstrap conversations shouldn't trigger unread notifications.
      return false;
    case "api":
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
  mentionedUserIds: z.array(z.string()),
});

type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

const UserNotificationDelaySchema = z.object({
  delay: z.enum(NOTIFICATION_DELAY_OPTIONS),
});

type NotificationDelayAmountConfig = {
  amount: number;
  unit: "minutes" | "hours" | "days";
};

type NotificationDelayCronConfig = { cron: string };

type NotificationDelayConfig =
  | NotificationDelayAmountConfig
  | NotificationDelayCronConfig;

/**
 * Maps delay option keys to their time configurations.
 */
const NOTIFICATION_PREFERENCES_DELAYS: Record<
  NotificationPreferencesDelay,
  NotificationDelayConfig
> = {
  "5_minutes": { amount: 5, unit: "minutes" },
  "15_minutes": { amount: 15, unit: "minutes" },
  "30_minutes": { amount: 30, unit: "minutes" },
  "1_hour": { amount: 1, unit: "hours" },
  daily: { cron: "0 6 * * *" }, // Every day at 6am
};

const DEFAULT_NOTIFICATION_DELAY: NotificationPreferencesDelay = isDevelopment()
  ? "5_minutes"
  : "1_hour";

const getConversationDetails = async ({
  payload,
  auth: providedAuth,
  subscriberId,
}: { payload: ConversationUnreadPayloadType } & (
  | { auth: Authenticator; subscriberId?: never }
  | { auth?: never; subscriberId: string }
)): Promise<ConversationDetailsType> => {
  // Get or create auth from the discriminated union.
  let auth: Authenticator;
  if (providedAuth) {
    auth = providedAuth;
  } else {
    assert(subscriberId, "subscriberId required when auth not provided");
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );
  assert(conversation, `Conversation not found: ${payload.conversationId}`);

  const workspaceName = auth.getNonNullableWorkspace().name;
  const subject = conversation.title ?? "Dust conversation";
  const isFromTrigger = !!conversation.triggerSId;

  // Retrieve the message that triggered the notification.
  const messageRes = await conversation.getMessageById(auth, payload.messageId);
  assert(messageRes.isOk(), `Message not found: ${payload.messageId}`);

  const rendered = await batchRenderMessages(
    auth,
    conversation,
    [messageRes.value],
    "light"
  );
  assert(
    rendered.isOk() && rendered.value.length === 1,
    `Failed to render message: ${payload.messageId}`
  );

  const lightMessage = rendered.value[0];

  let author: string;
  let authorIsAgent: boolean;
  let avatarUrl: string | undefined;
  let mentionedUserIds: string[] = [];

  if (isContentFragmentType(lightMessage)) {
    // Content fragments don't have author info.
    author = "Someone else";
    authorIsAgent = false;
  } else if (isUserMessageType(lightMessage)) {
    author = lightMessage.user?.fullName ?? "Someone else";
    avatarUrl = lightMessage.user?.image ?? undefined;
    authorIsAgent = false;

    // Extract approved user mentions from the rendered message.
    mentionedUserIds = lightMessage.richMentions
      .filter((m) => isRichUserMention(m) && m.status === "approved")
      .map((m) => m.id);
  } else {
    author = lightMessage.configuration.name
      ? `@${lightMessage.configuration.name}`
      : "An agent";
    avatarUrl = lightMessage.configuration.pictureUrl ?? undefined;
    authorIsAgent = true;
  }

  return {
    subject,
    author,
    authorIsAgent,
    avatarUrl,
    isFromTrigger,
    workspaceName,
    mentionedUserIds,
  };
};

const getUserNotificationDelay = async ({
  subscriberId,
  workspaceId,
  channel,
}: {
  subscriberId?: string;
  workspaceId: string;
  channel: keyof ChannelPreference;
}): Promise<NotificationPreferencesDelay> => {
  if (!subscriberId) {
    return DEFAULT_NOTIFICATION_DELAY;
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    workspaceId
  );
  const user = auth.user();
  if (!user) {
    return DEFAULT_NOTIFICATION_DELAY;
  }
  const metadata = await UserMetadataModel.findOne({
    where: {
      userId: user.id,
      key: {
        [Op.eq]: makeNotificationPreferencesUserMetadata(channel),
      },
    },
  });
  const metadataValue = metadata?.value;
  return isNotificationPreferencesDelay(metadataValue)
    ? metadataValue
    : DEFAULT_NOTIFICATION_DELAY;
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
        assert(subscriber.subscriberId, "subscriberId is required in workflow");
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

    const userNotificationDelayStep = await step.custom(
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
        outputSchema: UserNotificationDelaySchema,
      }
    );

    const { events } = await step.digest(
      "digest",
      async () => {
        const digestKey = `workspace-${payload.workspaceId}-unread-conversations`;
        const userPreferences = userNotificationDelayStep.delay;
        return {
          ...NOTIFICATION_PREFERENCES_DELAYS[userPreferences],
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
          assert(
            subscriber.subscriberId,
            "subscriberId is required in workflow"
          );
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

const DEFAULT_NOTIFICATION_CONDITION: NotificationCondition = "all_messages";

/**
 * Filters participants based on their notification condition preference.
 * Returns only participants who should receive notifications.
 * Note: If a user is the only human participant in the conversation, they are
 * always notified regardless of their preference.
 */
const filterParticipantsByNotifyCondition = async ({
  participants,
  mentionedUserIds,
  totalParticipantCount,
}: {
  participants: (UserType & { unread: boolean })[];
  mentionedUserIds: Set<string>;
  totalParticipantCount: number;
}): Promise<(UserType & { unread: boolean })[]> => {
  const userModelIds = participants.map((p) => p.id);

  // Bulk query for all preferences.
  const preferences = await UserMetadataModel.findAll({
    where: {
      userId: { [Op.in]: userModelIds },
      key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
    },
    attributes: ["userId", "value"],
  });

  const preferenceMap = new Map<number, NotificationCondition>();
  for (const pref of preferences) {
    if (isNotificationCondition(pref.value)) {
      preferenceMap.set(pref.userId, pref.value);
    }
  }

  return participants.filter((participant) => {
    const notifyCondition =
      preferenceMap.get(participant.id) ?? DEFAULT_NOTIFICATION_CONDITION;
    switch (notifyCondition) {
      case "all_messages":
        return true;
      case "only_mentions":
        // Notify if mentioned OR if only human participant.
        return (
          mentionedUserIds.has(participant.sId) || totalParticipantCount === 1
        );
      case "never":
        return false;
    }
  });
};

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

  // Get all participants to determine total count (for single-participant exception).
  const totalParticipants = await conversation.listParticipants(auth, false);
  const allParticipants = totalParticipants.filter((p) => p.unread);

  if (allParticipants.length === 0) {
    return new Ok(undefined);
  }

  // Get conversation details including mentioned user IDs.
  const details = await getConversationDetails({
    auth,
    payload: {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      messageId,
    },
  });

  // Filter participants based on their notification condition preference.
  const participants = await filterParticipantsByNotifyCondition({
    participants: allParticipants,
    mentionedUserIds: new Set(details.mentionedUserIds),
    totalParticipantCount: totalParticipants.length,
  });

  if (participants.length === 0) {
    return new Ok(undefined);
  }

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
    if (r.status < 200 || r.status >= 300) {
      return new Err({
        name: "dust_error",
        code: "internal_server_error",
        message: `Failed to trigger conversation unread notification due to network error: ${r.status} ${r.statusText}`,
      });
    }
    return new Ok(undefined);
  } catch (error) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to trigger conversation unread notification: ${normalizeError(error).message}`,
    });
  }
};
