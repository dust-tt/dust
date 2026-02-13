import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const USER_ASK_QUESTION_SERVER_NAME = "user_ask_question" as const;

export const USER_ASK_QUESTION_TOOLS_METADATA = createToolsRecord({
  ask_user_question: {
    description:
      "Ask the user a question with multiple-choice options. " +
      "The agent will pause until the user answers. " +
      "Use this when you need clarification or a decision from the user before proceeding.",
    schema: {
      question: z
        .string()
        .describe(
          "The question to ask the user. Should be clear and specific."
        ),
      options: z
        .array(
          z.object({
            label: z.string().describe("Short display text for this option."),
            description: z
              .string()
              .optional()
              .describe("Optional explanation of this option."),
          })
        )
        .min(2)
        .max(6)
        .describe("The available choices (2 to 6 options)."),
      allow_multiple: z
        .boolean()
        .optional()
        .describe(
          "Whether the user can select multiple options. Defaults to false."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Asking user...",
      done: "User answered",
    },
  },
});

export const USER_ASK_QUESTION_SERVER = {
  serverInfo: {
    name: USER_ASK_QUESTION_SERVER_NAME,
    version: "1.0.0",
    description: "Ask the user a question with multiple-choice options.",
    icon: "ActionAtomIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(USER_ASK_QUESTION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(USER_ASK_QUESTION_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
