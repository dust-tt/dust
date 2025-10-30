import type { LightAgentConfigurationType } from "@dust-tt/client";
import type { AdaptiveCard } from "@microsoft/teams-ai";
import type { Activity } from "botbuilder";

import type { MessageFootnotes } from "@connectors/lib/bot/citations";
import { makeDustAppUrl } from "@connectors/lib/bot/conversation_utils";

const DUST_URL = "https://dust.tt/home";

/**
 * Creates an Adaptive Card for Teams with the AI response, conversation link, and agent selector
 */
export function createResponseAdaptiveCard({
  response,
  assistant,
  conversationUrl,
  workspaceId,
  footnotes,
  isError = false,
  agentConfigurations,
  originalMessage,
}: {
  response: string;
  assistant: { assistantName: string; assistantId: string };
  conversationUrl: string | null;
  workspaceId: string;
  footnotes?: MessageFootnotes;
  isError?: boolean;
  agentConfigurations: LightAgentConfigurationType[];
  originalMessage: string;
}): Partial<Activity> {
  const currentAgent = agentConfigurations.find(
    (agent) => agent.sId === assistant.assistantId
  );

  const feedbackActions =
    currentAgent?.scope === "global"
      ? []
      : [
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.Submit",
                    iconUrl: "icon:ThumbLike",
                    data: {
                      verb: "like",
                    },
                    msTeams: { feedback: { hide: true } },
                  },
                  {
                    type: "Action.Submit",
                    iconUrl: "icon:ThumbDislike",
                    data: {
                      verb: "dislike",
                    },
                    msTeams: { feedback: { hide: true } },
                  },
                ],
              },
            ],
          },
        ];

  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: response,
        wrap: true,
        spacing: "Medium",
        color: isError ? "Attention" : "Default",
      },
    ],
    actions: [],
  };

  // Add footnotes section if present
  if (footnotes && footnotes.length > 0) {
    const footnotesText = footnotes
      .map(
        (footnote) =>
          `[**[${footnote.index}]** ${footnote.text}](${footnote.link})`
      )
      .join(" • ");

    card.body.push({
      type: "Container",
      spacing: "Medium",
      separator: true,
      items: [
        {
          type: "TextBlock",
          text: footnotesText,
          wrap: true,
          size: "Small",
          color: "Accent",
          spacing: "Small",
        },
      ],
    });
  }

  // Add separator and footer section
  card.body.push({
    type: "Container",
    spacing: "Medium",
    separator: true,
    items: [
      {
        type: "TextBlock",
        text: createFooterText({
          assistantName: assistant.assistantName,
          conversationUrl,
          workspaceId,
          isError,
        }),
        wrap: true,
        size: "Small",
        color: "Good",
      },
    ],
  });

  card.body.push({
    type: "ColumnSet",
    spacing: "Medium",
    id: "actions_set",
    columns: [
      {
        type: "Column",
        width: "stretch",
        items: [
          {
            type: "Input.ChoiceSet",
            id: "selectedAgent",
            value: assistant.assistantName,
            choices: agentConfigurations.map((agent) => ({
              title: agent.name,
              value: agent.name,
            })),
            placeholder: "Select an agent",
          },
          {
            type: "Input.Text",
            id: "originalMessage",
            value: originalMessage,
            isVisible: false,
          },
        ],
      },
      {
        type: "Column",
        width: "auto",
        items: [
          {
            type: "ActionSet",
            actions: [
              {
                type: "Action.Submit",
                title: "Resend",
                iconUrl: "icon:Bot",
                data: {
                  verb: "ask_agent",
                },
                msTeams: { feedback: { hide: true } },
              },
            ],
            horizontalAlignment: "Right",
          },
        ],
      },
      ...feedbackActions,
    ],
  });

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: card,
      },
    ],
  };
}

/**
 * Creates a streaming adaptive card (no buttons, just content)
 */
export function createStreamingAdaptiveCard({
  response,
}: {
  response: string;
  assistantName: string;
  conversationUrl: string | null;
  workspaceId: string;
}): Partial<Activity> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            // Main response content
            {
              type: "TextBlock",
              text: response,
              wrap: true,
              spacing: "Medium",
            },
          ],
        },
      },
    ],
  };
}

/**
 * Creates a simple adaptive card for thinking/loading state
 */
export function createThinkingAdaptiveCard(): Partial<Activity> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `Thinking...`,
              wrap: true,
              color: "Accent",
            },
          ],
        },
      },
    ],
  };
}

/**
 * Creates an error adaptive card
 */
export function createErrorAdaptiveCard({
  error,
  workspaceId,
  conversationUrl = null,
}: {
  error: string;
  workspaceId: string;
  conversationUrl?: string | null;
}): Partial<Activity> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `❌ ${error}`,
              wrap: true,
              color: "Attention",
            },
            {
              type: "Container",
              spacing: "Medium",
              separator: true,
              items: [
                {
                  type: "TextBlock",
                  text: createFooterText({
                    workspaceId,
                    conversationUrl,
                    isError: true,
                  }),
                  wrap: true,
                  size: "Small",
                  color: "Good",
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

/**
 * Creates an Adaptive Card for tool execution approval
 */
export function createToolApprovalAdaptiveCard({
  agentName,
  toolName,
  conversationId,
  messageId,
  actionId,
  workspaceId,
  microsoftBotMessageId,
  teamsMessageLink,
}: {
  agentName: string;
  toolName: string;
  conversationId: string;
  messageId: string;
  actionId: string;
  workspaceId: string;
  microsoftBotMessageId: number;
  teamsMessageLink: string | null;
}): Partial<Activity> {
  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: "Tool validation Required",
        weight: "Bolder",
        size: "Large",
        spacing: "Medium",
      },
      {
        type: "Container",
        spacing: "Medium",
        items: [
          {
            type: "TextBlock",
            text: `Agent **@${agentName}** is requesting permission to use tool **${toolName}**`,
            wrap: true,
            spacing: "Small",
          },
        ],
      },
      ...(teamsMessageLink
        ? [{
        type: "Container",
        spacing: "Medium",
        separator: true,
        items: [
          {
            type: "TextBlock",
            text: `[View message in Teams](${teamsMessageLink})`,
            wrap: true,
            spacing: "Small",
            size: "Small",
            color: "Accent",
          },
        ],
      }] : [])
    ],
    actions: [
      {
        type: "Action.Execute",
        title: "Approve",
        verb: "approve_tool",
        data: {
          conversationId,
          messageId,
          actionId,
          workspaceId,
          microsoftBotMessageId,
          agentName,
          toolName,
        },
      },
      {
        type: "Action.Execute",
        title: "Reject",
        verb: "reject_tool",
        data: {
          conversationId,
          messageId,
          actionId,
          workspaceId,
          microsoftBotMessageId,
          agentName,
          toolName,
        },
      },
    ],
  };

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: card,
      },
    ],
  };
}

function createFooterText({
  assistantName,
  conversationUrl,
  workspaceId,
  isError = false,
}: {
  assistantName?: string;
  conversationUrl?: string | null;
  workspaceId: string;
  isError?: boolean;
}): string {
  const assistantsUrl = makeDustAppUrl(`/w/${workspaceId}/assistant/new`);

  let attribution = "";
  if (assistantName) {
    if (isError) {
      attribution = `**${assistantName}** encountered an error | `;
    } else {
      attribution = `Answered by **${assistantName}** | `;
    }
  }

  const baseLinks = `[Browse agents](${assistantsUrl}) | [Learn more](${DUST_URL})`;

  return conversationUrl
    ? `${attribution}[Go to full conversation](${conversationUrl}) | ${baseLinks}`
    : `${attribution}${baseLinks}`;
}
