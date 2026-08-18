import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { timeWindowSchemaShape } from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { MIN_USERS_FOR_ANONYMITY } from "@app/lib/api/assistant/observability/anonymity";
import { JOB_TYPES } from "@app/types/job_type";
import { z } from "zod";

export const USER_ANALYTICS_SERVER_NAME = "user_analytics" as const;

export const GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME =
  "get_workspace_members_context" as const;

export const USER_ANALYTICS_TOOLS_METADATA = [
  {
    name: GET_WORKSPACE_MEMBERS_CONTEXT_TOOL_NAME,
    description:
      "Get admin-visible directory context for a batch of active workspace " +
      "members: identity, workspace role, job function, and user-managed " +
      "workspace groups. This does not return private activity or connected-source " +
      "data. Only workspace admins may use this tool.",
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
  {
    name: "get_personal_usage",
    description:
      "Get the authenticated user's personal usage over a time window " +
      "(defaults to the last 30 days): top agents, top skills, and top tools " +
      "ranked by execution count. Set jobType to instead " +
      "get aggregated usage across all workspace " +
      "members sharing that job type — only returned when at least " +
      `${MIN_USERS_FOR_ANONYMITY} members share it, to keep ` +
      "individuals anonymous.",
    schema: {
      ...timeWindowSchemaShape,
      jobType: z
        .enum(JOB_TYPES)
        .optional()
        .describe(
          "When set, return aggregated usage for all workspace members with " +
            "this job type instead of the caller's own usage. Only returned " +
            `when at least ${MIN_USERS_FOR_ANONYMITY} members ` +
            "share the job type, to keep individuals anonymous."
        ),
    },
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Fetching your usage",
      done: "Fetched your usage",
    },
  },
  {
    name: "get_workspace_activity",
    description:
      "Get anonymized workspace-wide activity over the last 30 days: " +
      "most popular agents by usage rank and trending skills. No individual " +
      "user attribution, and only returned when at least " +
      `${MIN_USERS_FOR_ANONYMITY} users were active, to keep individuals ` +
      "anonymous.",
    schema: {},
    stake: "never_ask",
    toolCostCategory: "basic",
    freeUsage: true,
    displayLabels: {
      running: "Fetching workspace activity",
      done: "Fetched workspace activity",
    },
  },
] as const;

export const USER_ANALYTICS_SERVER = {
  serverInfo: {
    name: USER_ANALYTICS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Fetch workspace member context, personal usage stats, and anonymized workspace activity data.",
    authorization: null,
    icon: "ActionPieChartIcon",
    documentationUrl: null,
  },
  tools: USER_ANALYTICS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
