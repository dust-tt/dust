import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const COMMON_UTILITIES_SERVER_NAME = "common_utilities" as const;

const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;
const MAX_WAIT_DURATION_MS = 3 * 60 * 1_000;

export const COMMON_UTILITIES_TOOLS_METADATA = createToolsRecord({
  generate_random_number: {
    description:
      "Generate a random positive number between 1 and the provided maximum (inclusive).",
    schema: {
      max: z
        .number()
        .int()
        .positive()
        .describe(
          `Upper bound for the generated integer. Defaults to ${RANDOM_INTEGER_DEFAULT_MAX}.`
        )
        .optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Generating random number",
      done: "Generate random number",
    },
  },
  generate_random_float: {
    description:
      "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Generating random float",
      done: "Generate random float",
    },
  },
  wait: {
    description: `Pause execution for the provided number of milliseconds (maximum ${MAX_WAIT_DURATION_MS}).`,
    schema: {
      duration_ms: z
        .number()
        .int()
        .positive()
        .max(
          MAX_WAIT_DURATION_MS,
          `Duration must be less than or equal to ${MAX_WAIT_DURATION_MS} milliseconds (3 minutes).`
        )
        .describe("The time to wait in milliseconds, up to 3 minutes."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Waiting",
      done: "Wait",
    },
  },
  get_current_time: {
    description:
      "Return the current date and time in multiple convenient formats.",
    schema: {
      include_formats: z
        .array(
          z
            .enum(["iso", "utc", "timestamp", "locale"])
            .describe("Specify which formats to return. Defaults to all.")
        )
        .max(4)
        .optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting current time",
      done: "Get current time",
    },
  },
  math_operation: {
    description: "Perform mathematical operations.",
    schema: {
      expression: z.string().describe("The expression to evaluate. "),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Calculating",
      done: "Calculate",
    },
  },
});

export const COMMON_UTILITIES_SERVER = {
  serverInfo: {
    name: COMMON_UTILITIES_SERVER_NAME,
    version: "1.0.0",
    description: "Utilities for common tasks.",
    icon: "ActionAtomIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(COMMON_UTILITIES_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(COMMON_UTILITIES_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
