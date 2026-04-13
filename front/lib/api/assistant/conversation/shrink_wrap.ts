import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  type AgentMessageFeedback,
  renderConversationAsText,
} from "@app/lib/api/assistant/conversation/render_as_text";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

// Build the output messages, truncating content per message.
const MAX_CONTENT_CHARS_PER_MESSAGE = 2_000;
const MAX_TOTAL_CONTENT_CHARS = 20_000;
export const MAX_ACTION_DETAIL_CHARS = 500;

/**
 * Minimal types for the shrink-wrap conversation formatter.
 * These capture only the fields used during formatting, making it easy
 * to construct test data without building full message objects.
 */
export interface ShrinkWrapUserMessage {
  type: "user_message";
  sId: string;
  created: number;
  content: string;
  context: { username: string };
  mentions: Array<{ configurationId: string } | Record<string, unknown>>;
}

export interface ShrinkWrapAction {
  functionCallName: string;
  status: string;
  internalMCPServerName: string | null;
  params: Record<string, unknown>;
  output?: string | null;
}

export interface ShrinkWrapAgentMessage {
  type: "agent_message";
  sId: string;
  created: number;
  content: string | null;
  status: string;
  configuration: { sId: string; name: string };
  actions: ShrinkWrapAction[];
  parentAgentMessageId: string | null;
}

export type ShrinkWrapMessage = ShrinkWrapUserMessage | ShrinkWrapAgentMessage;

export interface ShrinkWrapConversationData {
  sId: string;
  title: string | null;
  messages: ShrinkWrapMessage[];
}

/**
 * Serialize MCP tool output (array of content blocks) into a plain text string.
 * Extracts text from "text" content blocks; non-text blocks are ignored.
 */
function serializeActionOutput(
  output: Array<{ type: string; text?: string }> | null
): string | null {
  if (!output) {
    return null;
  }
  const texts = output
    .filter((block) => block.type === "text" && isString(block.text))
    .map((block) => block.text);
  return texts.length > 0 ? texts.join("\n") : null;
}

function truncateContent(content: string | null): {
  content: string | null;
  contentTruncated: boolean;
} {
  if (!content || content.length <= MAX_CONTENT_CHARS_PER_MESSAGE) {
    return { content, contentTruncated: false };
  }
  return {
    content: content.slice(0, MAX_CONTENT_CHARS_PER_MESSAGE),
    contentTruncated: true,
  };
}

/**
 * Pure formatting function that renders a conversation as text for shrink-wrap.
 * Separated from the DB-fetching logic so it can be reused in tests.
 */
export interface ShrinkWrapFeedback {
  thumbDirection: AgentMessageFeedbackDirection;
  content: string | null;
}

export function formatConversationForShrinkWrap(
  conversation: ShrinkWrapConversationData,
  options?: {
    fromMessageIndex?: number;
    toMessageIndex?: number;
    feedbackByMessageId?: Map<string, ShrinkWrapFeedback[]>;
    /** When true, include tool input (params) and output for each action. */
    includeActionDetails?: boolean;
  }
): string {
  const messages = conversation.messages;
  const from = options?.fromMessageIndex ?? 0;
  const to = options?.toMessageIndex ?? messages.length;
  const isConversationTruncated = from > 0 || to < messages.length;
  const slicedMessages = messages.slice(from, to);

  // Build a map of agent message sId → list of agents it handed off to.
  const handoffMap = new Map<string, { agentId: string }[]>();
  for (const msg of messages) {
    if (msg.type === "agent_message" && msg.parentAgentMessageId) {
      const targets = handoffMap.get(msg.parentAgentMessageId) ?? [];
      targets.push({ agentId: msg.configuration.sId });
      handoffMap.set(msg.parentAgentMessageId, targets);
    }
  }

  let currentTotalChars = 0;
  const lines: string[] = [];

  lines.push(`# ${conversation.sId}: ${conversation.title ?? "Untitled"}`);
  if (isConversationTruncated) {
    lines.push(`_(conversation truncated)_`);
  }
  lines.push("");

  for (let i = 0; i < slicedMessages.length; i++) {
    if (currentTotalChars >= MAX_TOTAL_CONTENT_CHARS) {
      break;
    }

    const msg = slicedMessages[i];
    const index = from + i;

    if (msg.type === "user_message") {
      const { content, contentTruncated } = truncateContent(msg.content);
      currentTotalChars += content ? content.length : 0;

      lines.push(`## Message ${index}: ${msg.sId}`);
      lines.push(`at ${msg.created}`);
      lines.push(`from user ${msg.context.username}`);
      const agentMentions = msg.mentions.filter(
        (m): m is { configurationId: string } =>
          "configurationId" in m && typeof m.configurationId === "string"
      );
      if (agentMentions.length > 0) {
        lines.push(
          `mentions: ${agentMentions.map((m) => m.configurationId).join(", ")}`
        );
      }
      lines.push("");
      lines.push(`### Content${contentTruncated ? " (truncated)" : ""}`);
      lines.push(content ?? "_empty_");
      lines.push("");
      continue;
    }

    // Agent message.
    const agentMsg = msg;
    const { content, contentTruncated } = truncateContent(agentMsg.content);
    currentTotalChars += content ? content.length : 0;

    const status = agentMsg.status === "succeeded" ? "succeeded" : "failed";

    lines.push(`## Message ${index}: ${agentMsg.sId}`);
    lines.push(`at ${agentMsg.created}`);
    lines.push(
      `from agent ${agentMsg.configuration.sId} (${agentMsg.configuration.name}) - ${status}`
    );
    lines.push("");

    // Actions.
    if (agentMsg.actions.length > 0) {
      lines.push("### Actions");
      for (const action of agentMsg.actions) {
        const actionStatus =
          action.status === "succeeded" ? "success" : "error";
        let actionLine = `- ${action.functionCallName} (${actionStatus})`;
        if (action.internalMCPServerName === "run_agent") {
          const childConvId = action.params.conversationId;
          if (isString(childConvId)) {
            actionLine += ` → child conversation: ${childConvId}`;
          }
        }
        lines.push(actionLine);

        if (options?.includeActionDetails) {
          const paramsStr = JSON.stringify(action.params);
          const truncatedParams =
            paramsStr.length > MAX_ACTION_DETAIL_CHARS
              ? paramsStr.slice(0, MAX_ACTION_DETAIL_CHARS) + "…"
              : paramsStr;
          lines.push(`  Input: ${truncatedParams}`);

          if (action.output) {
            const truncatedOutput =
              action.output.length > MAX_ACTION_DETAIL_CHARS
                ? action.output.slice(0, MAX_ACTION_DETAIL_CHARS) + "…"
                : action.output;
            lines.push(`  Output: ${truncatedOutput}`);
          }
        }
      }
      lines.push("");
    }

    // Handoffs.
    const handoffs = handoffMap.get(agentMsg.sId) ?? [];
    if (handoffs.length > 0) {
      lines.push(`Handed off to: ${handoffs.map((h) => h.agentId).join(", ")}`);
      lines.push("");
    }

    lines.push(`### Content${contentTruncated ? " (truncated)" : ""}`);
    lines.push(content ?? "_empty_");
    lines.push("");

    // Feedback on agent messages.
    const feedbacks = options?.feedbackByMessageId?.get(agentMsg.sId);
    if (feedbacks && feedbacks.length > 0) {
      lines.push("### User feedback");
      for (const f of feedbacks) {
        const direction = f.thumbDirection === "up" ? "👍" : "👎";
        const comment = f.content ? `: ${f.content}` : "";
        lines.push(`- ${direction}${comment}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function getShrinkWrappedConversation(
  auth: Authenticator,
  {
    conversationId,
    fromMessageIndex,
    toMessageIndex,
    includeFeedback,
    includeActionDetails,
  }: {
    conversationId: string;
    fromMessageIndex?: number;
    toMessageIndex?: number;
    includeFeedback?: boolean;
    /** When true, include tool input (params) and output for each action. */
    includeActionDetails?: boolean;
  }
): Promise<
  Result<
    {
      type: "text";
      text: string;
    },
    Error
  >
> {
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err(
      new Error(`Conversation not found or not accessible: ${conversationId}`)
    );
  }

  const conversation = conversationRes.value;

  // Optionally fetch feedback and build a map of message sId → feedbacks.
  let feedbackByMessageSId: Map<string, AgentMessageFeedback[]> | undefined;
  if (includeFeedback) {
    const feedbacks =
      await AgentMessageFeedbackResource.listByConversationModelId(
        auth,
        conversation.id
      );

    if (feedbacks.length > 0) {
      // Build agentMessageId (ModelId) → message sId map from the conversation.
      const agentMessageIdToSId = new Map<number, string>();
      for (const messageVersions of conversation.content) {
        if (messageVersions.length === 0) {
          continue;
        }
        const lastVersion = messageVersions[messageVersions.length - 1];
        if (isAgentMessageType(lastVersion)) {
          agentMessageIdToSId.set(lastVersion.agentMessageId, lastVersion.sId);
        }
      }

      feedbackByMessageSId = new Map();
      for (const f of feedbacks) {
        const messageId = agentMessageIdToSId.get(f.agentMessageId);
        if (messageId) {
          const list = feedbackByMessageSId.get(messageId) ?? [];
          list.push({
            thumbDirection: f.thumbDirection,
            content: f.content,
          });
          feedbackByMessageSId.set(messageId, list);
        }
      }
    }
  }

  const text = renderConversationAsText(conversation, {
    includeTimestamps: true,
    includeActions: true,
    includeActionDetails,
    includeFeedback: !!feedbackByMessageSId,
    feedbackByMessageSId,
    truncateMessageChars: MAX_CONTENT_CHARS_PER_MESSAGE,
    truncateTotalChars: MAX_TOTAL_CONTENT_CHARS,
    fromMessageIndex,
    toMessageIndex,
  });

  return new Ok({
    type: "text" as const,
    text,
  });
}
