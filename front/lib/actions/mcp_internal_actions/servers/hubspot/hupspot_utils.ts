import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";

export const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "No access token found",
  OBJECT_NOT_FOUND: "Object not found",
  NO_OBJECTS_FOUND: "No objects found",
} as const;

export const withAuth = async ({
  action,
  params,
  authInfo,
}: {
  action: (accessToken: string) => Promise<CallToolResult>;
  params?: any;
  authInfo?: AuthInfo;
}): Promise<CallToolResult> => {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return makeMCPToolTextError(ERROR_MESSAGES.NO_ACCESS_TOKEN);
  }
  try {
    return await action(accessToken);
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
  params: Record<string, any>;
  message: string;
}): CallToolResult => {
  logger.error(
    {
      error,
      ...params,
    },
    `[Hubspot MCP Server] ${message}`
  );
  return makeMCPToolTextError(
    error.response?.body?.message ?? error.message ?? message
  );
};
