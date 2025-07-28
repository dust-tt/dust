import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { Err, Ok } from "@app/types/shared/result";
import type { Result } from "@app/types";

/**
 * Error tool result. Does not fail the agent loop (the text is shown to the model) but is logged.
 * If the tool callback is wrapped by `withToolLogging`, the error will be tracked and the error
 * message will be shown in the logs to help debugging it.
 *
 * Do not use if the intent is to show an issue to the agent as part of a normal tool execution,
 * only use if the error should be logged and tracked.
 */
export function makeMCPToolTextError(text: string): {
  isError: true;
  content: [TextContent];
} {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

/**
 * Error tool result for use with withToolLogging wrapper.
 * Returns an Err result for use with withToolLogging wrapper.
 */
export function makeMCPToolTextErrorResult(text: string): Result<CallToolResult, Error> {
  return new Err(new Error(text));
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

/**
 * Success tool result for use with withToolLogging wrapper.
 * Returns an Ok result for use with withToolLogging wrapper.
 */
export function makeMCPToolRecoverableErrorSuccessResult(errorText: string): Result<CallToolResult, Error> {
  return new Ok({
    isError: false,
    content: [{ type: "text", text: errorText }],
  });
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

export const makeMCPToolTextSuccessResult = ({
  message,
  result,
}: {
  message: string;
  result?: string;
}): Result<CallToolResult, Error> => {
  if (!result) {
    return new Ok({
      isError: false,
      content: [{ type: "text", text: message }],
    });
  }
  return new Ok({
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: result },
    ],
  });
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

export const makeMCPToolJSONSuccessResult = ({
  message,
  result,
}: {
  message?: string;
  result: object | string;
}): Result<CallToolResult, Error> => {
  return new Ok({
    isError: false,
    content: [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ],
  });
};

/**
 * Helper to get MCP server ID from agent loop context
 */
export const getMcpServerIdFromContext = (
  agentLoopContext?: AgentLoopContextType
): string | null => {
  const actionConfig = agentLoopContext?.runContext?.actionConfiguration;
  if (actionConfig && isServerSideMCPToolConfiguration(actionConfig)) {
    return actionConfig.internalMCPServerId || null;
  }
  return null;
};
