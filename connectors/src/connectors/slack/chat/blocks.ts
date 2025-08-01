import type { LightAgentConfigurationType } from "@dust-tt/client";

import type { RequestToolPermissionActionValueParsed } from "@connectors/api/webhooks/webhook_slack_interaction";
import {
  APPROVE_TOOL_EXECUTION,
  REJECT_TOOL_EXECUTION,
  STATIC_AGENT_CONFIG,
} from "@connectors/api/webhooks/webhook_slack_interaction";
import type { SlackMessageFootnotes } from "@connectors/connectors/slack/chat/citations";
import { makeDustAppUrl } from "@connectors/connectors/slack/chat/utils";
import { truncate } from "@connectors/types";

/*
 * This length threshold is set to prevent the "msg_too_long" error
 * from the Slack API's chat.update method.
 * According to previous incidents, the maximum length for a message is 3000 characters.
 * We adopt a conservative approach by setting a lower threshold
 * to accommodate ellipses and ensure buffer space.
 */
export const MAX_SLACK_MESSAGE_LENGTH = 2500;

export const DUST_URL = "https://dust.tt/home";
export const SLACK_HELP_URL = "https://docs.dust.tt/docs/slack";

function makeDividerBlock() {
  return {
    type: "divider",
  };
}

export function makeMarkdownBlock(text?: string) {
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

function makeContextSectionBlocks({
  assistantName,
  conversationUrl,
  footnotes,
  workspaceId,
}: {
  assistantName: string;
  conversationUrl: string | null;
  footnotes: SlackMessageFootnotes | undefined;
  workspaceId: string;
}) {
  const blocks = [];

  if (footnotes && footnotes.length > 0) {
    const footnotesBlock = makeFootnotesBlock(footnotes);
    if (footnotesBlock) {
      blocks.push(footnotesBlock);
    }
  }

  blocks.push(
    makeFooterBlock({
      assistantName,
      conversationUrl,
      workspaceId,
    })
  );

  const resultBlocks = blocks.length ? [makeDividerBlock(), ...blocks] : [];

  return resultBlocks;
}

function makeThinkingBlock({
  isThinking,
  thinkingText,
}: {
  isThinking: boolean;
  thinkingText: string;
}) {
  return isThinking
    ? [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `_${thinkingText}_`,
          },
        },
      ]
    : [];
}

export function makeAssistantSelectionBlock(
  agentConfigurations: LightAgentConfigurationType[],
  id: string
) {
  return [
    {
      type: "actions",
      block_id: id,
      elements: [
        {
          type: "static_select",
          placeholder: {
            type: "plain_text",
            text: "Ask another agent",
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
        },
      ],
    },
  ];
}

export type SlackMessageUpdate = {
  isThinking?: boolean;
  thinkingAction?: string;
  assistantName: string;
  agentConfigurations: LightAgentConfigurationType[];
  text?: string;
  footnotes?: SlackMessageFootnotes;
};

export function makeFooterBlock({
  assistantName,
  conversationUrl,
  workspaceId,
}: {
  assistantName?: string;
  conversationUrl: string | null;
  workspaceId: string;
}) {
  const assistantsUrl = makeDustAppUrl(`/w/${workspaceId}/assistant/new`);
  const baseHeader = `<${assistantsUrl}|Browse agents> | <${SLACK_HELP_URL}|Use Dust in Slack> | <${DUST_URL}|Learn more>`;
  const attribution = assistantName ? `Answered by *${assistantName}* | ` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: conversationUrl
          ? `${attribution}<${conversationUrl}|Go to full conversation> | ${baseHeader}`
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
  const { isThinking, thinkingAction, assistantName, text, footnotes } =
    messageUpdate;
  const thinkingText = "Agent is thinking...";
  const thinkingTextWithAction = thinkingAction
    ? `${thinkingText}... (${thinkingAction})`
    : thinkingText;

  return {
    blocks: [
      ...makeThinkingBlock({
        isThinking: isThinking ?? false,
        thinkingText: thinkingTextWithAction,
      }),
      ...makeMarkdownBlock(text),
      ...makeContextSectionBlocks({
        assistantName,
        conversationUrl,
        footnotes,
        workspaceId,
      }),
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
          text: truncate(errorMessage, MAX_SLACK_MESSAGE_LENGTH),
        },
      },
      makeDividerBlock(),
      makeFooterBlock({
        conversationUrl,
        workspaceId,
      }),
    ],
    mrkdwn: true,
    unfurl_links: false,
    text: errorMessage,
  };
}

/**
 * Creates Slack blocks with buttons for validating a tool execution.
 * This is used when an agent sends a tool_approve_execution event to Slack.
 */
export function makeToolValidationBlock({
  agentName,
  toolName,
  id,
}: {
  agentName: string;
  toolName: string;
  id: string;
}) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Agent \`${agentName}\` is requesting permission to use tool \`${toolName}\``,
      },
    },
    {
      type: "actions",
      block_id: id,
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Approve",
            emoji: true,
          },
          style: "primary",
          value: JSON.stringify({
            status: "approved",
            agentName,
            toolName,
          } as RequestToolPermissionActionValueParsed),
          action_id: APPROVE_TOOL_EXECUTION,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Reject",
            emoji: true,
          },
          style: "danger",
          value: JSON.stringify({
            status: "rejected",
            agentName,
            toolName,
          } as RequestToolPermissionActionValueParsed),
          action_id: REJECT_TOOL_EXECUTION,
        },
      ],
    },
  ];
}
