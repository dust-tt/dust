import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DEFAULT_RESULTS,
  MAX_RESULTS,
  timeWindowSchemaShape,
  usageFilterSchema,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const topListSchema = (entityPlural: string) => ({
  ...timeWindowSchemaShape,
  ...usageFilterSchema,
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_RESULTS)
    .optional()
    .describe(
      `Maximum number of ${entityPlural} to return ` +
        `(default ${DEFAULT_RESULTS}, max ${MAX_RESULTS}).`
    ),
});

const getTopAgentsSchema = topListSchema("agents");
const getTopUsersSchema = topListSchema("users");
const getTopSkillsSchema = topListSchema("skills");
const getTopToolsSchema = topListSchema("tools");

const getAgentDetailsSchema = {
  agentId: z
    .string()
    .describe(
      "The agent's id (sId), as returned by get_top_agents or other tools."
    ),
};

export const WORKSPACE_ANALYTICS_TOOLS_METADATA = createToolsRecord({
  get_top_agents: {
    description:
      "Return the workspace's agents over a time window (defaults to the " +
      "current calendar month), ranked by number of messages, with the number " +
      "of unique users for each. Each row includes the agent's id. Optionally " +
      "filter by source (context_origin), agent, or user. Use this to answer " +
      "which agents are used most. Admin-only.",
    schema: getTopAgentsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top agents",
      done: "Retrieved top agents",
    },
  },
  get_top_users: {
    description:
      "Return the workspace's most active users over a time window (defaults " +
      "to the current calendar month), ranked by number of messages sent, " +
      "with the count of distinct agents each used. Each row includes the " +
      "user's id. Optionally filter by source (context_origin), agent, or " +
      "user. Use this to answer who the most active users are. Admin-only.",
    schema: getTopUsersSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top users",
      done: "Retrieved top users",
    },
  },
  get_agent_details: {
    description:
      "Return an agent's full configuration: name, description, scope, model, " +
      "equipped skills and tools, and its complete instructions (system " +
      "prompt). Use this after a usage tool to explain what a heavily-used " +
      "agent actually does. Takes the agent id returned by other tools. " +
      "Admin-only.",
    schema: getAgentDetailsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving agent details",
      done: "Retrieved agent details",
    },
  },
  get_top_skills: {
    description:
      "Return the workspace's most-used skills over a time window (defaults " +
      "to the current calendar month), ranked by execution count. Optionally " +
      "filter by source (context_origin), agent, or user. Use this to answer " +
      "which skills are used most. Admin-only.",
    schema: getTopSkillsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top skills",
      done: "Retrieved top skills",
    },
  },
  get_top_tools: {
    description:
      "Return the workspace's most-used tools (by MCP server) over a time " +
      "window (defaults to the current calendar month), ranked by execution " +
      "count. Optionally filter by source (context_origin), agent, or user. " +
      "Use this to answer which tools are used most. Admin-only.",
    schema: getTopToolsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving top tools",
      done: "Retrieved top tools",
    },
  },
});

export const WORKSPACE_ANALYTICS_SERVER = {
  serverInfo: {
    name: "workspace_analytics",
    version: "1.0.0",
    description:
      "Answer workspace usage questions for admins (top agents, and more to " +
      "come).",
    icon: "ActionPieChartIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(WORKSPACE_ANALYTICS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(WORKSPACE_ANALYTICS_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
