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

  server.tool(
    "think",
    "Use the tool to think about something. " +
      "It will not obtain new information or change the database, " +
      "but just append the thought to the log. " +
      "Use it when complex reasoning or some cache memory is needed.",
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

  server.tool(
    "describe_plan",
    "Use the tool when you plan to solve a complex problem and want to describe the plan you have elaborated. " +
      "It will not obtain new information or change the database, " +
      "but just append the drafted plan to the log. " +
      "Use it when a complex plan will be executed or when you have to keep in memory numerous steps of a complex task.",
    {
      plan: z.string().describe("The plan to remember."),
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
