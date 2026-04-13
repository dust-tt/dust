import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { PROJECT_TODO_CATEGORIES } from "@app/types/project_todo";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_TODOS_SERVER_NAME = "project_todos" as const;

export const PROJECT_TODOS_TOOLS_METADATA = createToolsRecord({
  list_todos: {
    description:
      "List the current user's TODOs in the project. " +
      "Defaults to open (todo + in_progress) items. " +
      "Use status='done' to see completed items, or status='all' for everything.",
    schema: {
      status: z
        .enum(["open", "done", "all"])
        .optional()
        .describe(
          "Which TODOs to return. 'open' = todo + in_progress (default); 'done' = completed; 'all' = everything."
        ),
      daysAgo: z
        .number()
        .min(1)
        .max(90)
        .optional()
        .describe(
          "When status is 'done' or 'all', limit completed TODOs to this many days back. Defaults to 7."
        ),
      category: z
        .enum(PROJECT_TODO_CATEGORIES)
        .optional()
        .describe("Filter by category."),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to list TODOs from, will fallback to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing TODOs",
      done: "List TODOs",
    },
  },
  create_todo: {
    description: "Create a new TODO for the current user in the project.",
    schema: {
      text: z.string().min(1).describe("The TODO description."),
      category: z
        .enum(PROJECT_TODO_CATEGORIES)
        .optional()
        .describe(
          "Category. Defaults to 'follow_ups'. " +
            "need_attention: urgent items requiring immediate action; " +
            "key_decisions: decisions to track or make; " +
            "follow_ups: action items to follow up on; " +
            "notable_updates: things to note or remember."
        ),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to create the TODO in, will fallback to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating TODO",
      done: "Create TODO",
    },
  },
  create_todos_batch: {
    description:
      "Create multiple TODOs at once for the current user in the project. " +
      "Useful for extracting action items from meeting notes or conversation summaries.",
    schema: {
      todos: z
        .array(
          z.object({
            text: z.string().min(1).describe("The TODO description."),
            category: z
              .enum(PROJECT_TODO_CATEGORIES)
              .optional()
              .describe("Category. Defaults to 'follow_ups'."),
          })
        )
        .min(1)
        .max(20)
        .describe("List of TODOs to create (max 20)."),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to create the TODOs in, will fallback to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating TODOs",
      done: "Create TODOs",
    },
  },
  mark_todo_done: {
    description: "Mark one of the current user's TODOs as done.",
    schema: {
      todoId: z.string().describe("The sId of the TODO to mark as done."),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to look up the TODO in, will fallback to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Marking TODO as done",
      done: "Mark TODO as done",
    },
  },
  reopen_todo: {
    description:
      "Reopen one of the current user's completed TODOs, moving it back to open status.",
    schema: {
      todoId: z.string().describe("The sId of the TODO to reopen."),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to look up the TODO in, will fallback to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Reopening TODO",
      done: "Reopen TODO",
    },
  },
});

export const PROJECT_TODOS_SERVER = {
  serverInfo: {
    name: PROJECT_TODOS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Manage the current user's project TODOs: list, create, and complete personal action items.",
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(PROJECT_TODOS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PROJECT_TODOS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
