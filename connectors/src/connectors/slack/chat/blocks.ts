import type { LightAgentConfigurationType } from "@dust-tt/client";

import type { RequestToolPermissionActionValueParsed } from "@connectors/api/webhooks/webhook_slack_bot_interaction";
import {
  APPROVE_TOOL_EXECUTION,
  LEAVE_FEEDBACK_DOWN,
  LEAVE_FEEDBACK_UP,
  REJECT_TOOL_EXECUTION,
  STATIC_AGENT_CONFIG,
} from "@connectors/api/webhooks/webhook_slack_bot_interaction";
import { makeDustAppUrl } from "@connectors/connectors/slack/chat/utils";
import type { MessageFootnotes } from "@connectors/lib/bot/citations";
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

function makeFootnotesBlock(footnotes: MessageFootnotes) {
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
  state,
  assistantName,
  conversationUrl,
  footnotes,
  workspaceId,
}: {
  state: "thinking" | "answered";
  assistantName: string;
  conversationUrl: string | null;
  footnotes: MessageFootnotes | undefined;
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
      state,
      assistantName,
      conversationUrl,
      workspaceId,
    })
  );

  const resultBlocks = blocks.length ? [makeDividerBlock(), ...blocks] : [];

  return resultBlocks;
}

export function makeFeedbackButtonBlock({
  conversationId,
  messageId,
  workspaceId,
}: {
  conversationId: string;
  messageId: string;
  workspaceId: string;
}) {
  return [
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👍",
            emoji: true,
          },
          action_id: LEAVE_FEEDBACK_UP,
          value: JSON.stringify({
            conversationId,
            messageId,
            workspaceId,
            preselectedThumb: "up",
          }),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👎",
            emoji: true,
          },
          action_id: LEAVE_FEEDBACK_DOWN,
          value: JSON.stringify({
            conversationId,
            messageId,
            workspaceId,
            preselectedThumb: "down",
          }),
        },
      ],
    },
  ];
}

export function makeFeedbackSubmittedBlock() {
  return [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "✅ Feedback submitted",
        },
      ],
    },
  ];
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
  id: string,
  feedbackParams?: {
    conversationId: string;
    messageId: string;
    workspaceId: string;
  }
) {
  const elements: Array<Record<string, unknown>> = [];

  // Add feedback buttons if parameters are provided
  if (feedbackParams) {
    elements.push(
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "👍",
          emoji: true,
        },
        action_id: LEAVE_FEEDBACK_UP,
        value: JSON.stringify({
          ...feedbackParams,
          preselectedThumb: "up",
        }),
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "👎",
          emoji: true,
        },
        action_id: LEAVE_FEEDBACK_DOWN,
        value: JSON.stringify({
          ...feedbackParams,
          preselectedThumb: "down",
        }),
      }
    );
  }

  // Add agent selection dropdown if we have agent configurations
  if (agentConfigurations.length > 0) {
    elements.push({
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
    });
  }

  return [
    {
      type: "actions",
      block_id: id,
      elements: elements,
    },
  ];
}

export type SlackMessageUpdate = {
  isThinking?: boolean;
  thinkingAction?: string;
  assistantName: string;
  agentConfigurations: LightAgentConfigurationType[];
  text?: string;
  footnotes?: MessageFootnotes;
  conversationId?: string;
  messageId?: string;
};

export function makeFooterBlock({
  state,
  assistantName,
  conversationUrl,
  workspaceId,
}: {
  state: "thinking" | "error" | "answered";
  assistantName?: string;
  conversationUrl: string | null;
  workspaceId: string;
}) {
  const assistantsUrl = makeDustAppUrl(`/w/${workspaceId}/agent/new`);
  let attribution = "";
  if (assistantName) {
    if (state === "thinking") {
      attribution = `*${assistantName}* is thinking...`;
    } else if (state === "error") {
      attribution = `*${assistantName}* encountered an error`;
    } else if (state === "answered") {
      attribution = `Answered by *${assistantName}*`;
    }
  } else {
    if (state === "thinking") {
      attribution = "Thinking...";
    } else if (state === "error") {
      attribution = "Error";
    } else if (state === "answered") {
      attribution = "Answered";
    }
  }

  const links = [];
  if (conversationUrl) {
    links.push(`<${conversationUrl}|View full conversation>`);
  }
  links.push(`<${assistantsUrl}|Browse agents>`);

  const fullText = attribution
    ? `${attribution} | ${links.join(" · ")}`
    : links.join(" · ");

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: fullText,
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
        state: isThinking ? "thinking" : "answered",
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
        state: "error",
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
