import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

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
    return makeMCPToolTextError("no access token found");
  }

  try {
    // Get the base URL from accessible resources
    const baseUrl = await getJiraBaseUrl(accessToken);
    if (!baseUrl) {
      return makeMCPToolTextError("no base url found");
    }

    return await action(baseUrl, accessToken);
  } catch (error: unknown) {
    return logAndReturnError({ error, params, message: "Operation failed" });
  }
};

export async function getJiraCloudId(
  accessToken: string
): Promise<string | null> {
  const resourceInfo = await getJiraResourceInfo(accessToken);
  return resourceInfo?.id || null;
}

async function getJiraBaseUrl(accessToken: string): Promise<string | null> {
  const cloudId = await getJiraCloudId(accessToken);
  if (cloudId) {
    return `https://api.atlassian.com/ex/jira/${cloudId}`;
  }
  return null;
}

// Use this to get the JIRA base URL and the JIRA cloud ID
export async function getJiraResourceInfo(accessToken: string): Promise<{
  id: string;
  url: string;
  name: string;
} | null> {
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

    if (resources && resources.length > 0) {
      const resource = resources[0];
      return {
        id: resource.id,
        url: resource.url,
        name: resource.name,
      };
    }

    return null;
  } catch (error) {
    logger.error({ error }, "Error fetching JIRA accessible resources");
    return null;
  }
}

function logAndReturnError({
  error,
  params,
  message,
}: {
  error: unknown;
  params?: Record<string, any>;
  message: string;
}): CallToolResult {
  logger.error(
    {
      error,
      ...params,
    },
    `[JIRA MCP Server] ${message}`
  );
  return makeMCPToolTextError(normalizeError(error).message);
}
