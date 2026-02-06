import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
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

export type RunAgentBlockingEvent =
  | MCPApproveExecutionEvent
  | ToolPersonalAuthRequiredEvent;

/**
 * Make a tool blocked awaiting input response.
 * Serializes blocking events and resume state into a MCP tool response.
 */
export function makeToolBlockedAwaitingInputResponse(
  blockingEvents: RunAgentBlockingEvent[],
  state: RunAgentResumeState
): CallToolResult {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_blocked_awaiting_input",
          text: "Tool requires resume after blocking events",
          uri: "",
          blockingEvents,
          state,
        },
      },
    ],
  };
}
