import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const OPENAI_USAGE_TOOL_NAME = "openai_usage" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const getCompletionsUsageSchema = {
  start_time: z
    .string()
    .describe(
      "Start date of the query time range (YYYY-MM-DD format), inclusive."
    ),
  end_time: z
    .string()
    .optional()
    .describe(
      "End date of the query time range (YYYY-MM-DD format), exclusive."
    ),
  bucket_width: z
    .enum(["1m", "1h", "1d"])
    .default("1m")
    .describe(
      "Width of each time bucket in response. Currently 1m, 1h and 1d are supported, defaults to 1m."
    ),
  api_key_ids: z
    .array(z.string())
    .optional()
    .describe("Return only usage for these API keys."),
  models: z
    .array(z.string())
    .optional()
    .describe("Return only usage for these models."),
  project_ids: z
    .array(z.string())
    .optional()
    .describe("Return only usage for these projects."),
  user_ids: z
    .array(z.string())
    .optional()
    .describe("Return only usage for these users."),
  batch: z
    .boolean()
    .optional()
    .describe(
      "If true, return batch jobs only. If false, return non-batch jobs only. By default, return both."
    ),
  group_by: z
    .array(z.enum(["model", "api_key_id", "project_id", "user_id", "batch"]))
    .optional()
    .describe(
      "Group the usage data by the specified fields. Support fields include project_id, user_id, api_key_id, model, batch or any combination of them."
    ),
  limit: z
    .number()
    .min(1)
    .describe(
      "Specifies the number of buckets to return. bucket_width=1d: default: 7, max: 31. bucket_width=1h: default: 24, max: 168. bucket_width=1m: default: 60, max: 1440."
    ),
  page: z
    .string()
    .optional()
    .describe(
      "A cursor for use in pagination. Corresponding to the next_page field from the previous response."
    ),
};

export const getOrganizationCostsSchema = {
  start_time: z
    .string()
    .describe(
      "Start date of the query time range (YYYY-MM-DD format), inclusive. Required."
    ),
  end_time: z
    .string()
    .optional()
    .describe(
      "End date of the query time range (YYYY-MM-DD format), exclusive. Optional."
    ),
  group_by: z
    .array(z.enum(["line_item", "project_id"]))
    .optional()
    .describe(
      "Group the costs by the specified fields. Support fields include project_id, line_item and any combination of them. Optional."
    ),
  limit: z
    .number()
    .min(1)
    .max(180)
    .default(7)
    .describe(
      "A limit on the number of buckets to be returned. Limit can range between 1 and 180, and the default is 7. Optional."
    ),
  page: z
    .string()
    .optional()
    .describe(
      "A cursor for use in pagination. Corresponding to the next_page field from the previous response. Optional."
    ),
  project_ids: z
    .array(z.string())
    .optional()
    .describe("Return only costs for these projects. Optional."),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const OPENAI_USAGE_TOOLS: MCPToolType[] = [
  {
    name: "get_completions_usage",
    description:
      "Get OpenAI completions usage data from the Usage API. Returns token usage, model requests, and other metrics.",
    inputSchema: zodToJsonSchema(
      z.object(getCompletionsUsageSchema)
    ) as JSONSchema,
  },
  {
    name: "get_organization_costs",
    description:
      "Get OpenAI organization cost data from the Costs API. Returns detailed cost breakdown by line items.",
    inputSchema: zodToJsonSchema(
      z.object(getOrganizationCostsSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const OPENAI_USAGE_SERVER_INFO = {
  name: "openai_usage" as const,
  version: "1.0.0",
  description: "Track API consumption and costs.",
  authorization: null,
  icon: "OpenaiLogo" as const,
  documentationUrl: null,
  instructions: null,
  developerSecretSelection: "required" as const,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const OPENAI_USAGE_TOOL_STAKES = {
  get_completions_usage: "low",
  get_organization_costs: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;
