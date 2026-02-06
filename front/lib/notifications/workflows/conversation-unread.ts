import { workflow } from "@novu/framework";
import type { ChannelPreference } from "@novu/react";
import assert from "assert";
import uniqBy from "lodash/uniqBy";
import { Op } from "sequelize";
import z from "zod";

import { isMessageUnread } from "@app/components/assistant/conversation/utils";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { Authenticator } from "@app/lib/auth";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
} from "@app/lib/data_retention";
import { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/conversations-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  AgentMessageType,
  ContentFragmentType,
  Result,
  UserMessageOrigin,
  UserMessageType,
  UserType,
} from "@app/types";
import {
  ConversationError,
  Err,
  getSmallWhitelistedModel,
  isContentFragmentType,
  isDevelopment,
  isUserMessageType,
  normalizeError,
  Ok,
  stripMarkdown,
} from "@app/types";
import { isRichUserMention } from "@app/types/assistant/mentions";
import type {
  NotificationCondition,
  NotificationPreferencesDelay,
} from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  isNotificationCondition,
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
  NOTIFICATION_DELAY_OPTIONS,
  WORKFLOW_TRIGGER_IDS,
} from "@app/types/notification_preferences";
import { assertNever } from "@app/types/shared/utils/assert_never";

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
    case "agent_copilot":
    case "project_butler":
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

const ConversationDetailsSchema = z.object({
  subject: z.string(),
  author: z.string(),
  authorIsAgent: z.boolean(),
  avatarUrl: z.string().optional(),
  isFromTrigger: z.boolean(),
  workspaceName: z.string(),
  mentionedUserIds: z.array(z.string()),
  hasUnreadMessages: z.boolean(),
  hasConversationRetentionPolicy: z.boolean(),
  hasAgentRetentionPolicies: z.boolean(),
});

type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

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
)): Promise<Result<ConversationDetailsType, ConversationError>> => {
  // Get or create auth from the discriminated union.
  let auth: Authenticator;
  if (providedAuth) {
    auth = providedAuth;
  } else {
    // subscriberId may be empty when previewing the workflow step.
    if (!subscriberId) {
      return new Ok({
        subject: "Deleted conversation",
        author: "Deleted conversation",
        authorIsAgent: false,
        isFromTrigger: false,
        workspaceName: "Deleted conversation",
        mentionedUserIds: [],
        avatarUrl: undefined,
        hasUnreadMessages: false,
        hasConversationRetentionPolicy: false,
        hasAgentRetentionPolicies: false,
      });
    }
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );
  }

  const conversationRes = await getConversation(auth, payload.conversationId);

  if (conversationRes.isErr()) {
    // Check if the conversation was deleted (expected during workflow delay).
    const deletedConversation = await ConversationResource.fetchById(
      auth,
      payload.conversationId,
      { includeDeleted: true }
    );
    if (deletedConversation) {
      return new Err(new ConversationError("conversation_not_found"));
    }
    // Conversation never existed - unexpected.
    throw new Error(`Conversation not found: ${payload.conversationId}`);
  }

  const conversation = conversationRes.value;

  const workspaceName = auth.getNonNullableWorkspace().name;
  const subject = conversation.title ?? "Dust conversation";
  const isFromTrigger = !!conversation.triggerId;

  // Retrieve the message that triggered the notification.
  const message = conversation.content
    .flat()
    .find((msg) => msg.sId === payload.messageId);
  if (!message) {
    // Message doesn't exist at all - unexpected.
    throw new Error(`Message not found: ${payload.messageId}`);
  }
  if (message.visibility === "deleted") {
    // Message was deleted during workflow delay - expected.
    return new Err(new ConversationError("message_not_found"));
  }

  let author: string;
  let authorIsAgent: boolean;
  let avatarUrl: string | undefined;
  let mentionedUserIds: string[] = [];

  if (isContentFragmentType(message)) {
    // Content fragments don't have author info.
    author = "Someone else";
    authorIsAgent = false;
  } else if (isUserMessageType(message)) {
    author = message.user?.fullName ?? "Someone else";
    avatarUrl = message.user?.image ?? undefined;
    authorIsAgent = false;

    // Extract approved user mentions from the rendered message.
    mentionedUserIds = message.richMentions
      .filter((m) => isRichUserMention(m) && m.status === "approved")
      .map((m) => m.id);
  } else {
    author = message.configuration.name
      ? `@${message.configuration.name}`
      : "An agent";
    avatarUrl = message.configuration.pictureUrl ?? undefined;
    authorIsAgent = true;
  }

  const hasUnreadMessages = conversation.content.some((messages) =>
    messages.some((msg) => isMessageUnread(msg, conversation.lastReadMs))
  );

  const conversationsRetention = await getConversationsDataRetention(auth);
  const hasConversationRetentionPolicy = conversationsRetention !== null;

  const agentsRetention = await getAgentsDataRetention(auth);
  const hasAgentRetentionPolicies = conversation.content.flat().some((msg) => {
    if (msg.type !== "agent_message") {
      return false;
    }

    return msg.configuration.sId in agentsRetention;
  });

  return new Ok({
    subject,
    author,
    authorIsAgent,
    avatarUrl,
    isFromTrigger,
    workspaceName,
    mentionedUserIds,
    hasUnreadMessages,
    hasConversationRetentionPolicy,
    hasAgentRetentionPolicies,
  });
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
  hasUnreadMessages,
}: {
  subscriberId?: string | null;
  payload: ConversationUnreadPayloadType;
  triggerShouldSkip: boolean;
  hasUnreadMessages: boolean;
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
  }

  return false;
};

const FUNCTION_NAME = "write_summary";

const specification: AgentActionSpecification = {
  name: FUNCTION_NAME,
  description: "Write a summary of the conversation",
  inputSchema: {
    type: "object",
    properties: {
      conversation_summary: {
        type: "string",
        description: "A short summary of the conversation.",
      },
    },
    required: ["conversation_summary"],
  },
};

const SUMMARY_ALLOWED_TOKEN_COUNT = 4000;

const generateUnreadMessagesSummary = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string;
  payload: ConversationUnreadPayloadType;
}): Promise<
  Result<
    string,
    DustError<
      | "conversation_not_found"
      | "no_unread_messages_found"
      | "no_whitelisted_model_found"
      | "internal_error"
      | "generation_failed"
      | "user_not_found"
    >
  >
> => {
  if (!subscriberId) {
    return new Ok("");
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  const conversationRes = await getConversation(auth, payload.conversationId);

  if (conversationRes.isErr()) {
    return new Err(
      new DustError("conversation_not_found", "Failed to get conversation")
    );
  }

  const conversation = conversationRes.value;

  const unreadMessages = conversation.content
    .map((messages) =>
      messages.filter((msg) => isMessageUnread(msg, conversation.lastReadMs))
    )
    .filter(
      (
        turn
      ): turn is
        | UserMessageType[]
        | AgentMessageType[]
        | ContentFragmentType[] => {
        if (turn.length === 0) {
          return false;
        }
        const firstType = turn[0].type;
        return turn.every((msg) => msg.type === firstType);
      }
    );

  if (unreadMessages.length === 0) {
    return new Err(
      new DustError("no_unread_messages_found", "No unread messages")
    );
  }

  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);

  if (!model) {
    return new Err(
      new DustError("no_whitelisted_model_found", "No whitelisted model found")
    );
  }

  const userFullName = auth.user()?.fullName();

  if (!userFullName) {
    return new Err(
      new DustError("user_not_found", "User not found for summary generation")
    );
  }
  // Generate LLM summary
  const prompt =
    `# Task\n` +
    `Write a 1-2 sentence summary of unread messages for ${userFullName} to quickly understand what happened while they were away.\n\n` +
    `CRITICAL RULE: You are writing to ${userFullName}. NEVER write their name "${userFullName}" in the summary. Always use "you/your/yours" instead.\n\n` +
    `# Input Format\n` +
    `You'll receive a JSON array of messages. Each message has:\n` +
    `- "role": "user" (human) or "assistant" (AI agent)\n` +
    `- "name": sender's display name (e.g., "Sarah Chen", "dust")\n` +
    `- "content": message text (human messages start with <dust_system> block with sender details)\n\n` +
    `Use "role", "name", and <dust_system> to attribute senders correctly. Use message text for what happened. Never guess.\n\n` +
    `# Writing Rules\n` +
    `1. **Length**: 1-2 sentences maximum\n` +
    `2. **Second person**: Use "you/your/yours" when referring to ${userFullName} - NEVER write "${userFullName}"\n` +
    `3. **Outcome-first**: Lead with what's ready/decided + what's needed + key specifics (dates, numbers)\n` +
    `4. **No chat narration**: Don't write "X asked", "assistant provided", "then Y replied"\n` +
    `5. **Result phrasing**: Use neutral outcomes - "Draft is ready", "Meeting scheduled", "Sarah needs..."\n` +
    `6. **Use names**: Refer to other participants by name, never "the user"\n` +
    `7. **Accurate attribution**: Only include information actually in the messages\n\n` +
    `# Examples\n\n` +
    `## BAD\n` +
    `"David asked assistant about the hiring budget; assistant provided a spreadsheet; then Emily asked ${userFullName} to review."\n` +
    `Problems: Chat narration, uses "${userFullName}"\n\n` +
    `## GOOD\n` +
    `"Hiring budget spreadsheet is ready for Q1. Emily needs your review by Wednesday."\n` +
    `Why: Outcome-first, uses "your", skips process\n\n` +
    `## BAD\n` +
    `"User requested design mockups; assistant generated options; Sarah replied with feedback and asked ${userFullName} for approval."\n` +
    `Problems: "User" is vague, chat narration, uses "${userFullName}"\n\n` +
    `## GOOD\n` +
    `"Three design mockups are ready with Sarah's feedback. She's waiting on your approval to move forward."\n` +
    `Why: Specific numbers, outcome-focused, uses "your"\n\n` +
    `## BAD\n` +
    `"User asked about Q4 budget; assistant replied with figures; Sarah mentioned deadline and asked ${userFullName} for timeline."\n` +
    `Problems: Generic "user", process narration, uses "${userFullName}"\n\n` +
    `## GOOD\n` +
    `"Q4 budget approved at $2.5M. Sarah needs your team's timeline by Friday to finalize."\n` +
    `Why: Key details (number, deadline), uses "your", outcome-focused\n\n` +
    `# Your Task\n` +
    `Read the conversation messages below and write a 1-2 sentence summary following ALL rules above.\n` +
    `Remember: Use "you/your" - NEVER write "${userFullName}".\n` +
    `Write in a natural, engaging tone that makes someone want to read it.`;

  const modelConversationRes = await renderConversationForModel(auth, {
    conversation: {
      ...conversation,
      content: unreadMessages,
    },
    model,
    prompt,
    tools: JSON.stringify(specification),
    allowedTokenCount: Math.min(
      model.contextSize - model.generationTokensCount,
      SUMMARY_ALLOWED_TOKEN_COUNT
    ),
    excludeActions: true,
    excludeImages: true,
  });

  if (modelConversationRes.isErr()) {
    return new Err(
      new DustError("internal_error", "Failed to render conversation for model")
    );
  }

  const { modelConversation } = modelConversationRes.value;

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: FUNCTION_NAME,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            name: userFullName,
            content: [
              {
                type: "text",
                text: `This is the content of the conversation to summarize:\n\n\`\`\`json\n${JSON.stringify(modelConversation.messages, null, 2)}\n\`\`\``,
              },
            ],
          },
        ],
      },
      prompt,
      specifications: [specification],
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "conversation_unread_summary",
        conversationId: conversation.sId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(new DustError("generation_failed", res.error.message));
  }

  // Extract summary from function call result.
  if (res.value.actions?.[0]?.arguments?.conversation_summary) {
    const summary = res.value.actions[0].arguments.conversation_summary;
    return new Ok(stripMarkdown(summary));
  }

  return new Err(
    new DustError("generation_failed", "No conversation summary generated")
  );
};

export const conversationUnreadWorkflow = workflow(
  WORKFLOW_TRIGGER_IDS.CONVERSATION_UNREAD,
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
        return {
          subject: `New message from ${d.author}`,
          body: d.authorIsAgent
            ? `${d.author} replied in the conversation "${d.subject}".`
            : `You have a new message from ${d.author} in the conversation "${d.subject}".`,
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
        // No email from trigger until we give more control over the notification to the users.
        skip: async () =>
          !details ||
          shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
            triggerShouldSkip: true,
            hasUnreadMessages: details.hasUnreadMessages,
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
              payload: event.payload as ConversationUnreadPayloadType,
              triggerShouldSkip: true,
              hasUnreadMessages: detailsResult.value.hasUnreadMessages,
            });
            if (shouldSkip) {
              return;
            }

            if (detailsResult.value.hasConversationRetentionPolicy) {
              conversations.push({
                id: payload.conversationId,
                title: detailsResult.value.subject,
                summary:
                  "Summary not generated due to data retention policy on conversations in this workspace.",
              });
              return;
            }

            if (detailsResult.value.hasAgentRetentionPolicies) {
              conversations.push({
                id: payload.conversationId,
                title: detailsResult.value.subject,
                summary:
                  "Summary not generated due to data retention policy on agents in this conversation.",
              });
              return;
            }

            // Generate summary of unread messages
            const summaryResult = await generateUnreadMessagesSummary({
              subscriberId: subscriber.subscriberId,
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
              conversations.push({
                id: payload.conversationId,
                title: detailsResult.value.subject,
                summary: null,
              });
              return;
            }

            conversations.push({
              id: payload.conversationId,
              title: detailsResult.value.subject,
              summary: summaryResult.value,
            });
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
        const subject =
          conversations.length > 1
            ? `[Dust] New unread message(s) in ${conversations.length} conversations`
            : `[Dust] ${conversations[0]?.title ?? "New unread message(s) in conversation"}`;
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
  participants: (UserType & { lastReadAt: Date | null })[];
  mentionedUserIds: Set<string>;
  totalParticipantCount: number;
}): Promise<(UserType & { lastReadAt: Date | null })[]> => {
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
  const totalParticipants = await conversation.listParticipants(auth);
  const allParticipants = totalParticipants.filter(
    (p) => p.lastReadAt === null || conversation.updatedAt > p.lastReadAt
  );

  if (allParticipants.length === 0) {
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

  // Filter participants based on their notification condition preference.
  const participants = await filterParticipantsByNotifyCondition({
    participants: allParticipants,
    mentionedUserIds: new Set(detailsResult.value.mentionedUserIds),
    totalParticipantCount: totalParticipants.length,
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
          workflowId: WORKFLOW_TRIGGER_IDS.CONVERSATION_UNREAD,
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
