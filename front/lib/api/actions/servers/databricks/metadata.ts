import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const DATABRICKS_TOOLS_METADATA = [
  {
    name: "list_warehouses",
    description:
      "List all SQL warehouses available in the Databricks workspace.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing warehouses on Databricks",
      done: "List warehouses on Databricks",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const satisfies readonly InternalMCPToolType[];

export const DATABRICKS_SERVER = {
  serverInfo: {
    name: "databricks",
    version: "1.0.0",
    description: "Execute SQL queries and manage databases in Databricks SQL.",
    authorization: {
      provider: "databricks",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "ActionTableIcon",
    documentationUrl: "https://docs.dust.tt/docs/databricks",
  },
  tools: DATABRICKS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
