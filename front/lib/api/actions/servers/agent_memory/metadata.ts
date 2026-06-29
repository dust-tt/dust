import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const AGENT_MEMORY_SERVER_NAME = "agent_memory" as const;
export const AGENT_MEMORY_RETRIEVE_TOOL_NAME = "retrieve";
export const AGENT_MEMORY_RECORD_TOOL_NAME = "record_entries";
export const AGENT_MEMORY_ERASE_TOOL_NAME = "erase_entries";
export const AGENT_MEMORY_EDIT_TOOL_NAME = "edit_entries";
export const AGENT_MEMORY_COMPACT_TOOL_NAME = "compact_memory";

export const AGENT_MEMORY_TOOLS_METADATA = createToolsRecord({
  [AGENT_MEMORY_RETRIEVE_TOOL_NAME]: {
    description:
      "Read and recall the current user's saved agent memory: what the agent remembers about them, including preferences, facts, notes, and prior context.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving memories",
      done: "Retrieve memories",
    },
  },
  [AGENT_MEMORY_RECORD_TOOL_NAME]: {
    description:
      "Save or remember new user memory entries, such as preferences, facts, instructions, or notes to use later.",
    schema: {
      entries: z
        .array(z.string())
        .describe(
          "New memory entries to save for the user. Use one concise string per preference, fact, instruction, or note."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Recording memories",
      done: "Record memories",
    },
  },
  [AGENT_MEMORY_ERASE_TOOL_NAME]: {
    description:
      "Forget, delete, or remove existing memory entries, obsolete facts, preferences, or outdated memories.",
    schema: {
      indexes: z
        .array(z.number())
        .describe(
          "The displayed indexes of the memory entries to forget or delete."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Erasing memory entries",
      done: "Erase memory entries",
    },
  },
  [AGENT_MEMORY_EDIT_TOOL_NAME]: {
    description:
      "Change, update, correct, or rewrite existing memory entries by displayed index. Use when a saved memory should say something different.",
    schema: {
      edits: z
        .array(
          z.object({
            index: z
              .number()
              .describe("The displayed index of the memory entry to change."),
            content: z
              .string()
              .describe("The replacement content the memory entry should say."),
          })
        )
        .describe("The memory entry edits to apply."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Editing memory entries",
      done: "Edit memory entries",
    },
  },
  [AGENT_MEMORY_COMPACT_TOOL_NAME]: {
    description:
      "Compact, deduplicate, and summarize memory by merging duplicate memories or shortening long memory entries.",
    schema: {
      edits: z
        .array(
          z.object({
            index: z
              .number()
              .describe(
                "The displayed index of the memory entry to compact or replace."
              ),
            content: z
              .string()
              .describe(
                "The compacted replacement content after deduplicating or summarizing memory."
              ),
          })
        )
        .describe("The compaction edits to apply."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Compacting memory",
      done: "Compact memory",
    },
  },
});

export const AGENT_MEMORY_SERVER = {
  serverInfo: {
    name: AGENT_MEMORY_SERVER_NAME,
    version: "1.0.0",
    description: "User-scoped long-term memory tools for agents.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
  },
  tools: Object.values(AGENT_MEMORY_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AGENT_MEMORY_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
