import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { MCPServerDefinitionType } from "@app/lib/api/mcp";
import { browseUrls } from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import type { OAuthProvider } from "@app/types";

export const provider: OAuthProvider = "google_drive" as const;
export const serverInfo: MCPServerDefinitionType = {
  name: "web_search_&_browse_v2",
  version: "1.0.0",
  description:
    "Agent can search (Google) and retrieve information from specific websites.",
  icon: "ActionGlobeAltIcon",
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
      page: z
        .number()
        .optional()
        .describe(
          "A 1-indexed page number used to paginate through the search results. Should only be provided if page is stricly greater than 1 in order to go deeper into the search results for a specific query."
        ),
    },
    async ({ query, page }) => {
      const websearchRes = await webSearch({
        provider: "serpapi",
        query,
        page,
      });

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
      const results = await browseUrls(urls);
      const content: CallToolResult["content"] = results.map((result) => {
        return {
          type: "text",
          text: JSON.stringify(result),
        };
      });

      return {
        isError: false,
        content,
      };
    }
  );

  return server;
};

export default createServer;
