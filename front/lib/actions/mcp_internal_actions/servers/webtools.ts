import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { MCPServerDefinitionType } from "@app/lib/api/mcp";
import { browseUrl } from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import logger from "@app/logger/logger";
import type { OAuthProvider } from "@app/types";

const webLogger = logger.child(
  {},
  { msgPrefix: "[webtools] ", module: "mcp/webtools" }
);

export const provider: OAuthProvider = "google_drive" as const;
export const serverInfo: MCPServerDefinitionType = {
  name: "web_search_&_browse",
  version: "1.0.0",
  description:
    "You are a helpful server that search google and browse the web for the user.",
  visual: "command",
  authorization: {
    provider,
    use_case: "connection" as const,
  },
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "websearch",
    "A google search tool",
    {
      query: z.string().describe("The google query that will be send."),
    },
    async ({ query }) => {
      webLogger.debug({ query }, "[websearch]");

      const websearchRes = await webSearch({ provider: "serpapi", query });

      if (websearchRes.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to search: ${websearchRes.error.message}`,
            },
          ],
        };
      }

      const results = websearchRes.value;

      webLogger.debug({ results }, "[websearch]: RESULTS");

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify(results),
          },
        ],
      };
    }
  );

  server.tool(
    "webbrowser",
    "A tool to browse website",
    {
      url: z.string().describe("URL of the website to be fetch"),
    },
    async ({ url }) => {
      webLogger.debug({ url }, "[webbrowser]");

      const result = await browseUrl(url);

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch url: ${result.error.message}`,
            },
          ],
        };
      }

      webLogger.debug({ result }, "[webbrowser]: RESULTS");

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify(result.value),
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
