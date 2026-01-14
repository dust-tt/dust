import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// Re-export tool names for use by other modules.
export { GET_MENTION_MARKDOWN_TOOL_NAME, SEARCH_AVAILABLE_USERS_TOOL_NAME };

// Tool names.
export const GENERATE_RANDOM_NUMBER_TOOL_NAME = "generate_random_number";
export const GENERATE_RANDOM_FLOAT_TOOL_NAME = "generate_random_float";
export const WAIT_TOOL_NAME = "wait";
export const GET_CURRENT_TIME_TOOL_NAME = "get_current_time";
export const MATH_OPERATION_TOOL_NAME = "math_operation";

// Constants.
export const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;
export const MAX_WAIT_DURATION_MS = 3 * 60 * 1_000;

export const generateRandomNumberSchema = {
  max: z
    .number()
    .int()
    .positive()
    .describe(
      `Upper bound for the generated integer. Defaults to ${RANDOM_INTEGER_DEFAULT_MAX}.`
    )
    .optional(),
};

export const generateRandomFloatSchema = {};

export const waitSchema = {
  duration_ms: z
    .number()
    .int()
    .positive()
    .max(
      MAX_WAIT_DURATION_MS,
      `Duration must be less than or equal to ${MAX_WAIT_DURATION_MS} milliseconds (3 minutes).`
    )
    .describe("The time to wait in milliseconds, up to 3 minutes."),
};

export const getCurrentTimeSchema = {
  include_formats: z
    .array(
      z
        .enum(["iso", "utc", "timestamp", "locale"])
        .describe("Specify which formats to return. Defaults to all.")
    )
    .max(4)
    .optional(),
};

export const mathOperationSchema = {
  expression: z.string().describe("The expression to evaluate. "),
};

export const searchAvailableUsersSchema = {
  searchTerm: z
    .string()
    .describe(
      "A single search term to find users. Returns all the users that contain the search term in their name or description. Use an empty string to return all items."
    ),
};

export const getMentionMarkdownSchema = {
  mention: z
    .object({
      id: z.string(),
      label: z.string(),
    })
    .describe("A mention to get the markdown directive for."),
};

export const COMMON_UTILITIES_TOOLS: MCPToolType[] = [
  {
    name: GENERATE_RANDOM_NUMBER_TOOL_NAME,
    description:
      "Generate a random positive number between 1 and the provided maximum (inclusive).",
    inputSchema: zodToJsonSchema(
      z.object(generateRandomNumberSchema)
    ) as JSONSchema,
  },
  {
    name: GENERATE_RANDOM_FLOAT_TOOL_NAME,
    description:
      "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
    inputSchema: zodToJsonSchema(
      z.object(generateRandomFloatSchema)
    ) as JSONSchema,
  },
  {
    name: WAIT_TOOL_NAME,
    description: `Pause execution for the provided number of milliseconds (maximum ${MAX_WAIT_DURATION_MS}).`,
    inputSchema: zodToJsonSchema(z.object(waitSchema)) as JSONSchema,
  },
  {
    name: GET_CURRENT_TIME_TOOL_NAME,
    description:
      "Return the current date and time in multiple convenient formats.",
    inputSchema: zodToJsonSchema(z.object(getCurrentTimeSchema)) as JSONSchema,
  },
  {
    name: MATH_OPERATION_TOOL_NAME,
    description: "Perform mathematical operations.",
    inputSchema: zodToJsonSchema(z.object(mathOperationSchema)) as JSONSchema,
  },
  {
    name: SEARCH_AVAILABLE_USERS_TOOL_NAME,
    description: "Search for users that are available to the conversation.",
    inputSchema: zodToJsonSchema(
      z.object(searchAvailableUsersSchema)
    ) as JSONSchema,
  },
  {
    name: GET_MENTION_MARKDOWN_TOOL_NAME,
    description:
      "Get the markdown directive to use to mention a user in a message.",
    inputSchema: zodToJsonSchema(
      z.object(getMentionMarkdownSchema)
    ) as JSONSchema,
  },
];

export const COMMON_UTILITIES_SERVER_INFO = {
  name: "common_utilities" as const,
  version: "1.0.0",
  description:
    "Miscellaneous helper tools such as random numbers, time retrieval, and timers.",
  icon: "ActionAtomIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};
