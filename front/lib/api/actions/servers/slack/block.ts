import { truncate } from "@app/types/shared/utils/string_utils";
import type { KnownBlock } from "@slack/web-api";
import slackifyMarkdown from "slackify-markdown";

/*
 * This length threshold prevents the "msg_too_long" error from Slack's
 * chat.update method. Per past incidents, the max message length is 3000
 * characters; we stay conservative to leave room for ellipses.
 */
const MAX_SLACK_MESSAGE_LENGTH = 2500;

// Mirrors connectors/src/connectors/slack/chat/blocks.ts::makeMarkdownBlock.
// The newer `markdown` block renders tables, headers, lists, but is
// not supported alongside file uploads — those fall back to a legacy mrkdwn
// section built from slackify-markdown.
export function makeMarkdownBlock(
  text?: string,
  isUpload?: boolean
): KnownBlock[] {
  if (!text) {
    return [];
  }
  // New markdown block has better support for markdown formatting,
  // but is not supported when uploading files.
  if (!isUpload) {
    return [
      {
        type: "markdown",
        text: truncate(text, MAX_SLACK_MESSAGE_LENGTH),
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

// "Sent via <agent> on Dust" attribution as a standalone context block (mrkdwn,
// so the link uses `<url|label>`). Kept separate from the message block — like
// the connector's makeFooterBlock — so it is never absorbed into a markdown
// table.
export function makeSentByFooterBlock(
  agentName: string,
  agentUrl: string
): KnownBlock {
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Sent via <${agentUrl}|${agentName} Agent> on Dust`,
      },
    ],
  };
}
