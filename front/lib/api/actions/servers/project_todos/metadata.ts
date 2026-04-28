import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_TODOS_SERVER_NAME = "project_todos" as const;

export const PROJECT_TODOS_TOOLS_METADATA = createToolsRecord({
  list_todos: {
    description:
      "List TODOs in the project. " +
      "Defaults to the current user's TODOs (assigneeFilter='mine') and open (statusFilter='open') items. ",
    schema: {
      assigneeFilter: z
        .enum(["mine", "all"])
        .default("mine")
        .optional()
        .describe(
          "Which TODOs to return. 'mine' = only the current user's TODOs (default); 'all' = all TODOs."
        ),
      statusFilter: z
        .enum(["open", "done", "all"])
        .default("open")
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
  create_todos: {
    description: "Create one or more new TODOs at once in the project.",
    schema: {
      creatorType: z
        .enum(["user", "agent"])
        .describe(
          "Who has the initiative of creating the TODOs ? Use 'user' when the user explicitely asked for it."
        ),
      todos: z
        .array(
          z.object({
            text: z.string().min(1).describe("The TODO description."),
            userId: z
              .string()
              .optional()
              .describe(
                "The sId of the user to assign the TODO to, must be a member of the Project. Default to the current user."
              ),
            doneRationale: z
              .string()
              .optional()
              .describe(
                "The rationale for marking the TODO as done. Left empty if the TODO should not be marked as done."
              ),
          })
        )
        .min(1)
        .max(30)
        .describe("List of TODOs to create (max 30)."),
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
    description: "Mark one or more of the current user's TODOs as done.",
    schema: {
      actorType: z
        .enum(["user", "agent"])
        .describe(
          "Who has the initiative of marking the TODO as done ? Use 'user' when the user explicitely asked for it."
        ),
      todoIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("List of TODO sIds to mark as done."),
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
      running: "Marking TODOs as done",
      done: "Mark TODOs as done",
    },
  },
  update_todo: {
    description: "Update a TODO.",
    schema: {
      todoId: z.string().describe("The sId of the TODO."),
      text: z.string().optional().describe("The new TODO description."),
      userId: z
        .string()
        .optional()
        .describe(
          "The sId of the user to assign the TODO to, must be a member of the Project. Default to the current user."
        ),
      doneRationale: z
        .string()
        .optional()
        .describe(
          "The rationale for marking the TODO as done. Left empty if the TODO should not be marked as done."
        ),
      status: z
        .enum(["todo", "in_progress", "done"])
        .optional()
        .describe("The new TODO status. Default to the current status."),

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
      running: "Updating TODO",
      done: "Update TODO",
    },
  },
  start_todo_agent: {
    description:
      "Start an agent conversation to work on one of your 'to_do' TODOs. " +
      "If already started, it reuses the existing linked conversation.",
    schema: {
      todoId: z.string().describe("The sId of the TODO to start working on."),
      agentName: z
        .string()
        .min(3)
        .optional()
        .describe(
          "Optional agent name. If provided, the tool searches matching agent configurations and uses the best match. Defaults to Dust."
        ),
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
      running: "Starting TODO work",
      done: "Start TODO work",
    },
  },
});

export const PROJECT_TODOS_SERVER = {
  serverInfo: {
    name: PROJECT_TODOS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Manage the current user's project TODOs: list, create, and complete personal action items.",
    icon: "ActionListCheckIcon",
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
