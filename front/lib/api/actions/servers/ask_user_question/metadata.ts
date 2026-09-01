import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { UserQuestionSchema } from "@app/lib/actions/types";

export const ASK_USER_QUESTION_TOOLS_METADATA = [
  {
    name: "ask_user_question",
    description:
      "Ask the user a question during execution.\n\n" +
      "This tool can serve multiple purposes:\n" +
      "- Clarify ambiguous instructions where multiple interpretations are plausible\n" +
      "- Validate major decisions before moving forward\n" +
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
      "at the end of its label\n" +
      "- When the question asks the user to review, confirm, or validate specific content you have " +
      "prepared (e.g. a draft message, email, Slack post, or payload), you MUST put that full content in " +
      'the "content" field (as markdown) so it is displayed to the user before they answer. Do not ask the ' +
      'user to confirm something (e.g. "Does this look right?") without providing the content it refers to.',
    schema: {
      ...UserQuestionSchema.shape,
    },
    enableAlerting: true,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Asking user...",
      done: "User answered",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const ASK_USER_QUESTION_SERVER = {
  serverInfo: {
    name: "ask_user_question",
    version: "1.0.0",
    description: "Ask the user a question with multiple-choice options.",
    icon: "ActionChatBubbleThoughtIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: ASK_USER_QUESTION_TOOLS_METADATA,
} as const satisfies ServerMetadata;
