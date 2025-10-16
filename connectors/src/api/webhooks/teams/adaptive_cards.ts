import type { LightAgentConfigurationType } from "@dust-tt/client";
import type { AdaptiveCard } from "@microsoft/teams-ai";
import type { Activity } from "botbuilder";

import { apiConfig } from "@connectors/lib/api/config";

const DUST_URL = "https://dust.tt/home";
const TEAMS_HELP_URL = "https://docs.dust.tt/docs/teams";

export function makeDustAppUrl(path: string) {
  return `${apiConfig.getDustFrontAPIUrl()}${path}`;
}

export function makeConversationUrl(
  workspaceId?: string,
  conversationId?: string | null
) {
  if (workspaceId && conversationId) {
    return makeDustAppUrl(`/w/${workspaceId}/assistant/${conversationId}`);
  }
  return null;
}

/**
 * Creates an Adaptive Card for Teams with the AI response, conversation link, and agent selector
 */
export function createResponseAdaptiveCard({
  response,
  assistant,
  conversationUrl,
  workspaceId,
  isError = false,
  agentConfigurations,
  originalMessage,
}: {
  response: string;
  assistant: { assistantName: string; assistantId: string };
  conversationUrl: string | null;
  workspaceId: string;
  isError?: boolean;
  agentConfigurations: LightAgentConfigurationType[];
  originalMessage: string;
}): Partial<Activity> {
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
      {
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
      },
      {
        type: "ColumnSet",
        spacing: "Medium",
        separator: true,
        id: "actions_set",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "Input.ChoiceSet",
                id: "selectedAgent",
                value: assistant.assistantId,
                choices: agentConfigurations.map((agent) => ({
                  title: agent.name,
                  value: agent.sId,
                })),
                placeholder: "Select an agent",
              },
              {
                type: "Input.Text",
                id: "originalMessageInput",
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
                  },
                ],
                horizontalAlignment: "Right",
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
                    iconUrl: "icon:ThumbLike",
                    data: {
                      verb: "like",
                    },
                  },
                  {
                    type: "Action.Submit",
                    iconUrl: "icon:ThumbDislike",
                    data: {
                      verb: "dislike",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    actions: [],
  };

  // Add separator and footer section
  card.body.push();

  card.body.push();

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
 * Creates an agent selection adaptive card
 */
export function createAgentSelectionCard(
  agentConfigurations: LightAgentConfigurationType[],
  originalMessage: string
): Partial<Activity> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.5",
          body: [],
        },
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

  const baseLinks = `[Browse agents](${assistantsUrl}) | [Use Dust in Teams](${TEAMS_HELP_URL}) | [Learn more](${DUST_URL})`;

  return conversationUrl
    ? `${attribution}[Go to full conversation](${conversationUrl}) | ${baseLinks}`
    : `${attribution}${baseLinks}`;
}
