import { truncate } from "@app/types/shared/utils/string_utils";
import type { KnownBlock } from "@slack/web-api";
import { Marked } from "marked";
import slackifyMarkdown from "slackify-markdown";

/*
 * This length threshold prevents the "msg_too_long" error from Slack's
 * chat.update method. Per past incidents, the max message length is 3000
 * characters; we stay conservative to leave room for ellipses.
 */
export const MAX_SLACK_MESSAGE_LENGTH = 2500;

// source: https://docs.slack.dev/reference/block-kit/blocks/markdown-block/
const MAX_SLACK_MARKDOWN_BLOCK_LENGTH = 12_000;

// Mirrors connectors/src/connectors/slack/chat/blocks.ts::makeMarkdownBlock.
// The newer `markdown` block renders tables, headers, lists. File uploads
// cannot carry blocks and send plain mrkdwn text instead.
function makeMarkdownBlocks(text?: string, isUpload?: boolean): KnownBlock[] {
  if (!text) {
    return [];
  }
  // New markdown block has better support for markdown formatting,
  // but is not supported when uploading files.
  if (!isUpload) {
    return [
      {
        type: "markdown",
        text: truncate(text, MAX_SLACK_MARKDOWN_BLOCK_LENGTH),
      },
    ];
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(slackifyMarkdown(text), MAX_SLACK_MESSAGE_LENGTH),
      },
    },
  ];
}

// "Sent via <agent> on Dust" attribution as legacy Slack mrkdwn (link uses
// `<url|label>`). Single source of truth for the footer text, shared by the
// context block below and every plain mrkdwn message.
export function makeSentByFooterText(
  agentName: string,
  agentUrl: string
): string {
  return `_Sent via <${agentUrl}|${agentName} Agent> on Dust_`;
}

// The footer as a standalone context block — kept separate from the message
// block (like the connector's makeFooterBlock) so it is never absorbed into a
// markdown table.
function makeSentByFooterBlock(
  agentName: string,
  agentUrl: string
): KnownBlock {
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: makeSentByFooterText(agentName, agentUrl),
      },
    ],
  };
}

// Dedicated instance so options set on the shared global parser elsewhere
// cannot change how tables are detected.
const markdownParser = new Marked();

function hasMarkdownTable(text: string): boolean {
  let found = false;
  markdownParser.walkTokens(markdownParser.lexer(text), (token) => {
    if (token.type === "table") {
      found = true;
    }
  });
  return found;
}

// Messages carrying blocks lose the Edit option in the Slack client, so blocks
// are reserved for tables, the one thing legacy mrkdwn cannot render.
/**
 * @cc [owner:avervaet,label:product] blocks-only-for-tables
 * When `message` contains no markdown table, the payload MUST have no blocks and its `text` MUST
 * be the slackified message, untruncated, followed by the footer text when `footer` is set. When
 * it contains a table, the payload MUST carry `message` as a `markdown` block, followed by the
 * footer as a separate context block when `footer` is set.
 */
export function makeMessagePayload(
  message: string,
  footer: { agentName: string; agentUrl: string } | undefined
): { text: string; blocks?: KnownBlock[] } {
  if (!hasMarkdownTable(message)) {
    const text = slackifyMarkdown(message);
    return {
      text: footer
        ? `${text}\n${makeSentByFooterText(footer.agentName, footer.agentUrl)}`
        : text,
    };
  }

  return {
    // Plain fallback for places that cannot render blocks, such as push
    // notifications.
    text: truncate(message, MAX_SLACK_MESSAGE_LENGTH),
    blocks: [
      ...makeMarkdownBlocks(message, false),
      ...(footer
        ? [makeSentByFooterBlock(footer.agentName, footer.agentUrl)]
        : []),
    ],
  };
}
