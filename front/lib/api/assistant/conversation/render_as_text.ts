import type {
  AgentMessageType,
  CompactionMessageType,
  ConversationType,
  LightAgentMessageType,
  LightConversationType,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import { isLightConversationType } from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { assertNever } from "@app/types/shared/utils/assert_never";

type AnyMessageType =
  | UserMessageType
  | AgentMessageType
  | ContentFragmentType
  | LightAgentMessageType
  | CompactionMessageType
  | UserMessageTypeWithContentFragments;

export interface AgentMessageFeedback {
  thumbDirection: "up" | "down";
  content: string | null;
}

export interface RenderConversationAsTextOptions {
  // Include ISO timestamps on each message header line.
  includeTimestamps?: boolean;
  // Include user email in user message headers.
  includeEmail?: boolean;
  // Include (unread) marker on messages created after lastReadMs.
  includeUnread?: boolean;
  // Include agent actions summary after agent message header.
  includeActions?: boolean;
  // Include action input params and output (requires includeActions).
  includeActionDetails?: boolean;
  // Include user feedback on agent messages.
  includeFeedback?: boolean;
  // Pre-fetched feedback keyed by agent message sId. Required when includeFeedback is true.
  feedbackByMessageSId?: Map<string, AgentMessageFeedback[]>;
  // Truncate each message's content to this many characters.
  truncateMessageChars?: number;
  // Stop rendering once total content characters reach this limit.
  truncateTotalChars?: number;
  // Render only messages in the [fromMessageIndex, toMessageIndex) range (0-based, on the
  // flattened message list).
  fromMessageIndex?: number;
  toMessageIndex?: number;
}

/**
 * Render a conversation's messages as a plain text string. Supports both full and light
 * conversation types. Takes the last version of each message group (for full conversations) and
 * iterates messages in order.
 *
 * The output format is:
 *   >> User (Name) [2024-01-01T00:00:00.000Z]:
 *   message content
 *
 *   >> Agent (Name) [2024-01-01T00:00:00.000Z]:
 *   message content
 */
export function renderConversationAsText(
  conversation: ConversationType | LightConversationType,
  options: RenderConversationAsTextOptions = {}
): string {
  const parts: string[] = [];
  let totalChars = 0;

  const allMessages = flattenConversationMessages(conversation);
  const from = options.fromMessageIndex ?? 0;
  const to = options.toMessageIndex ?? allMessages.length;
  const slicedMessages = allMessages.slice(from, to);

  for (const msg of slicedMessages) {
    if (
      options.truncateTotalChars !== undefined &&
      totalChars >= options.truncateTotalChars
    ) {
      break;
    }

    const rendered = renderMessageAsText(msg, conversation.lastReadMs, options);
    if (!rendered) {
      continue;
    }

    totalChars += rendered.contentLength;
    parts.push(rendered.text);

    // Append feedback after agent messages if requested.
    if (
      options.includeFeedback &&
      options.feedbackByMessageSId &&
      msg.type === "agent_message"
    ) {
      const feedbacks = options.feedbackByMessageSId.get(msg.sId);
      if (feedbacks && feedbacks.length > 0) {
        const feedbackLines: string[] = ["Feedback:"];
        for (const f of feedbacks) {
          const direction = f.thumbDirection === "up" ? "+1" : "-1";
          const comment = f.content ? `: ${f.content}` : "";
          feedbackLines.push(`- ${direction}${comment}`);
        }
        feedbackLines.push("");
        parts.push(feedbackLines.join("\n"));
      }
    }
  }

  return parts.join("\n");
}

/**
 * Count the number of messages in a conversation (last version of each group).
 */
export function countConversationMessages(
  conversation: ConversationType | LightConversationType
): number {
  if (isLightConversationType(conversation)) {
    return conversation.content.length;
  }
  return conversation.content.filter((versions) => versions.length > 0).length;
}

/**
 * Flatten a conversation's version-grouped content into an ordered list of messages, taking the
 * last version of each group.
 */
function flattenConversationMessages(
  conversation: ConversationType | LightConversationType
): AnyMessageType[] {
  if (isLightConversationType(conversation)) {
    return [...conversation.content];
  }

  const result: AnyMessageType[] = [];
  for (const versions of conversation.content) {
    const msg = versions[versions.length - 1];
    if (msg) {
      result.push(msg);
    }
  }
  return result;
}

interface RenderedMessage {
  text: string;
  contentLength: number;
}

function renderMessageAsText(
  msg: AnyMessageType,
  lastReadMs: number | null,
  options: RenderConversationAsTextOptions
): RenderedMessage | null {
  switch (msg.type) {
    case "user_message":
      return renderUserMessageAsText(msg, lastReadMs, options);
    case "agent_message":
      return renderAgentMessageAsText(msg, lastReadMs, options);
    case "content_fragment":
      return renderContentFragmentAsText(msg, lastReadMs, options);
    case "compaction_message":
      return renderCompactionMessageAsText(msg, options);
    default:
      assertNever(msg);
  }
}

function formatTimestamp(
  createdMs: number,
  options: RenderConversationAsTextOptions
): string {
  if (!options.includeTimestamps) {
    return "";
  }
  return ` [${new Date(createdMs).toISOString()}]`;
}

function formatUnread(
  createdMs: number,
  lastReadMs: number | null,
  options: RenderConversationAsTextOptions
): string {
  if (!options.includeUnread || lastReadMs === null) {
    return "";
  }
  return createdMs > lastReadMs ? " (unread)" : "";
}

function truncateContent(
  content: string,
  options: RenderConversationAsTextOptions
): { text: string; truncated: boolean } {
  if (
    options.truncateMessageChars === undefined ||
    content.length <= options.truncateMessageChars
  ) {
    return { text: content, truncated: false };
  }
  return {
    text: content.slice(0, options.truncateMessageChars),
    truncated: true,
  };
}

function renderUserMessageAsText(
  msg: UserMessageType | UserMessageTypeWithContentFragments,
  lastReadMs: number | null,
  options: RenderConversationAsTextOptions
): RenderedMessage {
  const userName = msg.user?.fullName ?? msg.user?.username ?? "User";
  const email =
    options.includeEmail && "email" in msg.user! ? `, ${msg.user!.email}` : "";
  const timestamp = formatTimestamp(msg.created, options);
  const unread = formatUnread(msg.created, lastReadMs, options);

  if (msg.visibility === "deleted") {
    return {
      text: `>> User (${userName}${email})${timestamp}${unread}:\n[Deleted message]\n`,
      contentLength: 0,
    };
  }

  const rawContent = msg.content ?? "";
  const { text: content, truncated } = truncateContent(rawContent, options);
  const truncatedMarker = truncated ? " (truncated)" : "";

  return {
    text: `>> User (${userName}${email})${timestamp}${unread}:${truncatedMarker}\n${content}\n`,
    contentLength: content.length,
  };
}

function renderAgentMessageAsText(
  msg: AgentMessageType | LightAgentMessageType,
  lastReadMs: number | null,
  options: RenderConversationAsTextOptions
): RenderedMessage {
  const agentName = msg.configuration?.name ?? "Agent";
  const timestamp = formatTimestamp(msg.created, options);
  const unread = formatUnread(msg.created, lastReadMs, options);

  if (msg.visibility === "deleted") {
    return {
      text: `>> Agent (${agentName})${timestamp}${unread}:\n[Deleted message]\n`,
      contentLength: 0,
    };
  }

  const rawContent = msg.content ?? "";
  const { text: content, truncated } = truncateContent(rawContent, options);
  const truncatedMarker = truncated ? " (truncated)" : "";

  const lines: string[] = [];
  lines.push(`>> Agent (${agentName})${timestamp}${unread}:${truncatedMarker}`);

  // Render actions if requested and available on full AgentMessageType.
  if (options.includeActions && "actions" in msg && msg.actions.length > 0) {
    lines.push("Actions:");
    for (const action of msg.actions) {
      const actionStatus = action.status === "succeeded" ? "success" : "error";
      lines.push(`- ${action.functionCallName} (${actionStatus})`);

      if (options.includeActionDetails) {
        const paramsStr = JSON.stringify(action.params);
        lines.push(`  Input: ${paramsStr}`);
        if (action.output) {
          const outputText = serializeActionOutput(action.output);
          if (outputText) {
            lines.push(`  Output: ${outputText}`);
          }
        }
      }
    }
  }

  lines.push(content);
  lines.push("");

  return {
    text: lines.join("\n"),
    contentLength: content.length,
  };
}

/**
 * Serialize MCP tool output (array of content blocks) into a plain text string.
 */
function serializeActionOutput(
  output: Array<{ type: string; text?: string }> | null
): string | null {
  if (!output) {
    return null;
  }
  const texts = output
    .filter(
      (block): block is { type: string; text: string } =>
        block.type === "text" && typeof block.text === "string"
    )
    .map((block) => block.text);
  return texts.length > 0 ? texts.join("\n") : null;
}

function renderContentFragmentAsText(
  msg: ContentFragmentType,
  lastReadMs: number | null,
  options: RenderConversationAsTextOptions
): RenderedMessage {
  const timestamp = formatTimestamp(msg.created, options);
  const unread = formatUnread(msg.created, lastReadMs, options);

  return {
    text: `>> Content Fragment${timestamp}${unread}:\nTitle: ${msg.title}\nContent-Type: ${msg.contentType}\n`,
    contentLength: 0,
  };
}

function renderCompactionMessageAsText(
  msg: CompactionMessageType,
  options: RenderConversationAsTextOptions
): RenderedMessage {
  const timestamp = formatTimestamp(msg.created, options);
  const content = msg.content ?? "";

  return {
    text: `>> Compaction${timestamp}:\n${content}\n`,
    contentLength: content.length,
  };
}
