import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { MAX_CONVERSATION_TITLE_LENGTH } from "@app/lib/api/assistant/conversation/constants";
import { z } from "zod";

export const COMMON_UTILITIES_SERVER_NAME = "common_utilities" as const;
export const SET_CONVERSATION_TITLE_TOOL_NAME =
  "set_conversation_title" as const;
export const MARK_CONVERSATION_READ_TOOL_NAME =
  "mark_conversation_read" as const;

const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;
const MAX_WAIT_DURATION_MS = 3 * 60 * 1_000;

export const COMMON_UTILITIES_TOOLS_METADATA = [
  {
    name: "generate_random_number",
    description:
      "Generate a random integer (whole number) between 1 and the provided maximum (inclusive). Pick a random number in a range.",
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "generate_random_float",
    description:
      "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Generating random float",
      done: "Generate random float",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "wait",
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "get_current_time",
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "math_operation",
    description:
      "Calculate the result of a math expression: arithmetic, percentages, and other mathematical operations.",
    schema: {
      expression: z
        .string()
        .describe("The math expression to evaluate, e.g. 15 percent of 240."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Calculating",
      done: "Calculate",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SET_CONVERSATION_TITLE_TOOL_NAME,
    description:
      "Update the title of the current conversation. Use this to give the conversation a descriptive name that summarizes its topic.",
    schema: {
      title: z
        .string()
        .min(1)
        .max(MAX_CONVERSATION_TITLE_LENGTH)
        .describe("The new title for the current conversation."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Setting conversation title",
      done: "Set conversation title",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: MARK_CONVERSATION_READ_TOOL_NAME,
    description:
      "Mark any conversation as read or unread for the current user. " +
      "Acts on the authenticated user's read state only. " +
      "If conversationId is omitted, the current agent conversation is used when available.",
    schema: {
      read: z
        .boolean()
        .describe("true = mark as read (clear unread); false = mark as unread"),
      conversationId: z
        .string()
        .optional()
        .describe(
          "Conversation id to update; defaults to the conversation this agent run is in when omitted"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Updating conversation read state",
      done: "Update conversation read state",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const COMMON_UTILITIES_SERVER = {
  serverInfo: {
    name: COMMON_UTILITIES_SERVER_NAME,
    version: "1.0.0",
    description:
      "Conversation helpers (titles, mark read), random numbers, timers, and other common utilities.",
    icon: "ActionAtomIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: COMMON_UTILITIES_TOOLS_METADATA,
} as const satisfies ServerMetadata;
