import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { GOAL_MODE_TOOLS_METADATA } from "@app/lib/api/actions/servers/goal_mode/metadata";
import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const handlers: ToolHandlers<typeof GOAL_MODE_TOOLS_METADATA> = {
  update_goal: async ({ status, reason }, { auth, runContext }) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    const result = await ConversationGoalResource.updateFromAgent(auth, {
      agentLoopData: {
        agentConfiguration: runContext.agentConfiguration,
        agentMessage: runContext.agentMessage,
        conversation: runContext.conversation,
        modelInfo: runContext.modelInfo,
        userMessage: runContext.userMessage,
      },
      status,
      reason,
    });
    if (result.isErr()) {
      switch (result.error.type) {
        case "goal_not_found":
          return new Err(new MCPError("No goal exists for this branch."));
        case "invalid_transition":
          return new Err(
            new MCPError(
              "The goal is no longer active. It may have been paused, cancelled, or completed."
            )
          );
        case "wrong_agent":
        case "forbidden":
          return new Err(
            new MCPError(
              "Only the root agent assigned to the active goal can update it."
            )
          );
        case "goal_conflict":
          return new Err(
            new MCPError(
              "The goal changed concurrently. Re-read the goal state before retrying."
            )
          );
      }
    }

    return new Ok([
      {
        type: "text",
        text:
          result.value.status === "completed"
            ? "Goal marked complete. Give the user one concise final summary of the outcome and verification."
            : "Goal marked blocked. Give the user one concise final summary naming the blocker and what is needed to resume.",
      },
    ]);
  },
};

export const TOOLS = buildTools(GOAL_MODE_TOOLS_METADATA, handlers);
