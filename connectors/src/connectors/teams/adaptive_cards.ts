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
