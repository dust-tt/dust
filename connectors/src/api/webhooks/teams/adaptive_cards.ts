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
  assistantName,
  conversationUrl,
  workspaceId,
  agentConfigurations,
  originalMessage,
  isError = false,
}: {
  response: string;
  assistantName: string;
  conversationUrl: string | null;
  workspaceId: string;
  agentConfigurations: LightAgentConfigurationType[];
  originalMessage?: string;
  isError?: boolean;
}): Partial<Activity> {
  const card: AdaptiveCard = {
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
        color: isError ? "Attention" : "Default",
      },
    ],
    actions: [],
  };

  // Add separator and footer section
  card.body.push({
    type: "Container",
    spacing: "Medium",
    separator: true,
    items: [
      // Agent attribution and links
      {
        type: "TextBlock",
        text: createFooterText({
          assistantName,
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

  // Add agent selector if we have multiple agents
  if (agentConfigurations.length > 1) {
    // Add top 5 most popular agents as quick action buttons
    const topAgents = agentConfigurations
      .sort(
        (a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
      )
      .slice(0, 5);

    topAgents.forEach((agent) => {
      card.actions.push({
        type: "Action.Submit",
        title: `Ask ${agent.name}`,
        data: {
          verb: "ask_agent",
          action: "ask_agent",
          agentId: agent.sId,
          agentName: agent.name,
          originalMessage: originalMessage || "",
        },
      });
    });
  }

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
            // Footer with assistant name and link (no buttons)
            // {
            //   type: "Container",
            //   spacing: "Medium",
            //   separator: true,
            //   items: [
            //     {
            //       type: "TextBlock",
            //       text: createFooterText({
            //         assistantName,
            //         conversationUrl,
            //         workspaceId,
            //       }),
            //       wrap: true,
            //       size: "Small",
            //       color: "Good",
            //     },
            //   ],
            // },
          ],
          // No actions for streaming
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
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: "**Choose an agent to answer your question:**",
              wrap: true,
              weight: "Bolder",
              spacing: "Medium",
            },
            {
              type: "TextBlock",
              text: `_"${originalMessage.substring(0, 100)}${originalMessage.length > 100 ? "..." : ""}"_`,
              wrap: true,
              isSubtle: true,
              spacing: "Small",
            },
          ],
          actions: agentConfigurations.slice(0, 5).map((ac) => ({
            type: "Action.Submit",
            title: ac.name,
            data: {
              verb: "ask_agent",
              action: "ask_agent",
              agentId: ac.sId,
              agentName: ac.name,
              originalMessage: originalMessage,
            },
          })),
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
