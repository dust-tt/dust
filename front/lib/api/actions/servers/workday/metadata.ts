import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const WORKDAY_TOOLS_METADATA = [
  {
    name: "get_workers",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const satisfies readonly InternalMCPToolType[];

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
  tools: WORKDAY_TOOLS_METADATA,
} as const satisfies ServerMetadata;
