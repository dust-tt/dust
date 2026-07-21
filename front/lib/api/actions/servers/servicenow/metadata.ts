import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const SERVICENOW_TOOLS_METADATA = [
  {
    name: "list_incidents",
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
] as const;

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
  tools: SERVICENOW_TOOLS_METADATA,
} as const satisfies ServerMetadata;
