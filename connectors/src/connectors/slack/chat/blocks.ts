import { truncate } from "@dust-tt/types";

import type { SlackMessageFootnotes } from "@connectors/connectors/slack/chat/citations";

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

function makeFootnotesBlock(footnotes: SlackMessageFootnotes) {
  const elements = footnotes.map((f) => ({
    type: "mrkdwn",
    text: `<${f.link}|[${f.index}] ${truncate(f.text, 20)}>`,
  }));

  if (elements.length === 0) {
    return undefined;
  }

  return {
    type: "context",
    elements,
  };
}

function makeContextSectionBlocks(
  conversationUrl: string | null,
  footnotes: SlackMessageFootnotes | undefined
) {
  const blocks = [];

  if (footnotes && footnotes.length > 0) {
    const footnotesBlock = makeFootnotesBlock(footnotes);
    if (footnotesBlock) {
      blocks.push(footnotesBlock);
    }
  }

  // Bundle the conversation url in the context.
  if (conversationUrl) {
    blocks.push(makeConversationLinkContextBlock(conversationUrl));
  }

  return blocks.length ? [makeDividerBlock(), ...blocks] : [];
}

export type SlackMessageUpdate =
  | { isThinking: true; text?: never; footnotes?: never }
  | { isThinking?: never; text: string; footnotes: SlackMessageFootnotes };

export function makeMessageUpdateBlocksAndText(
  conversationUrl: string | null,
  messageUpdate: SlackMessageUpdate
) {
  const { isThinking, text, footnotes } = messageUpdate;

  return {
    blocks: [
      isThinking ? makeThinkingBlock() : makeMarkdownBlock(text),
      ...makeContextSectionBlocks(conversationUrl, footnotes),
    ],
    // TODO(2024-06-17 flav) We should not return markdown here.
    // Provide plain text for places where the content cannot be rendered (e.g push notifications).
    text: isThinking ? "Thinking..." : text,
    mrkdwn: true,
  };
}
