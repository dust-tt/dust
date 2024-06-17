function makeConversationLinkContextBlock(conversationUrl: string) {
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<${conversationUrl}|Continue conversation on Dust>`,
      },
    ],
  };
}

export function makeThinkingBlock() {
  return {
    type: "context",
    elements: [
      {
        type: "plain_text",
        text: "Thinking...",
      },
    ],
  };
}

function makeDividerBlock() {
  return {
    type: "divider",
  };
}

function makeMarkdownBlock(text: string) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text,
    },
  };
}

export type SlackMessageUpdate =
  | { isThinking: true; text?: never }
  | { isThinking?: never; text: string };

export function makeMessageUpdateBlocksAndText(
  conversationUrl: string | null,
  messageUpdate: SlackMessageUpdate
) {
  const { isThinking, text } = messageUpdate;
  const conversationUrlBlocks = conversationUrl
    ? [makeDividerBlock(), makeConversationLinkContextBlock(conversationUrl)]
    : [];

  return {
    blocks: [
      isThinking ? makeThinkingBlock() : makeMarkdownBlock(text),
      // Bundle the conversation url in the context.
      ...conversationUrlBlocks,
    ],
    // TODO(2024-06-17 flav) We should not return markdown here.
    // Provide plain text for places where the content cannot be rendered (e.g push notifications).
    text: isThinking ? "Thinking..." : text,
    mrkdwn: true,
  };
}
