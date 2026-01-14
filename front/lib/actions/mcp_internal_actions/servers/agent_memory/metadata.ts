import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const AGENT_MEMORY_TOOL_NAME = "agent_memory" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const retrieveSchema = {};

export const recordEntriesSchema = {
  entries: z
    .array(z.string())
    .describe("The array of new memory entries to record."),
};

export const eraseEntriesSchema = {
  indexes: z
    .array(z.number())
    .describe("The indexes of the memory entries to erase."),
};

export const editEntriesSchema = {
  edits: z
    .array(
      z.object({
        index: z
          .number()
          .describe("The index of the memory entry to overwrite."),
        content: z.string().describe("The new content for the memory entry."),
      })
    )
    .describe("The array of memory entries to edit."),
};

export const compactMemorySchema = {
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
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const AGENT_MEMORY_TOOLS: MCPToolType[] = [
  {
    name: "retrieve",
    description: "Retrieve all agent memories for the current user.",
    inputSchema: zodToJsonSchema(z.object(retrieveSchema)) as JSONSchema,
  },
  {
    name: "record_entries",
    description: "Record new memory entries for the current user.",
    inputSchema: zodToJsonSchema(z.object(recordEntriesSchema)) as JSONSchema,
  },
  {
    name: "erase_entries",
    description: "Erase memory entries by indexes for the current user.",
    inputSchema: zodToJsonSchema(z.object(eraseEntriesSchema)) as JSONSchema,
  },
  {
    name: "edit_entries",
    description:
      "Edit (overwrite) memory entries by indexes for the current user.",
    inputSchema: zodToJsonSchema(z.object(editEntriesSchema)) as JSONSchema,
  },
  {
    name: "compact_memory",
    description:
      "Compact the memory by removing duplicate entries and summarizing long entries for the current user.",
    inputSchema: zodToJsonSchema(z.object(compactMemorySchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const AGENT_MEMORY_SERVER_INFO = {
  name: "agent_memory" as const,
  version: "1.0.0",
  description: "User-scoped long-term memory tools for agents.",
  authorization: null,
  icon: "ActionLightbulbIcon" as const,
  documentationUrl: null,
  instructions: null,
};
