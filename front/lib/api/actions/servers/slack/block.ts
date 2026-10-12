import { truncate } from "@app/types/shared/utils/string_utils";
import type { KnownBlock } from "@slack/web-api";
import { Marked } from "marked";
import slackifyMarkdown from "slackify-markdown";

// source: https://docs.slack.dev/reference/block-kit/blocks/markdown-block/
const MAX_SLACK_MARKDOWN_BLOCK_LENGTH = 12_000;

// Dedicated instance so options set on the shared global parser elsewhere
// cannot change how tables are detected.
const markdownParser = new Marked();

export type SentByFooter = { agentName: string; agentUrl: string };

// "Sent via <agent> on Dust" attribution as legacy Slack mrkdwn (link uses
// `<url|label>`). Single source of truth for the footer text, shared by the
// context block below and every plain mrkdwn message.
function makeSentByFooterText(agentName: string, agentUrl: string): string {
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

function hasMarkdownTable(text: string): boolean {
  let found = false;
  markdownParser.walkTokens(markdownParser.lexer(text), (token) => {
    if (token.type === "table") {
      found = true;
    }
  });
  return found;
}

/**
 * @cc [owner:avervaet,label:product] untruncated-mrkdwn-text
 * The result MUST be the slackified `message`, untruncated, followed by the footer text on a new
 * line when `footerData` is set.
 */
export function makeMrkdwnText(
  message: string,
  footerData: SentByFooter | undefined
): string {
  const text = slackifyMarkdown(message);
  return footerData
    ? `${text}\n${makeSentByFooterText(footerData.agentName, footerData.agentUrl)}`
    : text;
}

export function makeMessagePayload(
  message: string,
  footerData: SentByFooter | undefined
): { text: string; blocks?: KnownBlock[] } {
  if (!hasMarkdownTable(message)) {
    return { text: makeMrkdwnText(message, footerData) };
  }

  return {
    // Plain fallback for places that cannot render blocks
    text: truncate(message, MAX_SLACK_MARKDOWN_BLOCK_LENGTH),
    blocks: [
      {
        type: "markdown",
        text: truncate(message, MAX_SLACK_MARKDOWN_BLOCK_LENGTH),
      },
      ...(footerData
        ? [makeSentByFooterBlock(footerData.agentName, footerData.agentUrl)]
        : []),
    ],
  };
}
