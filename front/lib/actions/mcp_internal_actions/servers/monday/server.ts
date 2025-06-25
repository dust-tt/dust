import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createItem,
  createUpdate,
  deleteItem,
  getBoardItems,
  getBoards,
  getItemDetails,
  searchItems,
  updateItem,
} from "@app/lib/actions/mcp_internal_actions/servers/monday/monday_api_helper";
import {
  ERROR_MESSAGES,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/monday/monday_utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "monday",
  version: "1.0.0",
  description:
    "Monday.com integration providing CRM-like operations for boards, items, and updates. Enables reading and managing Monday.com boards and items through the GraphQL API.",
  authorization: {
    provider: "monday" as const,
    supported_use_cases: ["personal_actions", "platform_actions"] as const,
  },
  icon: "MondayLogo",
  documentationUrl: "https://developer.monday.com/api-reference/docs/introduction-to-graphql",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_boards",
    "Lists all accessible boards in Monday.com workspace",
    {
      limit: z
        .number()
        .optional()
        .describe("Maximum number of boards to return (default: 50)"),
    },
    async ({ limit }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const boards = await getBoards(accessToken, limit);
          return makeMCPToolJSONSuccess({
            message: "Boards retrieved successfully",
            result: boards,
          });
        },
        authInfo,
        params: { limit },
      });
    }
  );

  server.tool(
    "get_board_items",
    "Retrieves items from a specific Monday.com board",
    {
      boardId: z.string().describe("The board ID to retrieve items from"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of items to return (default: 50)"),
    },
    async ({ boardId, limit }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const items = await getBoardItems(accessToken, boardId, limit);
          return makeMCPToolJSONSuccess({
            message: "Board items retrieved successfully",
            result: items,
          });
        },
        authInfo,
        params: { boardId, limit },
      });
    }
  );

  server.tool(
    "get_item_details",
    "Retrieves detailed information about a specific Monday.com item",
    {
      itemId: z.string().describe("The item ID to retrieve details for"),
    },
    async ({ itemId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const item = await getItemDetails(accessToken, itemId);
          if (!item) {
            return makeMCPToolTextError(ERROR_MESSAGES.ITEM_NOT_FOUND);
          }
          return makeMCPToolJSONSuccess({
            message: "Item details retrieved successfully",
            result: item,
          });
        },
        authInfo,
        params: { itemId },
      });
    }
  );

  server.tool(
    "search_items",
    "Searches for items across Monday.com boards or within a specific board",
    {
      searchQuery: z.string().describe("The search query to find items"),
      boardId: z
        .string()
        .optional()
        .describe("Optional board ID to limit search to a specific board"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of items to return (default: 50)"),
    },
    async ({ searchQuery, boardId, limit }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const items = await searchItems(accessToken, searchQuery, boardId, limit);
          return makeMCPToolJSONSuccess({
            message: "Search completed successfully",
            result: items,
          });
        },
        authInfo,
        params: { searchQuery, boardId, limit },
      });
    }
  );

  server.tool(
    "create_item",
    "Creates a new item in a Monday.com board",
    {
      boardId: z.string().describe("The board ID to create the item in"),
      itemName: z.string().describe("The name of the new item"),
      groupId: z
        .string()
        .optional()
        .describe("Optional group ID to add the item to"),
      columnValues: z
        .record(z.any())
        .optional()
        .describe("Optional column values as a JSON object (e.g., {\"status\": \"Working on it\", \"date\": \"2024-01-25\"})"),
    },
    async ({ boardId, itemName, groupId, columnValues }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const item = await createItem(
            accessToken,
            boardId,
            itemName,
            groupId,
            columnValues
          );
          return makeMCPToolJSONSuccess({
            message: "Item created successfully",
            result: item,
          });
        },
        authInfo,
        params: { boardId, itemName, groupId, columnValues },
      });
    }
  );

  server.tool(
    "update_item",
    "Updates column values of an existing Monday.com item",
    {
      itemId: z.string().describe("The item ID to update"),
      columnValues: z
        .record(z.any())
        .describe("Column values to update as a JSON object (e.g., {\"status\": \"Done\", \"priority\": \"High\"})"),
    },
    async ({ itemId, columnValues }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          if (!columnValues || Object.keys(columnValues).length === 0) {
            return makeMCPToolTextError(ERROR_MESSAGES.INVALID_COLUMN_VALUES);
          }
          const item = await updateItem(accessToken, itemId, columnValues);
          return makeMCPToolJSONSuccess({
            message: "Item updated successfully",
            result: item,
          });
        },
        authInfo,
        params: { itemId, columnValues },
      });
    }
  );

  server.tool(
    "create_update",
    "Adds an update (comment) to a Monday.com item",
    {
      itemId: z.string().describe("The item ID to add the update to"),
      body: z.string().describe("The content of the update/comment"),
    },
    async ({ itemId, body }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const update = await createUpdate(accessToken, itemId, body);
          return makeMCPToolJSONSuccess({
            message: "Update added successfully",
            result: update,
          });
        },
        authInfo,
        params: { itemId, body },
      });
    }
  );

  server.tool(
    "delete_item",
    "Deletes an item from Monday.com (requires high stakes confirmation)",
    {
      itemId: z.string().describe("The item ID to delete"),
    },
    async ({ itemId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await deleteItem(accessToken, itemId);
          return makeMCPToolJSONSuccess({
            message: "Item deleted successfully",
            result,
          });
        },
        authInfo,
        params: { itemId },
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };