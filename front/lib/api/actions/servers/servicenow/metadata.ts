import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SERVICENOW_TOOLS_METADATA = createToolsRecord({
  list_incidents: {
    description:
      "List ServiceNow incidents (tickets) in the connected instance. Supports filtering with a ServiceNow encoded query.",
    schema: {
      query: z
        .string()
        .optional()
        .describe(
          "ServiceNow encoded query (sysparm_query) to filter incidents, e.g. 'active=true^priority=1'."
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of incidents to return. Defaults to 25."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing ServiceNow incidents",
      done: "List ServiceNow incidents",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
});

export const SERVICENOW_SERVER = {
  serverInfo: {
    name: "servicenow",
    version: "1.0.0",
    description: "Read and manage incidents and records in ServiceNow.",
    authorization: {
      provider: "servicenow",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "ActionCloudArrowLeftRightIcon",
    documentationUrl: "https://docs.dust.tt/docs/servicenow",
  },
  tools: Object.values(SERVICENOW_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SERVICENOW_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
