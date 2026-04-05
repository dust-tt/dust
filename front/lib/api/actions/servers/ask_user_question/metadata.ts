import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { UserQuestionSchema } from "@app/lib/actions/types";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ASK_USER_QUESTION_TOOLS_METADATA = createToolsRecord({
  ask_user_question: {
    description:
      "Asks the user a question during execution.\n\n" +
      "This tool can serve multiple purposes:\n" +
      "- Clarify ambiguous instructions where multiple interpretations are plausible\n" +
      "- Validate major decision before moving forward\n" +
      "- Get more context and information on the user's intent\n" +
      "- Make decisions on the desired course of action while working\n" +
      "- Let the user choose what direction to take\n\n" +
      "Examples of situations where this tool should be used:\n" +
      "- When about to take a consequential action (e.g., sending an email, deleting records, posting to Slack), " +
      "and the scope or target is unclear, it's much better to ask once than to act on a wrong assumption. " +
      'Example: "Should I send this to the whole team or just the manager?"\n' +
      "- When some required input parameters or data is missing and cannot be reliably inferred from context. " +
      'Example: "Which time zone should I use for scheduling this?\n' +
      "- When there are two or more valid interpretations that would lead to different outputs, rather than " +
      "picking one arbitrarily or exploring all possible options, surfacing the tradeoff is faster and more helpful " +
      'to the user. Example: "Do you want a detailed breakdown by country, or a single aggregated number?"\n\n' +
      "Important notes:\n" +
      "- The user always gets an automatic option for free-text input\n" +
      "- Use multiSelect: true to allow multiple answers to be selected for a question\n" +
      '- If a specific option is recommended, it should be the first option in the list and have "(Recommended)" ' +
      "at the end of its label",
    schema: {
      ...UserQuestionSchema.shape,
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
    description: "Ask the user a question with multiple-choice options.",
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
