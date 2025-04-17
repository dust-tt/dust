import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "think",
  version: "1.0.0",
  description:
    "Tools that expand thinking and reasoning capabilities through various mechanisms.",
  icon: "LightbulbIcon",
  authorization: null,
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  const thinkToolPrompt = `Use the tool to think about something. It will not obtain new information or make any changes to the repository, but just log the thought. Use it when complex reasoning or brainstorming is needed. 

Common use cases:
1. When exploring a repository and discovering the source of a bug, call this tool to brainstorm several unique ways of fixing the bug, and assess which change(s) are likely to be simplest and most effective
2. After receiving test results, use this tool to brainstorm ways to fix failing tests
3. When planning a complex refactoring, use this tool to outline different approaches and their tradeoffs
4. When designing a new feature, use this tool to think through architecture decisions and implementation details
5. When debugging a complex issue, use this tool to organize your thoughts and hypotheses

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

  const describePlanToolPrompt = `Use the tool when you plan to solve a complex problem and want to describe the plan you have elaborated.
It will not obtain new information or make any changes to the repository, but just log the plan.
Use it when a complex plan will be executed or when you have to keep in memory numerous steps of a complex task.`;

  server.tool(
    "describe_plan",
    describePlanToolPrompt,
    {
      plan: z.string().describe("The plan to remember to follow."),
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
