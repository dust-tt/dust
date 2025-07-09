import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Error tool result. Does not fail the agent loop (the text is shown to the model) but is logged.
 * If the tool callback is wrapped by `withToolLogging`, the error will be tracked and the error
 * message will be shown in the logs to help debugging it.
 *
 * Do not use if the intent is to show an issue to the agent as part of a normal tool execution,
 * only use if the error should be logged and tracked.
 */
export function makeMCPToolTextError(
  text: string,
  metadata: Record<string, boolean | number | string> = {}
): {
  isError: true;
  content: [TextContent];
} {
  return {
    isError: true,
    content: [
      {
        type: "text",
        ...metadata,
        text,
      },
    ],
  };
}

/**
 * Success tool result.
 *
 * Use this if the intent is to show an issue to the agent that does not need logging
 * and is part of a normal tool execution.
 */
export function makeMCPToolRecoverableErrorSuccess(errorText: string): {
  isError: false;
  content: [TextContent];
} {
  return {
    isError: false,
    content: [{ type: "text", text: errorText }],
  };
}

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result?: string;
}): CallToolResult => {
  if (!result) {
    return {
      isError: false,
      content: [{ type: "text", text: message }],
    };
  }
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: result },
    ],
  };
};

export const makeMCPToolJSONSuccess = ({
  message,
  result,
}: {
  message?: string;
  result: object | string;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ],
  };
};
