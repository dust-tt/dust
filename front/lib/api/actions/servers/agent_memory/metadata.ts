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
    description: "Retrieve all agent memories for the current user",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving memories",
      done: "Retrieve memories",
    },
  },
  [AGENT_MEMORY_RECORD_TOOL_NAME]: {
    description: "Record new memory entries for the current user",
    schema: {
      entries: z
        .array(z.string())
        .describe("The array of new memory entries to record."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Recording memories",
      done: "Record memories",
    },
  },
  [AGENT_MEMORY_ERASE_TOOL_NAME]: {
    description: "Erase memory entries by indexes for the current user",
    schema: {
      indexes: z
        .array(z.number())
        .describe("The indexes of the memory entries to erase."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Erasing memory entries",
      done: "Erase memory entries",
    },
  },
  [AGENT_MEMORY_EDIT_TOOL_NAME]: {
    description:
      "Edit (overwrite) memory entries by indexes for the current user",
    schema: {
      edits: z
        .array(
          z.object({
            index: z
              .number()
              .describe("The index of the memory entry to overwrite."),
            content: z
              .string()
              .describe("The new content for the memory entry."),
          })
        )
        .describe("The array of memory entries to edit."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Editing memory entries",
      done: "Edit memory entries",
    },
  },
  [AGENT_MEMORY_COMPACT_TOOL_NAME]: {
    description:
      "Compact the memory by removing duplicate entries and summarizing long entries for the current user",
    schema: {
      edits: z
        .array(
          z.object({
            index: z
              .number()
              .describe("The index of the memory entry to overwrite."),
            content: z
              .string()
              .describe("The new compacted content for the memory entry."),
          })
        )
        .describe("The array of memory entries to compact/edit."),
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
    instructions: null,
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
