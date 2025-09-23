import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { normalizeError } from "@app/types";

const createServer = (): McpServer => {
  const server = makeInternalMCPServer("confluence");

  server.tool(
    "get_page",
    "Retrieves a single Confluence page by its ID.",
    {
      pageId: z.string().describe("The Confluence page ID"),
    },
    async ({ pageId }, { authInfo }) => {
      try {
        if (!authInfo?.token) {
          return makeMCPToolTextError("No access token provided");
        }

        // Get base URL from accessible resources
        const resourceResponse = await fetch(
          "https://api.atlassian.com/oauth/token/accessible-resources",
          {
            headers: {
              Authorization: `Bearer ${authInfo.token}`,
              Accept: "application/json",
            },
          }
        );

        if (!resourceResponse.ok) {
          return makeMCPToolTextError(
            `Failed to get Confluence resources: ${resourceResponse.statusText}`
          );
        }

        const resources = await resourceResponse.json();
        if (!resources || resources.length === 0) {
          return makeMCPToolTextError(
            "No accessible Confluence resources found"
          );
        }

        const cloudId = resources[0].id;
        const baseUrl = `https://api.atlassian.com/ex/confluence/${cloudId}`;

        // Get the page
        const pageResponse = await fetch(
          `${baseUrl}/wiki/api/v2/pages/${pageId}`,
          {
            headers: {
              Authorization: `Bearer ${authInfo.token}`,
              Accept: "application/json",
            },
          }
        );

        if (!pageResponse.ok) {
          if (pageResponse.status === 404) {
            return makeMCPToolJSONSuccess({
              message: "No page found with the specified ID",
              result: { found: false, pageId },
            });
          }
          return makeMCPToolTextError(
            `Error retrieving page: ${pageResponse.status} ${pageResponse.statusText}`
          );
        }

        const page = await pageResponse.json();

        // Add browse URL
        const browseUrl = `${resources[0].url}/wiki/spaces/viewpage.action?pageId=${page.id}`;

        return makeMCPToolJSONSuccess({
          message: "Page retrieved successfully",
          result: {
            page: {
              ...page,
              browseUrl,
            },
          },
        });
      } catch (error) {
        return makeMCPToolTextError(
          `Error retrieving page: ${normalizeError(error).message}`
        );
      }
    }
  );

  return server;
};

export default createServer;
