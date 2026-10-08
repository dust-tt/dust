import config from "@app/lib/api/config";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import {
  ensureSlackNotificationsReady,
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
  generateUnreadMessagesSummary,
  getConversationDetails,
} from "@app/lib/notifications/helpers";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { ConversationUnreadPayloadType } from "@app/lib/notifications/triggers/conversation-unread";
import {
  shouldSkipConversation,
  shouldSkipConversationExternalNotification,
} from "@app/lib/notifications/triggers/conversation-unread";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import {
  CONVERSATION_UNREAD_TRIGGER_ID,
  NOTIFICATION_DELAY_OPTIONS,
  NOTIFICATION_PREFERENCES_DELAYS,
} from "@app/types/notification_preferences";
import { isDevelopment } from "@app/types/shared/env";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";
import assert from "assert";
import z from "zod";

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

export const buildConversationUnreadEmailSubject = (
  i18n: I18n,
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
      const projectName = uniqueProjectNames[0];
      const count = conversations.length;
      return i18n._(
        msg`[Dust] ${plural(count, {
          one: `New conversation in "${projectName}"`,
          other: `New conversations in "${projectName}"`,
        })}`
      );
    }
    return i18n._(msg`[Dust] New conversations in your Pods`);
  }
  if (conversations.length === 1) {
    return `[Dust] ${conversations[0]?.title ?? i18n._(msg`New unread message(s) in conversation`)}`;
  }
  const count = conversations.length;
  return i18n._(msg`[Dust] New unread messages in ${count} conversations`);
};

export function buildConversationUnreadInAppCopy(
  i18n: I18n,
  d: Pick<
    ConversationDetailsType,
    | "isNewProjectConversation"
    | "projectName"
    | "author"
    | "authorIsAgent"
    | "subject"
  >
): { subject: string; body: string; actionLabel: string } {
  const { author, subject: conversationTitle } = d;
  const projectName = d.projectName ?? "";
  const actionLabel = i18n._(msg({ message: "View", context: "action" }));
  if (d.isNewProjectConversation) {
    return {
      subject: i18n._(msg`New conversation in ${projectName}`),
      body: i18n._(msg`${author} created "${conversationTitle}"`),
      actionLabel,
    };
  }
  return {
    subject: i18n._(msg`New message from ${author}`),
    body: d.authorIsAgent
      ? i18n._(
          msg`${author} replied in the conversation "${conversationTitle}".`
        )
      : i18n._(
          msg`You have a new message from ${author} in the conversation "${conversationTitle}".`
        ),
    actionLabel,
  };
}

export function buildConversationUnreadSlackMessage(
  i18n: I18n,
  d: ConversationDetailsType,
  conversationUrl: string
): string {
  const { author, subject: conversationTitle } = d;
  const projectName = d.projectName ?? "";
  const messagePreview = getMessagePreviewSlack(i18n, d);
  const baseMessage = d.isNewProjectConversation
    ? i18n._(
        msg`There is a new conversation in "${projectName}": ${author} started "${conversationTitle}"`
      )
    : d.authorIsAgent
      ? i18n._(msg`${author} replied in "${conversationTitle}"`)
      : i18n._(msg`New message from ${author} in "${conversationTitle}"`);
  const viewLink = `<${conversationUrl}|${i18n._(msg`View conversation`)}>`;

  return messagePreview
    ? `${baseMessage}\n${messagePreview}\n${viewLink}`
    : `${baseMessage}\n${viewLink}`;
}

export const getMessagePreviewText = (
  i18n: I18n,
  details: ConversationDetailsType
): string | undefined => {
  if (details.hasConversationRetentionPolicy) {
    return i18n._(
      msg`Preview not available due to data retention policy on conversations in this workspace.`
    );
  }
  if (details.hasAgentRetentionPolicies) {
    return i18n._(
      msg`Preview not available due to data retention policy on agents in this conversation.`
    );
  }
  if (details.newMessageContent) {
    const stripped = stripMarkdown(details.newMessageContent);
    const trimmed = stripped.trim();
    return trimmed.substring(0, 300) + (trimmed.length > 300 ? "..." : "");
  }
};

export const getMessagePreviewSlack = (
  i18n: I18n,
  details: ConversationDetailsType
): string | undefined => {
  const preview = getMessagePreviewText(i18n, details);
  if (!preview) {
    return undefined;
  }
  // Replace newlines with "> \n" to maintain blockquote formatting on each line
  return preview
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
};

export const getEmailSummary = async ({
  i18n,
  details,
  subscriberId,
  payload,
}: {
  i18n: I18n;
  details: ConversationDetailsType;
  subscriberId: string;
  payload: ConversationDetailsPayload;
}): Promise<string | null> => {
  if (details.hasConversationRetentionPolicy) {
    return i18n._(
      msg`Summary not generated due to data retention policy on conversations in this workspace.`
    );
  }

  if (details.hasAgentRetentionPolicies) {
    return i18n._(
      msg`Summary not generated due to data retention policy on agents in this conversation.`
    );
  }

  // Generate summary of unread messages
  const summaryResult = await generateUnreadMessagesSummary({
    subscriberId,
    payload,
  });

  if (summaryResult.isErr()) {
    switch (summaryResult.error.code) {
      case "generation_failed":
      case "conversation_not_found":
      case "no_unread_messages_found":
      case "internal_error":
      case "no_whitelisted_model_found":
      case "user_not_found":
        break;
      default:
        assertNever(summaryResult.error.code);
    }
    return null;
  }
  return summaryResult.value;
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

        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );
        const { subject, body, actionLabel } = buildConversationUnreadInAppCopy(
          i18n,
          d
        );

        return {
          subject,
          body,
          primaryAction: {
            label: actionLabel,
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

        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );
        const message = buildConversationUnreadSlackMessage(
          i18n,
          d,
          conversationUrl
        );

        return {
          body: message,
        };
      },
      {
        skip: async () => {
          if (!details) {
            return true;
          }
          if (
            await shouldSkipConversationExternalNotification(
              payload.workspaceId
            )
          ) {
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
        skip: async () =>
          !details ||
          (await shouldSkipConversationExternalNotification(
            payload.workspaceId
          )),
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
        skip: async () =>
          !details ||
          (await shouldSkipConversationExternalNotification(
            payload.workspaceId
          )),
      }
    );

    await step.email(
      "send-email",
      async () => {
        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );
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
                messagePreview: getMessagePreviewText(
                  i18n,
                  detailsResult.value
                ),
              });
            } else {
              const summary = await getEmailSummary({
                i18n,
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
          i18n,
          name: subscriber.firstName ?? undefined,
          workspace: {
            id: payload.workspaceId,
            name: details!.workspaceName,
          },
          conversations,
        });

        const subject = buildConversationUnreadEmailSubject(
          i18n,
          conversations
        );
        return {
          subject,
          body,
        };
      },
      {
        // No email from trigger until we give more control over the notification to the users.
        skip: async () => {
          if (
            await shouldSkipConversationExternalNotification(
              payload.workspaceId
            )
          ) {
            return true;
          }
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
    preferences: {
      channels: {
        chat: {
          enabled: false,
        },
      },
    },
  }
);
