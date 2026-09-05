import { isMessageUnread } from "@app/components/assistant/conversation/utils";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  countConversationMessages,
  renderConversationAsText,
} from "@app/lib/api/assistant/conversation/render_as_text";
import {
  getEffectiveWhiteListedProviders,
  getSmallWhitelistedModel,
} from "@app/lib/api/assistant/models";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import { Authenticator } from "@app/lib/auth";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
} from "@app/lib/data_retention";
import { DustError } from "@app/lib/error";
import {
  conversationUsesAgentsWithRetention,
  conversationWithoutContentForResource,
  fetchFirstVisibleLightMessage,
  fetchLightMessageBySId,
  fetchUserMessageOriginBySId,
  getUnreadNotificationFlags,
} from "@app/lib/notifications/conversation_fetch";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import {
  ConversationError,
  getConversationDisplayTitle,
  isCompactionMessageType,
  isLightAgentMessageType,
  isPodConversation,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { isRichUserMention } from "@app/types/assistant/mentions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import {
  decodeHtmlEntities,
  stripMarkdown,
} from "@app/types/shared/utils/markdown";
import { z } from "zod";

// When isNewProjectConversation is true, messageId is not required (the first
// message is resolved from conversation content). Otherwise messageId is required.
export const ConversationDetailsPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  messageId: z.string().optional(),
  isNewProjectConversation: z.boolean().optional(),
});

export type ConversationDetailsPayload = z.infer<
  typeof ConversationDetailsPayloadSchema
>;

export const ConversationDetailsSchema = z.object({
  subject: z.string(),
  author: z.string(),
  authorIsAgent: z.boolean(),
  authorUserId: z.string().optional(),
  isFromTrigger: z.boolean(),
  isFromEmailAgentConversation: z.boolean(),
  isFromSlackAgentConversation: z.boolean(),
  workspaceName: z.string(),
  mentionedUserIds: z.array(z.string()),
  hasUnreadMessages: z.boolean(),
  hasUnreadMentions: z.boolean(),
  hasConversationRetentionPolicy: z.boolean(),
  hasAgentRetentionPolicies: z.boolean(),
  newMessageContent: z.string().nullable(),
  isNewProjectConversation: z.boolean().optional(),
  projectName: z.string().optional(),
});

export type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

export const getConversationDetails = async ({
  payload,
  auth: providedAuth,
  subscriberId,
}: { payload: ConversationDetailsPayload } & (
  | { auth: Authenticator; subscriberId?: never }
  | { auth?: never; subscriberId: string }
)): Promise<Result<ConversationDetailsType, ConversationError>> => {
  if (!payload.isNewProjectConversation && !payload.messageId) {
    throw new Error(
      "messageId is required when isNewProjectConversation is false"
    );
  }

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
        isFromEmailAgentConversation: false,
        isFromSlackAgentConversation: false,
        workspaceName: "Deleted conversation",
        mentionedUserIds: [],
        avatarUrl: undefined,
        hasUnreadMessages: false,
        hasUnreadMentions: false,
        hasConversationRetentionPolicy: false,
        hasAgentRetentionPolicies: false,
        newMessageContent: null,
        isNewProjectConversation: false,
      });
    }
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );
  }

  const resource = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  if (!resource) {
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

  const conversation = await conversationWithoutContentForResource(
    auth,
    resource
  );

  const workspaceName = auth.getNonNullableWorkspace().name;
  // Decode HTML entities in conversation title (e.g. from email subjects
  // that may contain &amp;, &lt;, etc.) so notification subjects/bodies
  // display clean text.
  const subject = decodeHtmlEntities(getConversationDisplayTitle(conversation));
  const isFromTrigger = !!conversation.triggerId;

  // Retrieve the message that triggered the notification.
  // For new project conversations, use the first visible message.
  const messageRes = !payload.isNewProjectConversation
    ? await fetchLightMessageBySId(auth, {
        resource,
        conversation,
        messageId: payload.messageId!,
      })
    : await fetchFirstVisibleLightMessage(auth, resource);

  if (messageRes.isErr()) {
    return messageRes;
  }

  const message = messageRes.value;
  if (message.visibility === "deleted") {
    // Message was deleted during workflow delay - expected.
    return new Err(new ConversationError("message_not_found"));
  }

  let author: string;
  let authorIsAgent: boolean;
  let authorUserId: string | undefined;
  let mentionedUserIds: string[] = [];
  const messageContent =
    message.type === "agent_message" || message.type === "user_message"
      ? message.content
      : "";

  const parentOrigin = isLightAgentMessageType(message)
    ? await fetchUserMessageOriginBySId(auth, {
        conversation,
        messageId: message.parentMessageId,
      })
    : null;

  const isFromEmailAgentConversation =
    (isUserMessageType(message) && message.context.origin === "email") ||
    parentOrigin === "email";

  const isFromSlackAgentConversation =
    (isUserMessageType(message) && message.context.origin === "slack") ||
    parentOrigin === "slack";

  if (isCompactionMessageType(message)) {
    // Compaction messages don't trigger notifications.
    return new Err(new ConversationError("message_not_found"));
  } else if (isUserMessageType(message)) {
    author =
      message.user?.fullName ?? message.context.fullName ?? "Someone else";
    authorUserId = message.user?.sId ?? undefined;
    authorIsAgent = false;

    // Extract approved user mentions from the rendered message.
    mentionedUserIds = message.richMentions
      .filter((m) => isRichUserMention(m) && m.status === "approved")
      .map((m) => m.id);
  } else if (isLightAgentMessageType(message)) {
    author = message.configuration.name || "An agent";
    authorIsAgent = true;
  } else {
    assertNever(message);
  }

  const { hasUnreadMessages, hasUnreadMentions } =
    await getUnreadNotificationFlags(auth, { resource, conversation });

  const conversationsRetention = await getConversationsDataRetention(auth);
  const hasConversationRetentionPolicy = conversationsRetention !== null;

  const agentsRetention = await getAgentsDataRetention(auth);
  const hasAgentRetentionPolicies = await conversationUsesAgentsWithRetention(
    auth,
    resource,
    agentsRetention
  );

  // Fetch project-specific details when this is a new project conversation notification.
  let projectName: string | undefined;
  const isNewProjectConversation = !!payload.isNewProjectConversation;

  if (isNewProjectConversation && isPodConversation(conversation)) {
    const project = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (project) {
      projectName = project.name;
    }
  }

  return new Ok({
    subject,
    author,
    authorIsAgent,
    authorUserId,
    isFromTrigger,
    isFromEmailAgentConversation,
    isFromSlackAgentConversation,
    workspaceName,
    mentionedUserIds,
    hasUnreadMessages,
    hasUnreadMentions,
    hasConversationRetentionPolicy,
    hasAgentRetentionPolicies,
    newMessageContent: messageContent,
    isNewProjectConversation,
    projectName,
  });
};

const MAX_CONVERSATION_SNIPPET_LENGTH = 12_000;
//Shared by the unread-summary and activation-recommendation generators.
const runConversationSummaryToolCall = async (
  auth: Authenticator,
  {
    userFullName,
    conversationId,
    conversationSnippet,
    prompt,
    specification,
    functionName,
    operationType,
  }: {
    userFullName: string;
    conversationId: string;
    conversationSnippet: string;
    prompt: string;
    specification: AgentActionSpecification;
    functionName: string;
    operationType: LLMTraceContext["operationType"];
  }
): Promise<
  Result<
    Record<string, unknown>,
    DustError<"no_whitelisted_model_found" | "generation_failed">
  >
> => {
  const owner = auth.getNonNullableWorkspace();

  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);
  const model = getSmallWhitelistedModel(auth, undefined, {
    whiteListedProviders,
  });
  if (!model) {
    return new Err(
      new DustError("no_whitelisted_model_found", "No whitelisted model found")
    );
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: functionName,
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
                text: `This is the content of the conversation to summarize:\n\n${conversationSnippet}`,
              },
            ],
          },
        ],
      },
      prompt,
      specifications: [specification],
      forceToolCall: functionName,
    },
    {
      context: {
        operationType,
        conversationId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(new DustError("generation_failed", res.error.message));
  }

  const args = res.value.actions?.[0]?.arguments;
  if (!args) {
    return new Err(
      new DustError("generation_failed", "No tool call result generated")
    );
  }

  return new Ok(args);
};

const UNREAD_SUMMARY_FUNCTION_NAME = "write_summary";

const unreadSummarySpecification: AgentActionSpecification = {
  name: UNREAD_SUMMARY_FUNCTION_NAME,
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

const generateUnreadMessagesSummary = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string;
  payload: ConversationDetailsPayload;
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

  // biome-ignore lint/plugin/noExpensiveConversationFetch: message content is needed to compute unread messages.
  const conversationRes = await getLightConversation(
    auth,
    payload.conversationId
  );

  if (conversationRes.isErr()) {
    return new Err(
      new DustError("conversation_not_found", "Failed to get conversation")
    );
  }

  const conversation = conversationRes.value;

  const unreadMessages = conversation.content.filter((msg) =>
    isMessageUnread(msg, conversation.lastReadMs)
  );

  if (unreadMessages.length === 0) {
    return new Err(
      new DustError("no_unread_messages_found", "No unread messages")
    );
  }

  const owner = auth.getNonNullableWorkspace();

  const userFullName = auth.user()?.fullName();

  if (!userFullName) {
    return new Err(
      new DustError("user_not_found", "User not found for summary generation")
    );
  }
  // Generate LLM summary
  const prompt =
    `# Task\n` +
    `Write a 1-2 sentence summary of unread messages for ${userFullName} to quickly understand what happened while they were away and what action (if any) is needed from them.\n\n` +
    `CRITICAL RULE: You are writing to ${userFullName}. NEVER write their name "${userFullName}" in the summary. Always use "you/your/yours" instead.\n\n` +
    `# Input Format\n` +
    `You'll receive a JSON array of UNREAD messages (not the full conversation history, only what ${userFullName} hasn't seen yet). Each message has:\n` +
    `- "role": "user" (human) or "assistant" (AI agent)\n` +
    `- "name": sender's display name (e.g., "Sarah Chen", "dust")\n` +
    `- "content": message text (human messages start with <dust_system> block with sender details)\n\n` +
    `Use "role", "name", and <dust_system> to attribute senders correctly. Use message text for what happened. Never guess.\n\n` +
    `# Writing Rules\n` +
    `1. **Length**: 1-2 sentences maximum\n` +
    `2. **Second person**: Use "you/your/yours" when referring to ${userFullName} - NEVER write "${userFullName}"\n` +
    `3. **Action-first**: If someone needs something from ${userFullName}, lead with that: "[Name] needs you to [action] [details]"\n` +
    `4. **Outcome-first for updates**: If no action needed from ${userFullName}, lead with what's ready/decided: "Draft is ready", "Meeting scheduled"\n` +
    `5. **No chat narration**: NEVER write "X asked", "assistant provided", "then Y replied"\n` +
    `6. **Result phrasing**: Use neutral outcomes - "Draft is ready", "Meeting scheduled", "Sarah needs..."\n` +
    `7. **Use names**: Refer to other participants by name, never "the user"\n` +
    `8. **Accurate attribution**: Only include information actually in the messages\n\n` +
    `# Examples\n\n` +
    `## Action Needed (someone waiting on the recipient)\n` +
    `"Sarah needs your approval on the Q1 hiring budget ($450K) by end of week to finalize headcount."\n` +
    `"Alex needs you to choose between the three homepage designs by Tuesday for the product launch."\n` +
    `"Jordan needs your technical review of the migration plan—specifically whether the 2-week timeline is feasible."\n\n` +
    `## Updates (no specific action needed)\n` +
    `"Three design mockups are ready with Sarah's feedback for the homepage redesign."\n` +
    `"Q4 budget approved at $2.5M. Implementation timeline set for March."\n` +
    `"David shared the customer research findings—80% want mobile-first experience."\n\n` +
    `## Mixed (update + action)\n` +
    `"Hiring budget spreadsheet is ready for Q1. Emily needs your review by Wednesday."\n` +
    `"Three design mockups are ready with Sarah's feedback. She's waiting on your approval to move forward."\n\n` +
    `# Your Task\n` +
    `Read the UNREAD messages below and write a 1-2 sentence summary following ALL rules above.\n` +
    `Prioritize any actions needed from the recipient first, then updates. Include key specifics.\n` +
    `Remember: Use "you/your" - NEVER write "${userFullName}".\n` +
    `Write in a natural, engaging tone that makes someone want to read it.`;

  const renderedMessages = renderConversationAsText(conversation, {
    includeTimestamps: true,
    includeEmail: true,
    includeUnread: true,
    truncateTotalChars: MAX_CONVERSATION_SNIPPET_LENGTH,
  });

  const preamble = [
    `Conversation: ${conversation.sId}`,
    `Title: ${getConversationDisplayTitle(conversation)}`,
    `Created: ${new Date(conversation.created).toISOString()}`,
    `Updated: ${new Date(conversation.updated).toISOString()}`,
    `Unread: ${conversation.unread}`,
    `Action Required: ${conversation.actionRequired}`,
    `Has Error: ${conversation.hasError}`,
    `Message Count: ${countConversationMessages(conversation)}`,
    `URL: /w/${owner.sId}/assistant/${conversation.sId}`,
  ].join("\n");

  const conversationSnippet = `${preamble}\n\n${renderedMessages}`;

  const res = await runConversationSummaryToolCall(auth, {
    userFullName,
    conversationId: conversation.sId,
    conversationSnippet,
    prompt,
    specification: unreadSummarySpecification,
    functionName: UNREAD_SUMMARY_FUNCTION_NAME,
    operationType: "conversation_unread_summary",
  });

  if (res.isErr()) {
    return new Err(res.error);
  }

  // Extract summary from function call result.
  const summary = res.value.conversation_summary;
  if (isString(summary) && summary.length > 0) {
    return new Ok(stripMarkdown(summary));
  }

  return new Err(
    new DustError("generation_failed", "No conversation summary generated")
  );
};

export const getEmailSummary = async ({
  details,
  subscriberId,
  payload,
}: {
  details: ConversationDetailsType;
  subscriberId: string;
  payload: ConversationDetailsPayload;
}): Promise<string | null> => {
  if (details.hasConversationRetentionPolicy) {
    return "Summary not generated due to data retention policy on conversations in this workspace.";
  }

  if (details.hasAgentRetentionPolicies) {
    return "Summary not generated due to data retention policy on agents in this conversation.";
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

const ACTIVATION_RECOMMENDATION_FUNCTION_NAME = "write_recommendation";

const activationRecommendationSpecification: AgentActionSpecification = {
  name: ACTIVATION_RECOMMENDATION_FUNCTION_NAME,
  description: "Write the intro goal for a proactive recommendation email",
  inputSchema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description:
          "A clear, friendly, plain-English goal that completes: 'We put together a simple way to help you [GOAL].' " +
          "Return a concise 6–8 word phrase that fits naturally after 'help you' and expresses what the user will be able to do or achieve. " +
          "Use direct, everyday language that makes sense to someone unfamiliar with Dust. Avoid Dust-specific terms or references to how the " +
          "recommendation works, such as 'agent,' 'workflow,' 'prompt,' 'pod,' or 'automation.' " +
          "For example, return ‘stay on top of important follow-ups’ rather than ‘use an agent to summarize meeting transcripts.’",
      },
    },
    required: ["goal"],
  },
};

// A proactive recommendation email surfaces a conversation a Dust agent
// prepared for the user. We generate a short "goal" phrase for the intro
// line via a single LLM call.
const generateActivationRecommendation = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string;
  payload: ConversationDetailsPayload;
}): Promise<
  Result<
    { goal: string },
    DustError<
      | "conversation_not_found"
      | "no_whitelisted_model_found"
      | "generation_failed"
      | "user_not_found"
    >
  >
> => {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId ?? "",
    payload.workspaceId
  );

  // biome-ignore lint/plugin/noExpensiveConversationFetch: message content is needed to render the conversation for summary generation.
  const conversationRes = await getLightConversation(
    auth,
    payload.conversationId
  );

  if (conversationRes.isErr()) {
    return new Err(
      new DustError("conversation_not_found", "Failed to get conversation")
    );
  }

  const conversation = conversationRes.value;

  const owner = auth.getNonNullableWorkspace();

  const userFullName = auth.user()?.fullName();

  if (!userFullName) {
    return new Err(
      new DustError("user_not_found", "User not found for summary generation")
    );
  }

  const recommendations =
    await ActivationRecommendationResource.fetchByConversationSId(
      auth,
      conversation.sId
    );

  const recommendationCardSection =
    recommendations.length > 0
      ? `# Recommendation card shown to the user\n` +
        `Base the goal primarily on this card; use the conversation below only for supporting context.\n` +
        recommendations
          .map((rec) => `- ${rec.title}: ${rec.content}`)
          .join("\n") +
        `\n\n`
      : "";

  const prompt =
    "A clear, friendly, plain-English goal that completes: 'We put together a simple way to help you [GOAL].' " +
    "Return a concise 6–8 word phrase that fits naturally after 'help you' and expresses what the user will be able to do or achieve. " +
    "Use direct, everyday language that makes sense to someone unfamiliar with Dust. Avoid Dust-specific terms or references to how the " +
    "recommendation works, such as 'agent,' 'workflow,' 'prompt,' 'pod,' or 'automation.' " +
    "For example, return ‘stay on top of important follow-ups’ rather than ‘use an agent to summarize meeting transcripts.’";

  const renderedMessages = renderConversationAsText(conversation, {
    includeTimestamps: true,
    includeEmail: true,
    includeUnread: false,
    truncateTotalChars: MAX_CONVERSATION_SNIPPET_LENGTH,
  });

  const preamble = [
    `Conversation: ${conversation.sId}`,
    `Title: ${getConversationDisplayTitle(conversation)}`,
    `Created: ${new Date(conversation.created).toISOString()}`,
    `Message Count: ${countConversationMessages(conversation)}`,
    `URL: /w/${owner.sId}/assistant/${conversation.sId}`,
  ].join("\n");

  const conversationSnippet = `${preamble}\n\n${recommendationCardSection}${renderedMessages}`;

  const res = await runConversationSummaryToolCall(auth, {
    userFullName,
    conversationId: conversation.sId,
    conversationSnippet,
    prompt,
    specification: activationRecommendationSpecification,
    functionName: ACTIVATION_RECOMMENDATION_FUNCTION_NAME,
    operationType: "activation_recommendation",
  });

  if (res.isErr()) {
    return new Err(res.error);
  }

  const { goal } = res.value;
  if (typeof goal === "string" && goal.length > 0) {
    return new Ok({
      goal: stripMarkdown(goal),
    });
  }

  return new Err(
    new DustError("generation_failed", "No recommendation content generated")
  );
};

export const getActivationRecommendation = async ({
  details,
  subscriberId,
  payload,
}: {
  details: ConversationDetailsType;
  subscriberId: string;
  payload: ConversationDetailsPayload;
}): Promise<{ goal: string | null }> => {
  if (
    details.hasConversationRetentionPolicy ||
    details.hasAgentRetentionPolicies
  ) {
    logger.info(
      {
        conversationId: payload.conversationId,
        workspaceId: payload.workspaceId,
        hasConversationRetentionPolicy: details.hasConversationRetentionPolicy,
        hasAgentRetentionPolicies: details.hasAgentRetentionPolicies,
      },
      "[activation] Skipping recommendation generation due to data retention policy; email falls back to static copy."
    );
    return { goal: null };
  }

  const result = await generateActivationRecommendation({
    subscriberId,
    payload,
  });

  if (result.isErr()) {
    switch (result.error.code) {
      case "generation_failed":
      case "conversation_not_found":
      case "no_whitelisted_model_found":
      case "user_not_found":
        break;
      default:
        assertNever(result.error.code);
    }
    logger.warn(
      {
        conversationId: payload.conversationId,
        workspaceId: payload.workspaceId,
        code: result.error.code,
        message: result.error.message,
      },
      "[activation] Recommendation generation failed; email falls back to static copy."
    );
    return { goal: null };
  }

  return result.value;
};
