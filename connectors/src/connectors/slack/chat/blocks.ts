import type { LightAgentConfigurationType } from "@dust-tt/types";
import { truncate } from "@dust-tt/types";

import type { SlackMessageFootnotes } from "@connectors/connectors/slack/chat/citations";
import { makeDustAppUrl } from "@connectors/connectors/slack/chat/utils";

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

export function makeThinkingBlock(thinkingText: string) {
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_${thinkingText}_`,
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
  isComplete: boolean,
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
  if (conversationUrl && isComplete) {
    blocks.push(makeConversationLinkContextBlock(conversationUrl));
  }

  const resultBlocks = blocks.length ? [makeDividerBlock(), ...blocks] : [];

  return resultBlocks;
}

function makeAssistantSelectionBlock(
  agentConfigurations?: LightAgentConfigurationType[]
) {
  return agentConfigurations
    ? [
        {
          type: "actions",
          block_id: "agentConfigId",
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Switch to another assistant",
                emoji: true,
              },
              options: agentConfigurations.map((ac) => {
                return {
                  text: {
                    type: "plain_text",
                    text: ac.name,
                  },
                  value: ac.sId,
                };
              }),
              action_id: "static_agent_config",
            },
          ],
        },
      ]
    : [];
}

export type SlackMessageUpdate =
  | {
      isComplete: false;
      isThinking: true;
      text?: never;
      action?: string;
      footnotes?: never;
      agentConfigurations?: never;
    }
  | {
      isComplete: false;
      isThinking?: never;
      text: string;
      action?: never;
      footnotes: SlackMessageFootnotes;
      agentConfigurations?: never;
    }
  | {
      isComplete: true;
      isThinking?: never;
      text: string;
      action?: never;
      footnotes: SlackMessageFootnotes;
      agentConfigurations?: LightAgentConfigurationType[];
    };

export function makeHeaderBlock(
  conversationUrl: string | null,
  workspaceId: string
) {
  const assistantsUrl = makeDustAppUrl(`/w/${workspaceId}/assistant/new`);
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: conversationUrl
          ? `<${conversationUrl}|Full conversation on Dust> | <${assistantsUrl}|Dust assistants> | <https://dust.tt/home|More about Dust>`
          : `<https://dust.tt/home|More about Dust>`,
      },
    ],
  };
}

export function makeMessageUpdateBlocksAndText(
  conversationUrl: string | null,
  workspaceId: string,
  messageUpdate: SlackMessageUpdate
) {
  const {
    isComplete,
    isThinking,
    text,
    footnotes,
    action,
    agentConfigurations,
  } = messageUpdate;
  const thinkingText = action ? `Thinking... (${action})` : "Thinking...";

  return {
    blocks: [
      makeHeaderBlock(conversationUrl, workspaceId),
      isThinking ? makeThinkingBlock(thinkingText) : makeMarkdownBlock(text),
      ...makeContextSectionBlocks(isComplete, conversationUrl, footnotes),
      ...makeAssistantSelectionBlock(agentConfigurations),
    ],
    // TODO(2024-06-17 flav) We should not return markdown here.
    // Provide plain text for places where the content cannot be rendered (e.g push notifications).
    text: isThinking ? thinkingText : truncate(text, MAX_SLACK_MESSAGE_LENGTH),
    mrkdwn: true,
    unfurl_links: false,
  };
}
