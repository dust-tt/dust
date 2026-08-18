import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { JOB_TYPES } from "@app/types/job_type";
import { z } from "zod";

export const WORKSPACE_PEOPLE_SERVER_NAME = "workspace_people" as const;

export const LIST_WORKSPACE_MEMBERS_TOOL_NAME =
  "list_workspace_members" as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const WORKSPACE_PEOPLE_TOOLS_METADATA = [
  {
    name: LIST_WORKSPACE_MEMBERS_TOOL_NAME,
    description:
      "List active workspace members with their identity, workspace role, job function, " +
      "and user-managed workspace groups. " +
      "Filter by userIds to look up specific members, or by jobType to list all members " +
      "with that job function. Exactly one filter must be provided. " +
      "Results are paginated — use nextPageCursor from the previous response to fetch the next page.",
    schema: {
      userIds: z
        .array(z.string())
        .min(1)
        .max(MAX_LIMIT)
        .optional()
        .describe("Stable IDs of specific active workspace members to look up."),
      jobType: z
        .enum(JOB_TYPES)
        .optional()
        .describe("List all active members with this job function."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .optional()
        .describe(
          `Maximum number of results to return. Defaults to ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`
        ),
      nextPageCursor: z
        .string()
        .optional()
        .describe(
          "Cursor for fetching the next page. Use the nextPageCursor from the previous response."
        ),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Listing workspace members",
      done: "Workspace members listed",
    },
  },
] as const;

export const WORKSPACE_PEOPLE_SERVER = {
  serverInfo: {
    name: WORKSPACE_PEOPLE_SERVER_NAME,
    version: "1.0.0",
    description:
      "List workspace members: identity, role, job function, and group membership.",
    authorization: null,
    icon: "ActionPieChartIcon",
    documentationUrl: null,
  },
  tools: WORKSPACE_PEOPLE_TOOLS_METADATA,
} as const satisfies ServerMetadata;

export { DEFAULT_LIMIT, MAX_LIMIT };
