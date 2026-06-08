import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  timeWindowSchemaShape,
  usageFilterSchema,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const getTopAgentsSchema = {
  ...timeWindowSchemaShape,
  ...usageFilterSchema,
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximum number of agents to return (default 25, max 100)."),
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
