import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getPage } from "@app/lib/actions/mcp_internal_actions/servers/confluence/confluence_api_helper";
import { withAuth } from "@app/lib/actions/mcp_internal_actions/servers/confluence/confluence_utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "confluence",
  version: "1.0.0",
  description:
    "Basic Confluence integration for retrieving page information using the Confluence REST API.",
  authorization: {
    provider: "confluence_tools" as const,
    supported_use_cases: ["platform_actions", "personal_actions"] as const,
  },
  instructions:
    "Use this tool to retrieve information about a Confluence page.",
  icon: "ConfluenceLogo",
  documentationUrl:
    "https://developer.atlassian.com/cloud/confluence/rest/v2/intro/",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_page",
    "Retrieves a single Confluence page by its ID.",
    {
      pageId: z.string().describe("The Confluence page ID"),
    },
    async ({ pageId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const page = await getPage({
            baseUrl,
            accessToken,
            pageId,
          });
          if (page.isOk() && page.value === null) {
            return makeMCPToolJSONSuccess({
              message: "No page found with the specified ID",
              result: { found: false, pageId },
            });
          }
          if (page.isErr()) {
            return makeMCPToolTextError(`Error retrieving page: ${page.error}`);
          }
          return makeMCPToolJSONSuccess({
            message: "Page retrieved successfully",
            result: { page: page.value },
          });
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
