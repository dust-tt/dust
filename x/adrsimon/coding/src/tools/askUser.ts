import type { Tool, ToolContext } from "./index.js";

export function askUserTool(context: ToolContext): Tool {
  return {
    name: "ask_user",
    description:
      "Ask the user a question and wait for their response. " +
      "Use this when you need clarification, approval, or input from the user.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user.",
        },
      },
      required: ["question"],
    },
    async execute(input) {
      const question = input.question as string;
      return context.askUser(question);
    },
  };
}
