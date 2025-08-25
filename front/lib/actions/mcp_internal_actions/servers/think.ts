import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";

const createServer = (): McpServer => {
  const server = makeInternalMCPServer("think");

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
