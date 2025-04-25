import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

export const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "No access token found",
  OBJECT_NOT_FOUND: "Object not found",
  NO_OBJECTS_FOUND: "No objects found",
} as const;

export const withAuth = async (
  auth: Authenticator,
  mcpServerId: string,
  action: (accessToken: string) => Promise<any>,
  params?: any
): Promise<CallToolResult> => {
  const accessToken = await getAccessTokenForInternalMCPServer(auth, {
    mcpServerId,
  });
  if (!accessToken) {
    return {
      isError: true,
      content: [{ type: "text", text: ERROR_MESSAGES.NO_ACCESS_TOKEN }],
    };
  }
  try {
    const result = await action(accessToken);
    if (result?.isError) {
      return result;
    }
    return returnSuccess({
      message: "Operation completed successfully",
      result,
    });
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
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error.response?.body?.message ?? error.message ?? message,
      },
    ],
  };
};

export const returnSuccess = ({
  message,
  result,
}: {
  message: string;
  result: any;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: JSON.stringify(result, null, 2) },
    ],
  };
};
