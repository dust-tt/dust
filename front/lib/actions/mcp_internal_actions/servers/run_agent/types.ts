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

const ToolBlockedAwaitingInputErrorName = "ToolBlockedAwaitingInputError";

export class ToolBlockedAwaitingInputError extends Error {
  constructor(
    public readonly blockingEvents: RunAgentBlockingEvent[],
    public readonly resumeState: Record<string, unknown>
  ) {
    super("Tool requires resume after blocking events");
    this.name = ToolBlockedAwaitingInputErrorName;
  }
}

export type RunAgentBlockingEvent =
  | MCPApproveExecutionEvent
  | ToolPersonalAuthRequiredEvent;

const DUST_BLOCKED_AWAITING_INPUT_KEY = "__dust_blocked_awaiting_input";

export type ToolBlockedAwaitingInputResponse = {
  [DUST_BLOCKED_AWAITING_INPUT_KEY]: {
    blockingEvents: RunAgentBlockingEvent[];
    state: RunAgentResumeState;
  };
};

export function isToolBlockedAwaitingInputResponse(
  response: unknown
): response is ToolBlockedAwaitingInputResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    DUST_BLOCKED_AWAITING_INPUT_KEY in response &&
    typeof response[DUST_BLOCKED_AWAITING_INPUT_KEY] === "object" &&
    response[DUST_BLOCKED_AWAITING_INPUT_KEY] !== null
  );
}

export function extractToolBlockedAwaitingInputResponse(
  response: ToolBlockedAwaitingInputResponse
): {
  blockingEvents: RunAgentBlockingEvent[];
  state: RunAgentResumeState;
} {
  return response[DUST_BLOCKED_AWAITING_INPUT_KEY];
}

/**
 * Serializes a ToolBlockedAwaitingInputError for MCP transport.
 * MCP protocol strips custom error properties, so we encode them in the response content.
 */
export function makeToolBlockedAwaitingInputResponse(
  blockingEvents: RunAgentBlockingEvent[],
  state: RunAgentResumeState
): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          [DUST_BLOCKED_AWAITING_INPUT_KEY]: {
            blockingEvents,
            state,
          },
        }),
      },
    ],
  };
}
