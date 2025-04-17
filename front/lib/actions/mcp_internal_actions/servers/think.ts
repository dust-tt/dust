import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "think",
  version: "1.0.0",
  description: "Tools that expand thinking and reasoning capabilities.",
  icon: "LightbulbIcon",
  authorization: null,
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  const thinkToolPrompt = `Use the tool to think about something. It will not obtain new information or make any changes to the repository, but just log the thought. Use it when complex reasoning or brainstorming is needed.

Common use cases:
1. When planning a complex refactoring, use this tool to outline different approaches and their tradeoffs
2. When designing a new feature, use this tool to think through architecture decisions and implementation details
3. When debugging a complex issue, use this tool to organize your thoughts and hypotheses

The tool simply logs your thought process for better transparency and does not execute any code or make changes.`;

  server.tool(
    "think",
    thinkToolPrompt,
    {
      thought: z.string().describe("A thought to think about."),
    },
    async () => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Successfully thought about it.",
          },
        ],
      };
    }
  );

  const describePlanToolPrompt = `Use this tool when you need to outline a detailed plan for solving a complex problem. It will not obtain new information or make any changes to the repository, but will log your plan for reference throughout the conversation.

Common use cases:
1. When drafting a plan for implementing a new feature, use this tool to break down the work into clear, sequential steps
2. When analyzing a complex issue, use this tool to outline your investigation strategy
3. When drafting a blog post, use this tool to outline the structure and key points

A good plan typically includes:
- Clear, numbered steps in a logical sequence
- Decision points and contingencies where appropriate
- Expected outcomes for validation
- Any potential risks or challenges

The tool helps maintain focus during complex tasks and provides a reference point for both you and the user throughout the conversation.`;

  server.tool(
    "describe_plan",
    describePlanToolPrompt,
    {
      plan: z
        .string()
        .describe(
          "A detailed, step-by-step plan for solving the problem at hand."
        ),
    },
    async () => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Successfully cached a plan.",
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
