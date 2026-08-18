import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const WORKSPACE_PEOPLE_SERVER_NAME = "workspace_people" as const;

export const GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME =
  "get_workspace_members_context" as const;

export const WORKSPACE_PEOPLE_TOOLS_METADATA = [
  {
    name: GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME,
    description:
      "Get directory context for a batch of active workspace members: " +
      "identity, workspace role, job function, and user-managed workspace groups.",
    schema: {
      userIds: z
        .array(z.string())
        .min(1)
        .max(100)
        .describe(
          "Stable IDs of active workspace members to look up in one batch."
        ),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Fetching member contexts",
      done: "Member contexts fetched",
    },
  },
] as const;

export const WORKSPACE_PEOPLE_SERVER = {
  serverInfo: {
    name: WORKSPACE_PEOPLE_SERVER_NAME,
    version: "1.0.0",
    description:
      "Look up workspace members: identity, role, job function, and group membership.",
    authorization: null,
    icon: "ActionPieChartIcon",
    documentationUrl: null,
  },
  tools: WORKSPACE_PEOPLE_TOOLS_METADATA,
} as const satisfies ServerMetadata;
