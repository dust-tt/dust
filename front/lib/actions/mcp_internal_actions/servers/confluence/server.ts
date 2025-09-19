import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createPage,
  getPage,
  updatePageContent,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/confluence_api_helper";
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
    "Confluence integration for retrieving, creating, and updating pages using the Confluence REST API.",
  authorization: {
    provider: "confluence_tools" as const,
    supported_use_cases: ["platform_actions", "personal_actions"] as const,
  },
  instructions:
    "Use this tool to retrieve information about a Confluence page, create new pages, or update existing page content.",
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

  server.tool(
    "create_page",
    "Creates a new Confluence page in the specified space.",
    {
      spaceId: z
        .string()
        .describe("The ID of the space where the page will be created"),
      title: z.string().describe("The title of the page"),
      content: z
        .string()
        .describe(
          "The content of the page in Confluence storage format (HTML)"
        ),
      parentId: z
        .string()
        .optional()
        .describe("Optional ID of parent page to create this page as a child"),
    },
    async ({ spaceId, title, content, parentId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const page = await createPage({
            baseUrl,
            accessToken,
            spaceId,
            title,
            content,
            parentId,
          });
          if (page.isErr()) {
            return makeMCPToolTextError(`Error creating page: ${page.error}`);
          }
          return makeMCPToolJSONSuccess({
            message: "Page created successfully",
            result: { page: page.value },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_page_content",
    "Updates the content of an existing Confluence page.",
    {
      pageId: z.string().describe("The ID of the page to update"),
      title: z.string().describe("The new title of the page"),
      content: z
        .string()
        .describe(
          "The new content of the page in Confluence storage format (HTML)"
        ),
      version: z
        .number()
        .describe(
          "The current version number of the page (required for updates)"
        ),
    },
    async ({ pageId, title, content, version }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const page = await updatePageContent({
            baseUrl,
            accessToken,
            pageId,
            title,
            content,
            version,
          });
          if (page.isErr()) {
            return makeMCPToolTextError(`Error updating page: ${page.error}`);
          }
          return makeMCPToolJSONSuccess({
            message: "Page updated successfully",
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
