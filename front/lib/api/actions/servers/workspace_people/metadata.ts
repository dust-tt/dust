import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { JOB_TYPES } from "@app/types/job_type";
import { z } from "zod";

export const WORKSPACE_PEOPLE_SERVER_NAME = "workspace_people" as const;

export const GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME =
  "get_workspace_members_context" as const;

export const WORKSPACE_PEOPLE_TOOLS_METADATA = [
  {
    name: GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME,
    description:
      "Get directory context for active workspace members: identity, workspace role, " +
      "job function, and user-managed workspace groups. " +
      "Filter by userIds to look up specific members, or by jobType to list all " +
      "members with that job function. Exactly one filter must be provided. " +
      "Returns up to 100 results.",
    schema: {
      userIds: z
        .array(z.string())
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Stable IDs of specific active workspace members to look up."
        ),
      jobType: z
        .enum(JOB_TYPES)
        .optional()
        .describe(
          "Return all active members with this job function (up to 100)."
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
