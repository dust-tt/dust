import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const GOAL_MODE_SERVER_NAME = "goal_mode" as const;
export const UPDATE_GOAL_TOOL_NAME = "update_goal" as const;

export const GOAL_MODE_TOOLS_METADATA = [
  {
    name: UPDATE_GOAL_TOOL_NAME,
    description:
      "Update the active goal to a terminal status. Use `complete` only when the entire objective " +
      "has been achieved and appropriately verified; incomplete, partial, or merely promising work " +
      "must remain active. Use `blocked` only for a genuine impasse after exhausting safe in-scope " +
      "alternatives and when progress requires user input or an external state change. Do not call " +
      "this tool just because a turn is ending: omitting it causes Goal Mode to start another turn. " +
      "After a successful call, provide one concise final summary to the user and do not start new work.",
    schema: {
      status: z
        .enum(["complete", "blocked"])
        .describe(
          "`complete` when the full objective is achieved and verified; `blocked` only at a genuine impasse."
        ),
      reason: z
        .string()
        .trim()
        .min(1)
        .max(1_000)
        .optional()
        .describe(
          "For `blocked`, briefly state the specific dependency or user decision required. Optional for `complete`."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Updating goal",
      done: "Goal updated",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const GOAL_MODE_SERVER = {
  serverInfo: {
    name: GOAL_MODE_SERVER_NAME,
    version: "1.0.0",
    description:
      "Update the lifecycle of the active autonomous goal. The goal remains active across agent turns until this server records completion or a genuine blocker.",
    icon: "ActionCheckCircleIcon" as const,
    authorization: null,
    documentationUrl: null,
  },
  tools: GOAL_MODE_TOOLS_METADATA,
} as const satisfies ServerMetadata;
