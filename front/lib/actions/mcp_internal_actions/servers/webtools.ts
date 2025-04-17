import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { MCPServerDefinitionType } from "@app/lib/api/mcp";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { browseUrl } from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import type { OAuthProvider } from "@app/types";

export const provider: OAuthProvider = "google_drive" as const;
export const serverInfo: MCPServerDefinitionType = {
  name: "web_search_&_browse_v2",
  version: "1.0.0",
  description:
    "Agent can search (Google) and retrieve information from specific websites.",
  icon: "PlanetIcon",
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
      query: z
        .string()
        .describe(
          "The query used to perform the google search. If requested by the user, use the google syntax `site:` to restrict the the search to a particular website or domain."
        ),
    },
    async ({ query }) => {
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

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify(websearchRes.value),
          },
        ],
      };
    }
  );

  server.tool(
    "webbrowser",
    "A tool to browse website",
    {
      urls: z.string().array().describe("List of urls to browse"),
    },
    async ({ urls }) => {
      const content: CallToolResult["content"] = await concurrentExecutor(
        urls,
        async (url) => {
          const res = await browseUrl(url);

          if (res.isErr()) {
            return {
              type: "text",
              text: `Failed to fetch url "${url}": ${res.error.message}`,
            };
          }

          return {
            type: "text",
            text: JSON.stringify(res.value),
          };
        },
        { concurrency: 4 }
      );

      return {
        isError: false,
        content,
      };
    }
  );

  return server;
};

export default createServer;
