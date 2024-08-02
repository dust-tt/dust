import { truncate } from "@dust-tt/types";

import type { SlackMessageFootnotes } from "@connectors/connectors/slack/chat/citations";

/*
 * This length threshold is set to prevent the "msg_too_long" error
 * from the Slack API's chat.update method.
 * According to previous incidents, the maximum length for a message is 3000 characters.
 * We adopt a conservative approach by setting a lower threshold
 * to accommodate ellipses and ensure buffer space.
 */
export const MAX_SLACK_MESSAGE_LENGTH = 2950;

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
      text: truncate(text, MAX_SLACK_MESSAGE_LENGTH),
    },
  };
}

function makeFootnotesBlock(footnotes: SlackMessageFootnotes) {
  // We are limited to 10 blocks when posting a message on Slack,
  // so we are posting 5 footnotes at most to leave rooms for other blocks (e.g. conversation link, divier, ...).
  const elements = footnotes.slice(0, 5).map((f) => ({
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

  const resultBlocks = blocks.length ? [makeDividerBlock(), ...blocks] : [];

  return resultBlocks;
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
    text: isThinking ? "Thinking..." : truncate(text, MAX_SLACK_MESSAGE_LENGTH),
    mrkdwn: true,
  };
}
