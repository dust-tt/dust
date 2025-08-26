import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { ToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";

export interface ChildAgentBlob {
  name: string;
  description: string;
}

// Resume state for run_agent.

export type RunAgentResumeState = Record<string, unknown> & {
  conversationId: string;
  userMessageId: string;
};

export function isRunAgentResumeState(
  state: unknown
): state is RunAgentResumeState {
  return (
    typeof state === "object" &&
    state !== null &&
    "conversationId" in state &&
    typeof state.conversationId === "string" &&
    "userMessageId" in state &&
    typeof state.userMessageId === "string"
  );
}

// Resume required error for run_agent.

export const BlockedAwaitingInputErrorName = "BlockedAwaitingInputError";

export class BlockedAwaitingInputError extends Error {
  constructor(
    public readonly blockingEvents: RunAgentBlockingEvent[],
    public readonly resumeState: Record<string, unknown>
  ) {
    super("Tool requires resume after blocking events");
    this.name = BlockedAwaitingInputErrorName;
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
  state: RunAgentResumeState
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
