import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const USER_MEMORY_SERVER_NAME = "user_memory" as const;
export const USER_MEMORY_READ_TOOL_NAME = "read";
export const USER_MEMORY_EDIT_TOOL_NAME = "edit";

export const USER_MEMORY_TOOLS_METADATA = [
  {
    name: USER_MEMORY_READ_TOOL_NAME,
    description:
      "Read and recall the current user's personal memory: the full contents of their personal MEMORY.md, including preferences, facts, notes, and prior context.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Reading memory",
      done: "Read memory",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: USER_MEMORY_EDIT_TOOL_NAME,
    description:
      "Update, change, correct, add, or delete text in the current user's personal memory by replacing an exact snippet of their MEMORY.md with new text.",
    schema: {
      oldStr: z
        .string()
        .describe(
          "The exact, contiguous text to find in the user's personal memory and replace. It must match a unique span of the current memory. Pass an empty string to initialize memory that is currently empty."
        ),
      newStr: z
        .string()
        .describe(
          "The replacement text. Pass an empty string to delete the matched text."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Editing memory",
      done: "Edit memory",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const USER_MEMORY_SERVER = {
  serverInfo: {
    name: USER_MEMORY_SERVER_NAME,
    version: "1.0.0",
    description:
      "Store and retrieve the current user's personal memory in a single MEMORY.md file, shared across the user's agents.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
  },
  tools: USER_MEMORY_TOOLS_METADATA,
} as const satisfies ServerMetadata;
