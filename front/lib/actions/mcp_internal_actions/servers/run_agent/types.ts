import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { ToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";

export interface ChildAgentBlob {
  name: string;
  description: string;
}

// Restart state for run_agent.

export type RunAgentRestartState = Record<string, unknown> & {
  conversationId: string;
  userMessageId: string;
};

export function isRunAgentRestartState(
  state: unknown
): state is RunAgentRestartState {
  return (
    typeof state === "object" &&
    state !== null &&
    "conversationId" in state &&
    typeof state.conversationId === "string" &&
    "userMessageId" in state &&
    typeof state.userMessageId === "string"
  );
}

// Restart required error for run_agent.

export const BlockedAwaitingInputErrorName = "BlockedAwaitingInputError";

export class BlockedAwaitingInputError extends Error {
  constructor(
    public readonly blockingEvents: RunAgentBlockingEvent[],
    public readonly restartState: Record<string, unknown>
  ) {
    super("Tool requires restart after blocking events");
    this.name = BlockedAwaitingInputErrorName;
  }

  // This method is used to check if an error resulting from a Temporal activity is a
  // BlockedAwaitingInputError.
  static isBlockedAwaitingInputError(
    error: unknown
  ): error is BlockedAwaitingInputError {
    return (
      error instanceof Error &&
      error.name === BlockedAwaitingInputErrorName &&
      "blockingEvents" in error &&
      "restartState" in error
    );
  }
}

export type RunAgentBlockingEvent =
  | MCPApproveExecutionEvent
  | ToolPersonalAuthRequiredEvent;

/**
 * Serializes a BlockedAwaitingInputError for MCP transport.
 * MCP protocol strips custom error properties, so we encode them in the response content.
 */
export function makeBlockedAwaitingInputResponse(
  blockingEvents: RunAgentBlockingEvent[],
  state: RunAgentRestartState
): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          __dust_blocked_awaiting_input: {
            blockingEvents,
            state,
          },
        }),
      },
    ],
  };
}
