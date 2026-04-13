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
 * conversation types. Takes the last version of each message group (for full conversations).
 *
 * Messages are iterated most-recent-first so that when truncateTotalChars is set, the most recent
 * messages are preserved and older ones are dropped. The final output is in chronological order.
 *
 * Each message is rendered as a header line followed by content. Optional parts (timestamps, email,
 * unread markers, truncation indicators) appear only when their corresponding option is enabled.
 *
 *   >> User (Name, email) [timestamp] (unread):
 *   message content
 *
 *   >> Agent (Name) [timestamp] (unread):
 *   message content
 *
 *   >> Content Fragment [timestamp] (unread):
 *   ID: ...
 *   Content-Type: ...
 *   Title: ...
 *   Version: ...
 *   Source URL: ...
 *
 *   >> Compaction [timestamp]:
 *   compaction summary
 *
 * [Deleted message]s render as `[Deleted message]` in place of content.
 */
export function renderConversationAsText(
  conversation: ConversationType | LightConversationType,
  options: RenderConversationAsTextOptions = {}
): string {
  const parts: string[] = [];
  let totalChars = 0;

  // Flatten version groups into an ordered list of messages (last version of each group).
  const allMessages: AnyMessageType[] = isLightConversationType(conversation)
    ? [...conversation.content]
    : conversation.content.reduce<AnyMessageType[]>((acc, versions) => {
        const msg = versions[versions.length - 1];
        if (msg) {
          acc.push(msg);
        }
        return acc;
      }, []);

  const from = options.fromMessageIndex ?? 0;
  const to = options.toMessageIndex ?? allMessages.length;
  const slicedMessages = allMessages.slice(from, to);

  // Iterate most-recent-first so that truncateTotalChars keeps the latest messages.
  for (let i = slicedMessages.length - 1; i >= 0; i--) {
    if (
      options.truncateTotalChars !== undefined &&
      totalChars >= options.truncateTotalChars
    ) {
      break;
    }

    const rendered = renderMessageAsText(
      slicedMessages[i],
      conversation.lastReadMs,
      options
    );
    if (!rendered) {
      continue;
    }

    totalChars += rendered.contentLength;
    parts.unshift(rendered.text);
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
): string | null {
  if (!options.includeTimestamps) {
    return null;
  }
  return `[${new Date(createdMs).toISOString()}]`;
}

function formatUnread(
  createdMs: number,
  lastReadMs: number | null,
  options: RenderConversationAsTextOptions
): string | null {
  if (!options.includeUnread) {
    return null;
  }
  // A message is unread if there is no last-read timestamp or the message was created after it.
  if (lastReadMs === null || createdMs > lastReadMs) {
    return "(unread)";
  }
  return null;
}

function truncateMessageContent(
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
  const email = options.includeEmail
    ? `, ${msg.user?.email ?? "Unknown"}`
    : "";
  const timestamp = formatTimestamp(msg.created, options);
  const unread = formatUnread(msg.created, lastReadMs, options);
  const header =
    `>> User (${userName}${email})` +
    (timestamp ? ` ${timestamp}` : "") +
    (unread ? ` ${unread}` : "") +
    ":";

  if (msg.visibility === "deleted") {
    return {
      text: `${header}\n[Deleted message]\n`,
      contentLength: 0,
    };
  }

  const rawContent = msg.content ?? "";
  const { text: content, truncated } = truncateMessageContent(rawContent, options);
  const truncatedSuffix = truncated ? " (truncated)" : "";

  return {
    text: `${header}${truncatedSuffix}\n${content}\n`,
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
  const header =
    `>> Agent (${agentName})` +
    (timestamp ? ` ${timestamp}` : "") +
    (unread ? ` ${unread}` : "") +
    ":";

  if (msg.visibility === "deleted") {
    return {
      text: `${header}\n[Deleted message]\n`,
      contentLength: 0,
    };
  }

  const rawContent = msg.content ?? "";
  const { text: content, truncated } = truncateMessageContent(rawContent, options);
  const truncatedSuffix = truncated ? " (truncated)" : "";

  const lines: string[] = [];
  lines.push(`${header}${truncatedSuffix}`);

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
  const header =
    ">> Content Fragment" +
    (timestamp ? ` ${timestamp}` : "") +
    (unread ? ` ${unread}` : "") +
    ":";

  return {
    text: `${header}\nID: ${msg.contentFragmentId}\nContent-Type: ${msg.contentType}\nTitle: ${msg.title}\nVersion: ${msg.version}\nSource URL: ${msg.sourceUrl}\n`,
    contentLength: 0,
  };
}

function renderCompactionMessageAsText(
  msg: CompactionMessageType,
  options: RenderConversationAsTextOptions
): RenderedMessage {
  const timestamp = formatTimestamp(msg.created, options);
  const header = ">> Compaction" + (timestamp ? ` ${timestamp}` : "") + ":";
  const content = msg.content ?? "";

  return {
    text: `${header}\n${content}\n`,
    contentLength: content.length,
  };
}
