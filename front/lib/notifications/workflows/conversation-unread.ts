import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import {
  ensureSlackNotificationsReady,
  getNovuClient,
  getUserNotificationDelay,
} from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/conversations-unread";
import type {
  ConversationDetailsPayload,
  ConversationDetailsType,
} from "@app/lib/notifications/helpers";
import {
  ConversationDetailsPayloadSchema,
  ConversationDetailsSchema,
  getConversationDetails,
  getEmailSummary,
} from "@app/lib/notifications/helpers";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { NotificationCondition } from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  CONVERSATION_UNREAD_TRIGGER_ID,
  DEFAULT_NOTIFICATION_CONDITION,
  isNotificationCondition,
  NOTIFICATION_DELAY_OPTIONS,
  NOTIFICATION_PREFERENCES_DELAYS,
} from "@app/types/notification_preferences";
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { UserType } from "@app/types/user";
import { workflow } from "@novu/framework";
import assert from "assert";
import { Op } from "sequelize";
import z from "zod";

// The unread workflow operates on the shared conversation-details payload.
export type ConversationUnreadPayloadType = ConversationDetailsPayload;

export const shouldSendNotificationForAgentAnswer = (
  userMessageOrigin?: UserMessageOrigin | null
): boolean => {
  switch (userMessageOrigin) {
    case "web":
    case "extension":
    case "cli":
    case "cli_programmatic":
    case "wakeup":
      return true;
    case "onboarding_conversation":
    case "agent_sidekick":
    case "reinforced_skill_notification":
    case "reinforcement":
    case "system_activation":
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
    case "project_kickoff":
    case undefined:
    case null:
      return false;
    default:
      assertNever(userMessageOrigin);
  }
};

// Wrapper for workflow step that may fail when conversation is deleted.
const ConversationDetailsResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    data: ConversationDetailsSchema,
  }),
  z.object({
    success: z.literal(false),
  }),
]);

const UserNotificationDelaySchema = z.object({
  delay: z.enum(NOTIFICATION_DELAY_OPTIONS),
});

const shouldSkipUnreadConversation = async ({
  subscriberId,
  payload,
  triggerShouldSkip,
  hasUnreadMessages,
}: {
  subscriberId: string;
  payload: ConversationUnreadPayloadType;
  triggerShouldSkip: boolean;
  hasUnreadMessages: boolean;
}): Promise<boolean> => {
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

  const { actionRequired, lastReadAt } =
    await ConversationResource.getActionRequiredAndLastReadAtForUser(
      auth,
      conversation.id
    );

  const unread =
    (lastReadAt === null || conversation.updatedAt > lastReadAt) &&
    hasUnreadMessages;

  if (!actionRequired && !unread) {
    return true;
  }

  return false;
};

export const shouldSkipNewProjectConversation = async ({
  subscriberId,
  payload,
}: {
  subscriberId: string;
  payload: ConversationUnreadPayloadType;
}): Promise<boolean> => {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  const conversationResource = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  if (!conversationResource) {
    return true;
  }

  const { lastReadAt } =
    await ConversationResource.getActionRequiredAndLastReadAtForUser(
      auth,
      conversationResource.id
    );

  const hasBeenOpened = !!lastReadAt;

  if (hasBeenOpened) {
    return true;
  }

  const conversationParticipants =
    await conversationResource.listParticipants(auth);

  const isConversationParticipant = conversationParticipants.some(
    (participant) => participant.sId === subscriberId
  );

  if (isConversationParticipant) {
    return true;
  }

  const conversation = conversationResource.toJSON();

  if (!isPodConversation(conversation)) {
    return true;
  }

  const project = await SpaceResource.fetchById(auth, conversation.spaceId);

  if (!project) {
    return true;
  }

  if (!project.isMember(auth)) {
    return true;
  }

  return false;
};

export const shouldSkipConversation = async ({
  subscriberId,
  payload,
  triggerShouldSkip,
  hasUnreadMessages,
}: {
  subscriberId?: string | null;
  payload: ConversationUnreadPayloadType;
  triggerShouldSkip: boolean;
  hasUnreadMessages: boolean;
}): Promise<boolean> => {
  if (!subscriberId) {
    return true;
  }

  if (payload.isNewProjectConversation) {
    return shouldSkipNewProjectConversation({ subscriberId, payload });
  }

  return shouldSkipUnreadConversation({
    subscriberId,
    payload,
    triggerShouldSkip,
    hasUnreadMessages,
  });
};

const getEmailSubject = (
  conversations: {
    title: string;
    projectName?: string;
    isNewProjectConversation?: boolean;
  }[]
): string => {
  const isAllNewProjectConversations = conversations.every(
    (c) => c.isNewProjectConversation
  );
  if (isAllNewProjectConversations) {
    const uniqueProjectNames = Array.from(
      new Set(conversations.map((c) => c.projectName).filter(Boolean))
    );
    if (uniqueProjectNames.length === 1) {
      return `[Dust] New conversation${pluralize(conversations.length)} in '${uniqueProjectNames[0]}'`;
    }
    return `[Dust] New conversations in your Pods`;
  }
  if (conversations.length === 1) {
    return `[Dust] ${conversations[0]?.title ?? "New unread message(s) in conversation"}`;
  }
  return `[Dust] New unread messages in ${conversations.length} conversations`;
};

export const getMessagePreviewText = (
  details: ConversationDetailsType
): string | undefined => {
  if (details.hasConversationRetentionPolicy) {
    return "Preview not available due to data retention policy on conversations in this workspace.";
  }
  if (details.hasAgentRetentionPolicies) {
    return "Preview not available due to data retention policy on agents in this conversation.";
  }
  if (details.newMessageContent) {
    const stripped = stripMarkdown(details.newMessageContent);
    const trimmed = stripped.trim();
    return trimmed.substring(0, 300) + (trimmed.length > 300 ? "..." : "");
  }
};

export const getMessagePreviewSlack = (
  details: ConversationDetailsType
): string | undefined => {
  const preview = getMessagePreviewText(details);
  if (!preview) {
    return undefined;
  }
  // Replace newlines with "> \n" to maintain blockquote formatting on each line
  return preview
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
};

export const conversationUnreadWorkflow = workflow(
  CONVERSATION_UNREAD_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const detailsResult = await step.custom(
      "get-conversation-details",
      async () => {
        // In local development, subscriberId may be empty when previewing the workflow.
        assert(
          isDevelopment() || subscriber.subscriberId,
          "subscriberId is required in workflow"
        );
        const result = await getConversationDetails({
          subscriberId: subscriber.subscriberId ?? "",
          payload,
        });
        if (result.isErr()) {
          // Conversation or message was deleted during workflow delay - skip notification.
          return { success: false as const };
        }
        return { success: true as const, data: result.value };
      },
      {
        outputSchema: ConversationDetailsResultSchema,
      }
    );

    // Extract details if available (null when conversation/message was deleted).
    // We don't return early here because Novu needs to discover all steps.
    const details = detailsResult.success ? detailsResult.data : null;

    await step.inApp(
      "send-in-app",
      async () => {
        // details is guaranteed non-null here because skip prevents execution otherwise.
        const d = details!;

        const isProjectNewConversation = d.isNewProjectConversation;
        const subject = isProjectNewConversation
          ? `New conversation in ${d.projectName}`
          : `New message from ${d.author}`;
        const body = isProjectNewConversation
          ? `${d.author} created "${d.subject}"`
          : d.authorIsAgent
            ? `${d.author} replied in the conversation "${d.subject}".`
            : `You have a new message from ${d.author} in the conversation "${d.subject}".`;

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
            skipPushNotification: d.isFromTrigger,
            conversationId: payload.conversationId,
          },
        };
      },
      {
        skip: async () =>
          !details ||
          shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
            triggerShouldSkip: false,
            hasUnreadMessages: details.hasUnreadMessages,
          }),
      }
    );

    await step.chat(
      "slack-notification",
      async () => {
        // details is guaranteed non-null here because skip prevents execution otherwise.
        const d = details!;
        const conversationUrl = getConversationRoute(
          payload.workspaceId,
          payload.conversationId,
          undefined,
          config.getAppUrl()
        );

        // Create message preview
        const messagePreview = getMessagePreviewSlack(d);

        const isProjectNewConversation = d.isNewProjectConversation;
        const baseMessage = isProjectNewConversation
          ? `There is a new conversation in "${d.projectName}": ${d.author} started "${d.subject}"`
          : d.authorIsAgent
            ? `${d.author} replied in "${d.subject}"`
            : `New message from ${d.author} in "${d.subject}"`;

        const message = messagePreview
          ? `${baseMessage}\n${messagePreview}\n<${conversationUrl}|View conversation>`
          : `${baseMessage}\n<${conversationUrl}|View conversation>`;

        return {
          body: message,
        };
      },
      {
        skip: async () => {
          if (!details) {
            return true;
          }
          const shouldSkip = await shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
            triggerShouldSkip: false,
            hasUnreadMessages: details.hasUnreadMessages,
          });
          if (shouldSkip) {
            return true;
          }
          const { isReady } = await ensureSlackNotificationsReady(
            subscriber.subscriberId,
            payload.workspaceId
          );
          if (!isReady) {
            return true;
          }
          return false;
        },
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
        skip: async () => !details,
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
        // NOTE: We only check `details` here because `subscriber.subscriberId` is null
        // when the digest step's skip condition is evaluated (Novu framework bug).
        // All subscriber-based filtering (shouldSkipConversation) is handled in the
        // email step below, where subscriber context is properly available.
        skip: async () => !details,
      }
    );

    await step.email(
      "send-email",
      async () => {
        const conversations: Parameters<
          typeof renderEmail
        >[0]["conversations"] = [];

        // Deduplicate events per conversation, prioritizing non-newProjectConversation events
        // so that participants get the richer unread content (AI summary, mention badge)
        // over the simpler "new project conversation" content.
        const eventsByConversation = new Map<string, (typeof events)[number]>();
        for (const event of events) {
          const convId = (event.payload as ConversationUnreadPayloadType)
            .conversationId;
          const existing = eventsByConversation.get(convId);
          if (
            !existing ||
            !!(existing.payload as ConversationUnreadPayloadType)
              .isNewProjectConversation
          ) {
            eventsByConversation.set(convId, event);
          }
        }
        const uniqEventsPerConversation = Array.from(
          eventsByConversation.values()
        );

        await concurrentExecutor(
          uniqEventsPerConversation,
          async (event) => {
            const payload = event.payload as ConversationUnreadPayloadType;
            // In local development, subscriberId may be empty when previewing the workflow.
            assert(
              isDevelopment() || subscriber.subscriberId,
              "subscriberId is required in workflow"
            );
            const detailsResult = await getConversationDetails({
              subscriberId: subscriber.subscriberId ?? "",
              payload,
            });
            if (detailsResult.isErr()) {
              // Conversation or message was deleted during workflow delay - skip this event.
              return;
            }

            const shouldSkip = await shouldSkipConversation({
              subscriberId: subscriber.subscriberId,
              payload,
              triggerShouldSkip: true,
              hasUnreadMessages: detailsResult.value.hasUnreadMessages,
            });
            if (shouldSkip) {
              return;
            }

            if (detailsResult.value.isNewProjectConversation) {
              conversations.push({
                id: payload.conversationId,
                title: detailsResult.value.subject,
                hasUnreadMentions: false,
                summary: null,
                isNewProjectConversation: true,
                projectName: detailsResult.value.projectName,
                createdByFullName: detailsResult.value.author,
                messagePreview: getMessagePreviewText(detailsResult.value),
              });
            } else {
              const summary = await getEmailSummary({
                details: detailsResult.value,
                subscriberId: subscriber.subscriberId ?? "",
                payload,
              });
              conversations.push({
                id: payload.conversationId,
                title: detailsResult.value.subject,
                hasUnreadMentions: detailsResult.value.hasUnreadMentions,
                summary,
              });
            }
          },
          { concurrency: 8 }
        );

        // details is guaranteed non-null here because skip prevents execution otherwise.
        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: details!.workspaceName,
          },
          conversations,
        });

        const subject = getEmailSubject(conversations);
        return {
          subject,
          body,
        };
      },
      {
        // No email from trigger until we give more control over the notification to the users.
        skip: async () => {
          const shouldSkip = await concurrentExecutor(
            events,
            async (event) => {
              const detailsResult = await getConversationDetails({
                subscriberId: subscriber.subscriberId ?? "",
                payload: event.payload as ConversationUnreadPayloadType,
              });
              if (detailsResult.isErr()) {
                // Conversation or message was deleted during workflow delay - skip this event.
                return true;
              }
              const details = detailsResult.value;
              return shouldSkipConversation({
                subscriberId: subscriber.subscriberId,
                payload: event.payload as ConversationUnreadPayloadType,
                triggerShouldSkip: true,
                hasUnreadMessages: details.hasUnreadMessages,
              });
            },
            { concurrency: 8 }
          );

          // Do not skip if at least one conversation is not skipped.
          return shouldSkip.every(Boolean);
        },
      }
    );
  },
  {
    payloadSchema: ConversationDetailsPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);

/**
 * Filters participants based on their notification condition preference.
 * Returns only participants who should receive notifications.
 * Note: If a user is the only human participant in the conversation, they are
 * always notified regardless of their preference.
 */
export const filterParticipantsByNotifyCondition = async ({
  auth,
  participants,
  mentionedUserIds,
  totalParticipantCount,
  spaceModelId,
}: {
  auth: Authenticator;
  participants: (UserType & { lastReadAt: Date | null })[];
  mentionedUserIds: Set<string>;
  totalParticipantCount: number;
  spaceModelId: ModelId | null;
}): Promise<(UserType & { lastReadAt: Date | null })[]> => {
  const userModelIds = participants.map((p) => p.id);

  const generalPreferences = await UserMetadataModel.findAll({
    where: {
      userId: { [Op.in]: userModelIds },
      key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
    },
    attributes: ["userId", "value"],
  });

  const generalPreferenceMap = new Map<number, NotificationCondition>();
  for (const pref of generalPreferences) {
    if (isNotificationCondition(pref.value)) {
      generalPreferenceMap.set(pref.userId, pref.value);
    }
  }

  const projectPreferenceMap = spaceModelId
    ? await UserProjectPreferencesResource.fetchNotificationPreferenceMap(
        auth,
        {
          spaceModelId,
          userModelIds,
        }
      )
    : new Map<ModelId, NotificationCondition>();

  return participants.filter((participant) => {
    // Project-level preference overrides the general one if present.
    const notifyCondition =
      projectPreferenceMap.get(participant.id) ??
      generalPreferenceMap.get(participant.id) ??
      DEFAULT_NOTIFICATION_CONDITION;
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
    conversationId,
    messageId,
    userToNotifyId,
  }: {
    conversationId: string;
    messageId: string;
    userToNotifyId?: string; // Optional override for which user to notify, used in edge cases like adding a conversation participant.
  }
): Promise<
  Result<
    void,
    Omit<DustError, "code"> & {
      code: "internal_server_error";
    }
  >
> => {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return new Ok(undefined);
  }
  // Skip any sub-conversations.
  if (conversation.depth > 0) {
    return new Ok(undefined);
  }

  // Get conversation details including mentioned user IDs.
  const detailsResult = await getConversationDetails({
    auth,
    payload: {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      messageId,
    },
  });
  if (detailsResult.isErr()) {
    // Conversation or message was deleted - no notification needed.
    return new Ok(undefined);
  }
  if (
    detailsResult.value.isFromEmailAgentConversation ||
    detailsResult.value.isFromSlackAgentConversation
  ) {
    return new Ok(undefined);
  }
  const { authorUserId } = detailsResult.value;
  // Get all participants to determine total count (for single-participant exception).
  const totalParticipants = await conversation.listParticipants(auth);
  const allParticipants = totalParticipants.filter((p) => {
    if (userToNotifyId && p.sId !== userToNotifyId) {
      return false;
    }
    // Exclude the message author from notifications (they don't need to be
    // notified about their own message).
    if (authorUserId && p.sId === authorUserId) {
      return false;
    }
    return p.lastReadAt === null || conversation.updatedAt > p.lastReadAt;
  });

  if (allParticipants.length === 0) {
    return new Ok(undefined);
  }

  // Filter participants based on their notification condition preference.
  const participants = await filterParticipantsByNotifyCondition({
    auth,
    participants: allParticipants,
    mentionedUserIds: new Set(detailsResult.value.mentionedUserIds),
    totalParticipantCount: totalParticipants.length,
    spaceModelId: conversation.spaceId,
  });

  if (participants.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const r = await novuClient.triggerBulk({
      events: participants.map((p) => {
        const payload: ConversationUnreadPayloadType = {
          conversationId: conversation.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          messageId,
        };
        return {
          workflowId: CONVERSATION_UNREAD_TRIGGER_ID,
          to: {
            subscriberId: p.sId,
            email: p.email,
            firstName: p.firstName ?? undefined,
            lastName: p.lastName ?? undefined,
          },
          payload,
        };
      }),
    });

    if (r.result.some((event) => !!event.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_server_error",
        message: `Failed to trigger conversation unread notification due to network errors: ${eventErrors}`,
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
