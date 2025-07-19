import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { getJiraBaseUrl } from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

export const SEARCH_FILTER_FIELDS = [
  "issueType",
  "parentIssueKey",
  "status",
  "assignee",
  "reporter",
  "project",
  "dueDate",
] as const;

export type SearchFilterField = (typeof SEARCH_FILTER_FIELDS)[number];

type WithAuthParams = {
  authInfo?: AuthInfo;
  action: (baseUrl: string, accessToken: string) => Promise<CallToolResult>;
};

export const withAuth = async ({
  authInfo,
  action,
}: WithAuthParams): Promise<CallToolResult> => {
  const accessToken = authInfo?.token;

  if (!accessToken) {
    return makeMCPToolTextError("No access token found");
  }

  try {
    // Get the base URL from accessible resources
    const baseUrl = await getJiraBaseUrl(accessToken);
    if (!baseUrl) {
      return makeMCPToolTextError("No base url found");
    }

    return await action(baseUrl, accessToken);
  } catch (error: unknown) {
    return logAndReturnError({
      error,
      message: "Operation failed",
    });
  }
};

function logAndReturnError({
  error,
  message,
}: {
  error: unknown;
  message: string;
}): CallToolResult {
  logger.error(
    {
      error,
    },
    `[JIRA MCP Server] ${message}`
  );
  return makeMCPToolTextError(normalizeError(error).message);
}

// Helper function to escape JQL values that contain spaces or special characters
export const escapeJQLValue = (value: string): string => {
  // If the value contains spaces, special characters, or reserved words, wrap it in quotes
  if (
    /[\s"'\\]/.test(value) ||
    /^(and|or|not|in|is|was|from|to|on|by|during|before|after|empty|null|order|asc|desc|changed|was|in|not|to|from|by|before|after|on|during)$/i.test(
      value
    )
  ) {
    // Escape any existing quotes in the value
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
};
