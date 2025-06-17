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
  const baseUrl = authInfo?.metadata?.baseUrl as string;
  
  if (!accessToken) {
    return makeMCPToolTextError(ERROR_MESSAGES.NO_ACCESS_TOKEN);
  }
  
  if (!baseUrl) {
    return makeMCPToolTextError(ERROR_MESSAGES.NO_BASE_URL);
  }
  
  try {
    return await action(baseUrl, accessToken);
  } catch (error: any) {
    return logAndReturnError({ error, params, message: "Operation failed" });
  }
};

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