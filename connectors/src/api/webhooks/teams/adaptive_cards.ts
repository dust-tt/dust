import type { LightAgentConfigurationType } from "@dust-tt/client";
import type { AdaptiveCard } from "@microsoft/teams-ai";
import type { Activity } from "botbuilder";

import type { MessageFootnotes } from "@connectors/lib/bot/citations";
import { convertUrlsToMarkdown } from "@connectors/lib/bot/citations";
import { makeDustAppUrl } from "@connectors/lib/bot/conversation_utils";
import type { MentionMatch } from "@connectors/lib/bot/mentions";

const DUST_URL = "https://dust.tt/home";

/**
 * Creates an Adaptive Card for Teams with the AI response, conversation link, and agent selector
 */
export function createResponseAdaptiveCard({
  response,
  mentionedAgent,
  conversationUrl,
  workspaceId,
  footnotes,
  isError = false,
  agentConfigurations,
  originalMessage,
}: {
  response: string;
  mentionedAgent: MentionMatch;
  conversationUrl: string | null;
  workspaceId: string;
  footnotes?: MessageFootnotes;
  isError?: boolean;
  agentConfigurations: LightAgentConfigurationType[];
  originalMessage: string;
}): Partial<Activity> {
  const currentAgent = agentConfigurations.find(
    (agent) => agent.sId === mentionedAgent.agentId
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

  const responseWithMarkdownLinks = convertUrlsToMarkdown(response);

  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: responseWithMarkdownLinks,
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
          agentName: mentionedAgent.agentName,
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
            value: mentionedAgent.agentName,
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
  agentName: string;
  conversationUrl: string | null;
  workspaceId: string;
}): Partial<Activity> {
  const responseWithMarkdownLinks = convertUrlsToMarkdown(response);

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
              text: responseWithMarkdownLinks,
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

export function createPersonalAuthenticationAdaptiveCard({
  conversationUrl,
  workspaceId,
}: {
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
            {
              type: "TextBlock",
              text:
                "The agent took an action that requires personal authentication. " +
                (conversationUrl
                  ? `Please go to [the conversation](${conversationUrl}) to authenticate.`
                  : ""),
              wrap: true,
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
 * Creates the basic Adaptive Card for tool execution approval for everyone (read-only, no actions)
 */
export function createBasicToolApprovalAdaptiveCard(data: {
  agentName: string;
  toolName: string;
  conversationId: string;
  messageId: string;
  actionId: string;
  workspaceId: string;
  microsoftBotMessageId: number;
  userAadObjectId: string;
}): Partial<Activity> {
  const basicCard: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    refresh: {
      action: {
        type: "Action.Execute",
        title: "Tool execution approval",
        verb: "toolExecutionApproval",
        data,
      },
      userIds: [data.userAadObjectId],
    },
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
            text: `Agent **@${data.agentName}** is requesting permission to use tool **${data.toolName}**`,
            wrap: true,
            spacing: "Small",
          },
          {
            type: "TextBlock",
            text: "_Waiting for user approval..._",
            wrap: true,
            spacing: "Small",
            size: "Small",
            color: "Accent",
            isSubtle: true,
          },
        ],
      },
    ],
  };

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          ...basicCard,
        },
      },
    ],
  };
}

/**
 * Creates an interactive Adaptive Card for tool execution approval for the original sender (with buttons)
 */
export function createInteractiveToolApprovalAdaptiveCard(data: {
  agentName: string;
  toolName: string;
  conversationId: string;
  messageId: string;
  actionId: string;
  workspaceId: string;
  microsoftBotMessageId: number;
}): AdaptiveCard {
  return {
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
            text: `Agent **@${data.agentName}** is requesting permission to use tool **${data.toolName}**`,
            wrap: true,
            spacing: "Small",
          },
        ],
      },
    ],
    actions: [
      {
        type: "Action.Execute",
        title: "Approve",
        verb: "approve_tool",
        data,
      },
      {
        type: "Action.Execute",
        title: "Reject",
        verb: "reject_tool",
        data,
      },
    ],
  };
}

/**
 * Creates a welcome adaptive card for new installations
 */
export function createWelcomeAdaptiveCard(): Partial<Activity> {
  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "Container",
        items: [
          {
            type: "TextBlock",
            text: "🎉 Welcome to Dust!",
            weight: "Bolder",
            size: "Large",
            spacing: "Medium",
            horizontalAlignment: "Center",
          },
          {
            type: "TextBlock",
            text: "Thank you for installing Dust in Microsoft Teams!",
            wrap: true,
            spacing: "Medium",
            horizontalAlignment: "Center",
          },
        ],
      },
      {
        type: "Container",
        spacing: "Medium",
        separator: true,
        items: [
          {
            type: "TextBlock",
            text: "**Getting Started**",
            weight: "Bolder",
            spacing: "Medium",
          },
          {
            type: "TextBlock",
            text: "To start using Dust in Teams, make sure to:",
            wrap: true,
            spacing: "Small",
          },
          {
            type: "TextBlock",
            text: "• Enable the integration in your Workspace settings",
            wrap: true,
            spacing: "Small",
          },
          {
            type: "TextBlock",
            text: "• Configure your agents to work with Teams",
            wrap: true,
            spacing: "Small",
          },
          {
            type: "TextBlock",
            text: "• Start chatting by mentioning an agent",
            wrap: true,
            spacing: "Small",
          },
        ],
      },
      {
        type: "Container",
        spacing: "Medium",
        separator: true,
        items: [
          {
            type: "TextBlock",
            text: "📚 [Read the full documentation](https://docs.dust.tt/docs/dust-in-teams) to learn more about using Dust in Teams.",
            wrap: true,
            size: "Small",
            spacing: "Small",
          },
          {
            type: "TextBlock",
            text: "Need help? Visit [dust.tt](https://dust.tt) for support.",
            wrap: true,
            size: "Small",
            spacing: "Small",
            color: "Accent",
          },
        ],
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
  agentName,
  conversationUrl,
  workspaceId,
  isError = false,
}: {
  agentName?: string;
  conversationUrl?: string | null;
  workspaceId: string;
  isError?: boolean;
}): string {
  const agentsUrl = makeDustAppUrl(`/w/${workspaceId}/agent/new`);

  let attribution = "";
  if (agentName) {
    if (isError) {
      attribution = `**${agentName}** encountered an error | `;
    } else {
      attribution = `Answered by **${agentName}** | `;
    }
  }

  const baseLinks = `[Browse agents](${agentsUrl}) | [Learn more](${DUST_URL})`;

  return conversationUrl
    ? `${attribution}[Go to full conversation](${conversationUrl}) | ${baseLinks}`
    : `${attribution}${baseLinks}`;
}
