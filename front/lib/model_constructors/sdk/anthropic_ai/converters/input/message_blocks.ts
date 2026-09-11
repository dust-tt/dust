import type {
  ContentBlockParam,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// Shared helpers for the replay sanitizers that strip provider server-tool
// blocks (tool search, native web search) from a rendered conversation.

export function toContentBlocks(
  content: MessageParam["content"]
): ContentBlockParam[] {
  return typeof content === "string"
    ? [{ type: "text", text: content }]
    : content;
}

// Anthropic rejects consecutive same-role messages, so re-merge neighbors after a message was
// dropped entirely. O(n) in messages. Merging a run of same-role messages re-copies the merged
// content at each step, but the input arrives with no same-role neighbors (the renderers already
// merged them), so runs only form around dropped messages and stay short.
export function mergeConsecutiveSameRoleMessages(
  messages: MessageParam[]
): MessageParam[] {
  const merged: MessageParam[] = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      merged[merged.length - 1] = {
        ...previous,
        content: [
          ...toContentBlocks(previous.content),
          ...toContentBlocks(message.content),
        ],
      };
    } else {
      merged.push(message);
    }
  }

  return merged;
}
