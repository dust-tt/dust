import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const DATABRICKS_TOOL_NAME = "databricks" as const;

export const listWarehousesSchema = {};

export const DATABRICKS_TOOLS: MCPToolType[] = [
  {
    name: "list_warehouses",
    description:
      "List all SQL warehouses available in the Databricks workspace.",
    inputSchema: zodToJsonSchema(z.object(listWarehousesSchema)) as JSONSchema,
  },
];

export const DATABRICKS_SERVER_INFO = {
  name: "databricks" as const,
  version: "1.0.0",
  description: "Execute SQL queries and manage databases in Databricks SQL.",
  authorization: {
    provider: "databricks" as const,
    supported_use_cases: [
      "platform_actions",
      "personal_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "ActionTableIcon" as const,
  documentationUrl: "https://docs.dust.tt/docs/databricks",
  instructions: null,
};

export const DATABRICKS_TOOL_STAKES = {
  list_warehouses: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
