import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import logger from "@app/logger/logger";

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
