import type { LightAgentConfigurationType } from "@dust-tt/types";
import { truncate } from "@dust-tt/types";

import { STATIC_AGENT_CONFIG } from "@connectors/api/webhooks/webhook_slack_interaction";
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

export const DUST_URL = "https://dust.tt/home";
export const SLACK_HELP_URL = "https://docs.dust.tt/docs/slack";

function makeDividerBlock() {
  return {
    type: "divider",
  };
}

function makeMarkdownBlock(text?: string) {
  return text
    ? [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: truncate(text, MAX_SLACK_MESSAGE_LENGTH),
          },
        },
      ]
    : [];
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
  footnotes: SlackMessageFootnotes | undefined,
  workspaceId: string
) {
  const blocks = [];

  if (footnotes && footnotes.length > 0) {
    const footnotesBlock = makeFootnotesBlock(footnotes);
    if (footnotesBlock) {
      blocks.push(footnotesBlock);
    }
  }

  blocks.push(makeFooterBlock(conversationUrl, workspaceId));

  const resultBlocks = blocks.length ? [makeDividerBlock(), ...blocks] : [];

  return resultBlocks;
}

function makeAssistantSelectionBlock(
  assistantName: string,
  agentConfigurations: LightAgentConfigurationType[],
  isThinking: boolean,
  thinkingText: string
) {
  return assistantName
    ? [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: isThinking
              ? `@${assistantName}: _${thinkingText}_`
              : `@${assistantName}`,
          },
          accessory:
            agentConfigurations && agentConfigurations.length > 0
              ? {
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
                  action_id: STATIC_AGENT_CONFIG,
                }
              : undefined,
        },
      ]
    : [];
}

export type SlackMessageUpdate = {
  isComplete: boolean;
  isThinking?: boolean;
  thinkingAction?: string;
  assistantName: string;
  agentConfigurations: LightAgentConfigurationType[];
  text?: string;
  footnotes?: SlackMessageFootnotes;
};

export function makeFooterBlock(
  conversationUrl: string | null,
  workspaceId: string
) {
  const assistantsUrl = makeDustAppUrl(`/w/${workspaceId}/assistant/new`);
  const baseHeader = `<${assistantsUrl}|Browse assistants> | <${SLACK_HELP_URL}|Use Dust in Slack> | <${DUST_URL}|Learn more>`;
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: conversationUrl
          ? `<${conversationUrl}|Go to full conversation> | ${baseHeader}`
          : baseHeader,
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
    thinkingAction,
    assistantName,
    agentConfigurations,
    text,
    footnotes,
  } = messageUpdate;
  const thinkingText = "is thinking...";
  const thinkingTextWithAction = thinkingAction
    ? `${thinkingText}... (${thinkingAction})`
    : thinkingText;

  return {
    blocks: [
      ...makeAssistantSelectionBlock(
        assistantName,
        agentConfigurations,
        isThinking ?? false,
        thinkingTextWithAction
      ),
      ...makeMarkdownBlock(text),
      ...makeContextSectionBlocks(
        isComplete,
        conversationUrl,
        footnotes,
        workspaceId
      ),
    ],
    // TODO(2024-06-17 flav) We should not return markdown here.
    // Provide plain text for places where the content cannot be rendered (e.g push notifications).
    text: isThinking
      ? thinkingText
      : text && truncate(text, MAX_SLACK_MESSAGE_LENGTH),
    mrkdwn: true,
    unfurl_links: false,
  };
}

export function makeErrorBlock(
  conversationUrl: string | null,
  workspaceId: string,
  errorMessage: string
) {
  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "plain_text",
          text: errorMessage,
        },
      },
      makeDividerBlock(),
      makeFooterBlock(conversationUrl, workspaceId),
    ],
    mrkdwn: true,
    unfurl_links: false,
    text: errorMessage,
  };
}
