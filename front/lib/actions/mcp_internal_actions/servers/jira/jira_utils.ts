import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";

export const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "No access token found",
  NO_BASE_URL: "No JIRA base URL found in auth info",
  TICKET_NOT_FOUND: "Ticket not found",
} as const;

export const withAuth = async ({
  action,
  params,
  authInfo,
}: {
  action: (baseUrl: string, accessToken: string) => Promise<CallToolResult>;
  params?: any;
  authInfo?: AuthInfo;
}): Promise<CallToolResult> => {
  const accessToken = authInfo?.token;

  if (!accessToken) {
    return makeMCPToolTextError(ERROR_MESSAGES.NO_ACCESS_TOKEN);
  }

  try {
    // Get the base URL from accessible resources
    const baseUrl = await getJiraBaseUrl(accessToken);
    if (!baseUrl) {
      return makeMCPToolTextError(ERROR_MESSAGES.NO_BASE_URL);
    }

    return await action(baseUrl, accessToken);
  } catch (error: any) {
    return logAndReturnError({ error, params, message: "Operation failed" });
  }
};

async function getJiraBaseUrl(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      logger.error(
        { status: response.status, statusText: response.statusText },
        "Failed to fetch accessible resources"
      );
      return null;
    }

    const resources = await response.json();
    
    // Get the first accessible resource (primary workspace)
    if (resources && resources.length > 0) {
      return resources[0].url;
    }

    return null;
  } catch (error) {
    logger.error({ error }, "Error fetching JIRA accessible resources");
    return null;
  }
}

export const logAndReturnError = ({
  error,
  params,
  message,
}: {
  error: any;
  params?: Record<string, any>;
  message: string;
}): CallToolResult => {
  logger.error(
    {
      error,
      ...params,
    },
    `[JIRA MCP Server] ${message}`
  );
  return makeMCPToolTextError(
    error.response?.body?.message ?? error.message ?? message
  );
};
