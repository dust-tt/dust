import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createBoard,
  createColumn,
  createGroup,
  createItem,
  createSubitem,
  createUpdate,
  deleteGroup,
  deleteItem,
  duplicateGroup,
  findUserByName,
  getBoardItems,
  getBoards,
  getBoardValues,
  getColumnValues,
  getFileColumnValues,
  getGroupDetails,
  getItemDetails,
  getItemsByColumnValue,
  getSubitemValues,
  getUserDetails,
  searchItems,
  SearchItemsFilters,
  updateItem,
  updateItemName,
  updateSubitem,
  uploadFileToColumn,
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
  documentationUrl:
    "https://developer.monday.com/api-reference/docs/introduction-to-graphql",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_boards",
    "Lists all accessible boards in Monday.com workspace. Returns up to 100 boards.",
    {},
    async (_params, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const boards = await getBoards(accessToken);
          return makeMCPToolJSONSuccess({
            message: "Boards retrieved successfully",
            result: boards,
          });
        },
        authInfo,
        params: {},
      });
    }
  );

  server.tool(
    "get_board_items",
    "Retrieves items from a specific Monday.com board. Returns up to 100 items.",
    {
      boardId: z.string().describe("The board ID to retrieve items from"),
    },
    async ({ boardId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const items = await getBoardItems(accessToken, boardId);
          return makeMCPToolJSONSuccess({
            message: "Board items retrieved successfully",
            result: items,
          });
        },
        authInfo,
        params: { boardId },
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
    "Searches for items in Monday.com with advanced filtering options. Returns up to 100 items.",
    {
      query: z
        .string()
        .optional()
        .describe("Text query to search in item names and column values"),
      boardId: z
        .string()
        .optional()
        .describe("Filter by specific board ID"),
      status: z
        .string()
        .optional()
        .describe("Filter by status (e.g., 'Working on it', 'Done', 'Stuck')"),
      assigneeId: z
        .string()
        .optional()
        .describe("Filter by assignee user ID"),
      groupId: z
        .string()
        .optional()
        .describe("Filter by group ID"),
      timeframeStart: z
        .string()
        .optional()
        .describe("Filter items created after this date (ISO 8601 format)"),
      timeframeEnd: z
        .string()
        .optional()
        .describe("Filter items created before this date (ISO 8601 format)"),
      orderBy: z
        .enum(["created_at", "updated_at", "name"])
        .optional()
        .describe("Field to order results by"),
      orderDirection: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Order direction (default: asc)"),
    },
    async ({ query, boardId, status, assigneeId, groupId, timeframeStart, timeframeEnd, orderBy, orderDirection }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const filters: SearchItemsFilters = {
            query,
            boardId,
            status,
            assigneeId,
            groupId,
            orderBy,
            orderDirection,
          };
          
          if (timeframeStart || timeframeEnd) {
            filters.timeframe = {
              start: timeframeStart ? new Date(timeframeStart) : undefined,
              end: timeframeEnd ? new Date(timeframeEnd) : undefined,
            };
          }
          
          const items = await searchItems(accessToken, filters);
          return makeMCPToolJSONSuccess({
            message: `Found ${items.length} items (max 100 returned)`,
            result: items,
          });
        },
        authInfo,
        params: { query, boardId, status, assigneeId, groupId, timeframeStart, timeframeEnd, orderBy, orderDirection },
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
        .describe(
          'Optional column values as a JSON object (e.g., {"status": "Working on it", "date": "2024-01-25"})'
        ),
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
        .describe(
          'Column values to update as a JSON object (e.g., {"status": "Done", "priority": "High"})'
        ),
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

  server.tool(
    "update_item_name",
    "Updates the name of an existing Monday.com item",
    {
      itemId: z.string().describe("The item ID to update"),
      name: z.string().describe("The new name for the item"),
    },
    async ({ itemId, name }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const item = await updateItemName(accessToken, itemId, name);
          return makeMCPToolJSONSuccess({
            message: "Item name updated successfully",
            result: item,
          });
        },
        authInfo,
        params: { itemId, name },
      });
    }
  );

  server.tool(
    "create_board",
    "Creates a new board in Monday.com",
    {
      boardName: z.string().describe("The name of the new board"),
      boardKind: z
        .enum(["public", "private", "share"])
        .optional()
        .describe("The kind of board (default: public)"),
      workspaceId: z
        .string()
        .optional()
        .describe("Optional workspace ID to create the board in"),
      description: z
        .string()
        .optional()
        .describe("Optional description for the board"),
    },
    async (
      { boardName, boardKind, workspaceId, description },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken) => {
          const board = await createBoard(
            accessToken,
            boardName,
            boardKind || "public",
            workspaceId,
            description
          );
          return makeMCPToolJSONSuccess({
            message: "Board created successfully",
            result: board,
          });
        },
        authInfo,
        params: { boardName, boardKind, workspaceId, description },
      });
    }
  );

  server.tool(
    "create_column",
    "Creates a new column in a Monday.com board",
    {
      boardId: z.string().describe("The board ID to create the column in"),
      title: z.string().describe("The title of the new column"),
      columnType: z
        .string()
        .describe(
          "The type of column (e.g., 'text', 'status', 'date', 'numbers')"
        ),
      description: z
        .string()
        .optional()
        .describe("Optional description for the column"),
    },
    async ({ boardId, title, columnType, description }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const column = await createColumn(
            accessToken,
            boardId,
            title,
            columnType,
            description
          );
          return makeMCPToolJSONSuccess({
            message: "Column created successfully",
            result: column,
          });
        },
        authInfo,
        params: { boardId, title, columnType, description },
      });
    }
  );

  server.tool(
    "create_group",
    "Creates a new group in a Monday.com board",
    {
      boardId: z.string().describe("The board ID to create the group in"),
      groupName: z.string().describe("The name of the new group"),
      position: z
        .string()
        .optional()
        .describe("Optional position for the group"),
    },
    async ({ boardId, groupName, position }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const group = await createGroup(
            accessToken,
            boardId,
            groupName,
            position
          );
          return makeMCPToolJSONSuccess({
            message: "Group created successfully",
            result: group,
          });
        },
        authInfo,
        params: { boardId, groupName, position },
      });
    }
  );

  server.tool(
    "create_subitem",
    "Creates a new subitem for a Monday.com item",
    {
      parentItemId: z.string().describe("The parent item ID"),
      itemName: z.string().describe("The name of the new subitem"),
      columnValues: z
        .record(z.any())
        .optional()
        .describe("Optional column values as a JSON object"),
    },
    async ({ parentItemId, itemName, columnValues }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const subitem = await createSubitem(
            accessToken,
            parentItemId,
            itemName,
            columnValues
          );
          return makeMCPToolJSONSuccess({
            message: "Subitem created successfully",
            result: subitem,
          });
        },
        authInfo,
        params: { parentItemId, itemName, columnValues },
      });
    }
  );

  server.tool(
    "delete_group",
    "Deletes a group from a Monday.com board",
    {
      boardId: z.string().describe("The board ID containing the group"),
      groupId: z.string().describe("The group ID to delete"),
    },
    async ({ boardId, groupId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await deleteGroup(accessToken, boardId, groupId);
          return makeMCPToolJSONSuccess({
            message: "Group deleted successfully",
            result,
          });
        },
        authInfo,
        params: { boardId, groupId },
      });
    }
  );

  server.tool(
    "duplicate_group",
    "Duplicates a group with its items in a Monday.com board",
    {
      boardId: z.string().describe("The board ID containing the group"),
      groupId: z.string().describe("The group ID to duplicate"),
      addToTop: z
        .boolean()
        .optional()
        .describe("Whether to add the duplicated group to the top"),
      groupTitle: z
        .string()
        .optional()
        .describe("Optional title for the duplicated group"),
    },
    async ({ boardId, groupId, addToTop, groupTitle }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const group = await duplicateGroup(
            accessToken,
            boardId,
            groupId,
            addToTop,
            groupTitle
          );
          return makeMCPToolJSONSuccess({
            message: "Group duplicated successfully",
            result: group,
          });
        },
        authInfo,
        params: { boardId, groupId, addToTop, groupTitle },
      });
    }
  );

  server.tool(
    "update_subitem",
    "Updates column values of a Monday.com subitem",
    {
      subitemId: z.string().describe("The subitem ID to update"),
      columnValues: z
        .record(z.any())
        .describe("Column values to update as a JSON object"),
    },
    async ({ subitemId, columnValues }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          if (!columnValues || Object.keys(columnValues).length === 0) {
            return makeMCPToolTextError(ERROR_MESSAGES.INVALID_COLUMN_VALUES);
          }
          const subitem = await updateSubitem(
            accessToken,
            subitemId,
            columnValues
          );
          return makeMCPToolJSONSuccess({
            message: "Subitem updated successfully",
            result: subitem,
          });
        },
        authInfo,
        params: { subitemId, columnValues },
      });
    }
  );

  server.tool(
    "upload_file_to_column",
    "Uploads a file to a specific column in a Monday.com item",
    {
      itemId: z.string().describe("The item ID to upload the file to"),
      columnId: z.string().describe("The column ID to upload the file to"),
      fileData: z.string().describe("Base64 encoded file data"),
      fileName: z.string().describe("The name of the file"),
      mimeType: z.string().optional().describe("The MIME type of the file"),
    },
    async (
      { itemId, columnId, fileData, fileName, mimeType },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken) => {
          try {
            const binaryData = Buffer.from(fileData, "base64");
            const blob = new Blob([binaryData], {
              type: mimeType || "application/octet-stream",
            });
            const file = new File([blob], fileName, {
              type: mimeType || "application/octet-stream",
            });

            const result = await uploadFileToColumn(
              accessToken,
              itemId,
              columnId,
              file
            );
            return makeMCPToolJSONSuccess({
              message: "File uploaded successfully",
              result,
            });
          } catch (error) {
            return makeMCPToolTextError(
              "Failed to upload file: " + (error as Error).message
            );
          }
        },
        authInfo,
        params: { itemId, columnId, fileName },
      });
    }
  );

  server.tool(
    "get_items_by_column_value",
    "Finds all items that match a specific value in a selected column. Returns up to 100 items.",
    {
      boardId: z.string().describe("The board ID to search in"),
      columnId: z.string().describe("The column ID to search by"),
      columnValue: z.string().describe("The value to search for"),
    },
    async ({ boardId, columnId, columnValue }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const items = await getItemsByColumnValue(
            accessToken,
            boardId,
            columnId,
            columnValue
          );
          return makeMCPToolJSONSuccess({
            message: "Items retrieved successfully",
            result: items,
          });
        },
        authInfo,
        params: { boardId, columnId, columnValue },
      });
    }
  );

  server.tool(
    "find_user_by_name",
    "Searches for a user by name using exact matching",
    {
      name: z.string().describe("The exact name of the user to find"),
    },
    async ({ name }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const user = await findUserByName(accessToken, name);
          if (!user) {
            return makeMCPToolTextError("User not found");
          }
          return makeMCPToolJSONSuccess({
            message: "User found successfully",
            result: user,
          });
        },
        authInfo,
        params: { name },
      });
    }
  );

  server.tool(
    "get_board_values",
    "Returns the data for all columns in a specific board",
    {
      boardId: z.string().describe("The board ID to get values from"),
    },
    async ({ boardId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const board = await getBoardValues(accessToken, boardId);
          if (!board) {
            return makeMCPToolTextError(ERROR_MESSAGES.BOARD_NOT_FOUND);
          }
          return makeMCPToolJSONSuccess({
            message: "Board values retrieved successfully",
            result: board,
          });
        },
        authInfo,
        params: { boardId },
      });
    }
  );

  server.tool(
    "get_column_values",
    "Returns the data for a specific column in a board",
    {
      boardId: z.string().describe("The board ID"),
      itemId: z.string().describe("The item ID"),
      columnId: z.string().describe("The column ID to get values from"),
    },
    async ({ boardId, itemId, columnId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const columnValue = await getColumnValues(
            accessToken,
            boardId,
            itemId,
            columnId
          );
          if (!columnValue) {
            return makeMCPToolTextError("Column value not found");
          }
          return makeMCPToolJSONSuccess({
            message: "Column value retrieved successfully",
            result: columnValue,
          });
        },
        authInfo,
        params: { boardId, itemId, columnId },
      });
    }
  );

  server.tool(
    "get_file_column_values",
    "Returns the data for a specific file column in a board",
    {
      itemId: z.string().describe("The item ID"),
      columnId: z.string().describe("The file column ID to get values from"),
    },
    async ({ itemId, columnId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const fileColumn = await getFileColumnValues(
            accessToken,
            itemId,
            columnId
          );
          if (!fileColumn) {
            return makeMCPToolTextError(
              "File column not found or not a file type"
            );
          }
          return makeMCPToolJSONSuccess({
            message: "File column values retrieved successfully",
            result: fileColumn,
          });
        },
        authInfo,
        params: { itemId, columnId },
      });
    }
  );

  server.tool(
    "get_group_details",
    "Returns the group details for a specific board",
    {
      boardId: z.string().describe("The board ID containing the group"),
      groupId: z.string().describe("The group ID to get details for"),
    },
    async ({ boardId, groupId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const group = await getGroupDetails(accessToken, boardId, groupId);
          if (!group) {
            return makeMCPToolTextError("Group not found");
          }
          return makeMCPToolJSONSuccess({
            message: "Group details retrieved successfully",
            result: group,
          });
        },
        authInfo,
        params: { boardId, groupId },
      });
    }
  );

  server.tool(
    "get_subitem_values",
    "Returns the subitems for a specific item in a board",
    {
      itemId: z.string().describe("The item ID to get subitems from"),
    },
    async ({ itemId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const subitems = await getSubitemValues(accessToken, itemId);
          return makeMCPToolJSONSuccess({
            message: "Subitems retrieved successfully",
            result: subitems,
          });
        },
        authInfo,
        params: { itemId },
      });
    }
  );

  server.tool(
    "get_user_details",
    "Returns the details for a specific user",
    {
      userId: z.string().describe("The user ID to get details for"),
    },
    async ({ userId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const user = await getUserDetails(accessToken, userId);
          if (!user) {
            return makeMCPToolTextError("User not found");
          }
          return makeMCPToolJSONSuccess({
            message: "User details retrieved successfully",
            result: user,
          });
        },
        authInfo,
        params: { userId },
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
