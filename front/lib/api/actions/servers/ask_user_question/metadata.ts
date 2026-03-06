import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ASK_USER_QUESTION_TOOLS_METADATA = createToolsRecord({
  ask_user_question: {
    description:
      "Ask the user one or more questions with multiple-choice options.\n\n" +
      "Use this tool when:\n" +
      "- The user's request could apply to several known entities and asking " +
      "narrows the work significantly. For example: 'What's the weather at " +
      "the office?' when the company has offices in Paris, SF, and NY: ask " +
      "which office instead of looking up all three.\n" +
      "- A piece of information is missing and you can enumerate the likely " +
      "options (e.g. which project, which account, which time range).\n" +
      "- You need a decision that determines what you do next " +
      "(e.g. deploy target, auth method, output format).\n" +
      "- Doing the work for every possibility would be noticeably slower or " +
      "noisier than asking one quick question first.\n\n" +
      "Formatting:\n" +
      "- List the recommended option first with '(Recommended)' in its label.\n" +
      "- The user always gets an automatic 'Other' option for free-text input.",
    schema: {
      questions: z
        .array(
          z.object({
            question: z
              .string()
              .describe("The question text. Should be clear and specific."),
            header: z
              .string()
              .max(12)
              .describe(
                "Short chip/tag label for this question, max 12 chars " +
                  "(e.g. 'Auth method', 'Format')."
              ),
            options: z
              .array(
                z.object({
                  label: z
                    .string()
                    .describe(
                      "Concise choice text, 1–5 words. " +
                        "Recommended option should include '(Recommended)'."
                    ),
                  description: z
                    .string()
                    .describe("Explanation of this option."),
                  preview: z
                    .string()
                    .optional()
                    .describe(
                      "Optional markdown rendered in a monospace box for " +
                        "visual comparisons (code snippets, ASCII mockups)."
                    ),
                })
              )
              .min(2)
              .max(4)
              .describe("The available choices (2 to 4 options)."),
            multi_select: z
              .boolean()
              .describe(
                "Whether the user can select multiple options for this question."
              ),
          })
        )
        .min(1)
        .max(4)
        .describe("The questions to ask (1 to 4)."),
      metadata: z
        .record(z.unknown())
        .optional()
        .describe("Optional analytics/tracking metadata."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Asking user...",
      done: "User answered",
    },
  },
});

export const ASK_USER_QUESTION_SERVER = {
  serverInfo: {
    name: "ask_user_question",
    version: "1.0.0",
    description: "Ask the user questions with multiple-choice options.",
    icon: "ActionAtomIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(ASK_USER_QUESTION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(ASK_USER_QUESTION_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
