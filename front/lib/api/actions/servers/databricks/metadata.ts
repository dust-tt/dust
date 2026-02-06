import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const DATABRICKS_TOOL_NAME = "databricks" as const;

export const DATABRICKS_TOOLS_METADATA = createToolsRecord({
  list_warehouses: {
    description:
      "List all SQL warehouses available in the Databricks workspace.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing warehouses on Databricks",
      done: "List warehouses on Databricks",
    },
  },
});

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
    instructions: null,
  },
  tools: Object.values(DATABRICKS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(DATABRICKS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
