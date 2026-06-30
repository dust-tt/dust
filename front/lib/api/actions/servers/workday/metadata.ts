import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const WORKDAY_TOOLS_METADATA = createToolsRecord({
  get_workers: {
    description:
      "List workers from Workday. Returns each worker's name and ID along with the total count.",
    schema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of workers to return (default 20)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing workers on Workday",
      done: "Listed workers on Workday",
    },
  },
});

export const WORKDAY_SERVER = {
  serverInfo: {
    name: "workday",
    version: "1.0.0",
    description: "Access Workday HCM and Financials data.",
    authorization: {
      provider: "mcp_static",
      supported_use_cases: ["platform_actions"],
      scope: "Staffing Financials System",
    },
    icon: "ActionTableIcon",
    documentationUrl: "https://docs.dust.tt/docs/workday",
  },
  tools: Object.values(WORKDAY_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(WORKDAY_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
