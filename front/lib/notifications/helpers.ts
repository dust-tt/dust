import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  countConversationMessages,
  renderConversationAsText,
} from "@app/lib/api/assistant/conversation/render_as_text";
import { getSmallWhitelistedModel } from "@app/lib/api/assistant/models";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { Authenticator } from "@app/lib/auth";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
} from "@app/lib/data_retention";
import { DustError } from "@app/lib/error";
import { getActiveSubscriberAuth } from "@app/lib/notifications";
import {
  conversationUsesAgentsWithRetention,
  conversationWithoutContentForResource,
  fetchFirstVisibleLightMessage,
  fetchLightMessageBySId,
  fetchUserMessageOriginBySId,
  getUnreadNotificationFlags,
} from "@app/lib/notifications/conversation_fetch";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  ConversationError,
  getConversationDisplayTitle,
  isCompactionMessageType,
  isLightAgentMessageType,
  isMessageUnread,
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
    const subscriberAuth = await getActiveSubscriberAuth(
      subscriberId,
      payload.workspaceId
    );
    if (!subscriberAuth) {
      return new Err(new ConversationError("conversation_access_restricted"));
    }
    auth = subscriberAuth;
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

  const model = await getSmallWhitelistedModel(auth);
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
  description:
    "Write a 1-2 sentence summary of the unread messages, addressed to the recipient in the second person.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_summary: {
        type: "string",
        description:
          'A 1-2 sentence summary of the unread messages only, addressed to the recipient as "you". Start with the substance (e.g. "@dust answered your question: ..."), never with "You received". Never "the user", never narrate who asked what.',
      },
    },
    required: ["conversation_summary"],
  },
};

export const generateUnreadMessagesSummary = async ({
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

  const auth = await getActiveSubscriberAuth(subscriberId, payload.workspaceId);
  if (!auth) {
    return new Err(
      new DustError("user_not_found", "User is not a member of the workspace")
    );
  }

  // oxlint-disable-next-line dust/noExpensiveConversationFetch -- message content is needed to compute unread messages.
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

  const user = auth.user();
  const userFullName = user?.fullName();

  if (!user || !userFullName) {
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
    `You'll receive a header (title, dates, flags) followed by the conversation as plain text. Each message starts with a header line:\n` +
    `- \`>> User (Name, email) [timestamp]\`: a message written by a human. "User" is only a label, not a name.\n` +
    `- \`>> Agent (Name) [timestamp]\`: a message written by an AI agent.\n` +
    `- \`>> Content Fragment [timestamp]\`: a file or document attached to the conversation.\n` +
    `Headers ending with \`(unread)\` are messages ${userFullName} has NOT seen yet. Messages without \`(unread)\` were already read: use them only as context, never summarize them.\n\n` +
    `Messages from \`${user.email}\` were written by ${userFullName} (the recipient): refer to them as "you" (e.g. "your question", "the CSV you asked for"). Attribute other senders by the name in their header. Never guess.\n\n` +
    `# Writing Rules\n` +
    `1. **Length**: 1-2 sentences maximum\n` +
    `2. **Second person**: Use "you/your/yours" when referring to ${userFullName} - NEVER write "${userFullName}"\n` +
    `3. **Action-first**: If someone needs something from ${userFullName}, lead with that: "[Name] needs you to [action] [details]"\n` +
    `4. **Outcome-first for updates**: If no action needed from ${userFullName}, lead with what's ready/decided: "Draft is ready", "Meeting scheduled"\n` +
    `5. **No chat narration**: NEVER write "X asked", "assistant provided", "then Y replied"\n` +
    `6. **Result phrasing**: Use neutral outcomes - "Draft is ready", "Meeting scheduled", "Sarah needs..."\n` +
    `7. **Use names**: Refer to other participants by name, never "the user"\n` +
    `8. **Accurate attribution**: Only include information actually in the messages\n` +
    `9. **Narrator voice**: You are not a participant. Never write "I" or speak for the agent: write "@dust can add it as a tab", not "I can add it"\n` +
    `10. **No filler openers**: Never start with "You received", "You got", or "Here is". Start with the substance\n\n` +
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
    `## Agent replies (the recipient asked an agent something and left before it answered)\n` +
    `"@analyst explained where to find the summary Google Sheet you couldn't see. The enriched CSV is ready with Net Sales of $723,548.60."\n` +
    `"@dust listed the steps to open the Copilot pane in Excel, with example prompts and a fix if the Copilot button is missing."\n\n` +
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
