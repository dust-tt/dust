import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  createBoardSchema,
  createColumnSchema,
  createGroupSchema,
  createItemSchema,
  createMultipleItemsSchema,
  createSubitemSchema,
  createUpdateSchema,
  deleteGroupSchema,
  deleteItemSchema,
  duplicateGroupSchema,
  findUserByNameSchema,
  getActivityLogsSchema,
  getBoardAnalyticsSchema,
  getBoardItemsSchema,
  getBoardsSchema,
  getBoardValuesSchema,
  getColumnValuesSchema,
  getFileColumnValuesSchema,
  getGroupDetailsSchema,
  getItemDetailsSchema,
  getItemsByColumnValueSchema,
  getSubitemValuesSchema,
  getUserDetailsSchema,
  MONDAY_TOOL_NAME,
  moveItemToBoardSchema,
  searchItemsSchema,
  updateItemNameSchema,
  updateItemSchema,
  updateSubitemSchema,
  uploadFileToColumnSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/monday/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

import type { SearchItemsFilters } from "./monday_api_helper";
import {
  createBoard,
  createColumn,
  createGroup,
  createItem,
  createMultipleItems,
  createSubitem,
  createUpdate,
  deleteGroup,
  deleteItem,
  duplicateGroup,
  findUserByName,
  getActivityLogs,
  getBoardAnalytics,
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
  moveItemToBoard,
  searchItems,
  updateItem,
  updateItemName,
  updateSubitem,
  uploadFileToColumn,
} from "./monday_api_helper";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("monday");

  server.tool(
    "get_boards",
    "Lists all accessible boards in Monday.com workspace. Returns up to 100 boards.",
    getBoardsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MONDAY_TOOL_NAME,
        agentLoopContext,
      },
      async (_params, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const boards = await getBoards(accessToken);
        return new Ok([
          { type: "text" as const, text: "Boards retrieved successfully" },
          { type: "text" as const, text: JSON.stringify(boards, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "get_board_items",
    "Retrieves items from a specific Monday.com board. Returns up to 100 items.",
    getBoardItemsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MONDAY_TOOL_NAME,
        agentLoopContext,
      },
      async ({ boardId }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const items = await getBoardItems(accessToken, boardId);
        return new Ok([
          { type: "text" as const, text: "Board items retrieved successfully" },
          { type: "text" as const, text: JSON.stringify(items, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "get_item_details",
    "Retrieves detailed information about a specific Monday.com item",
    getItemDetailsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MONDAY_TOOL_NAME,
        agentLoopContext,
      },
      async ({ itemId }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const item = await getItemDetails(accessToken, itemId);
        if (!item) {
          return new Err(new MCPError("Item not found", { tracked: false }));
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Item details retrieved successfully",
          },
          { type: "text" as const, text: JSON.stringify(item, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "search_items",
    "Searches for items in Monday.com with advanced filtering options. Returns up to 100 items.",
    searchItemsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MONDAY_TOOL_NAME,
        agentLoopContext,
      },
      async (
        {
          query,
          boardId,
          status,
          assigneeId,
          groupId,
          timeframeStart,
          timeframeEnd,
          orderBy,
          orderDirection,
        },
        { authInfo }
      ) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

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
        return new Ok([
          {
            type: "text" as const,
            text: `Found ${items.length} items (max 100 returned)`,
          },
          { type: "text" as const, text: JSON.stringify(items, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "create_item",
    "Creates a new item in a Monday.com board",
    createItemSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MONDAY_TOOL_NAME,
        agentLoopContext,
      },
      async ({ boardId, itemName, groupId, columnValues }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const item = await createItem(
          accessToken,
          boardId,
          itemName,
          groupId,
          columnValues
        );
        return new Ok([
          { type: "text" as const, text: "Item created successfully" },
          { type: "text" as const, text: JSON.stringify(item, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "update_item",
    "Updates column values of an existing Monday.com item",
    updateItemSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MONDAY_TOOL_NAME,
        agentLoopContext,
      },
      async ({ itemId, columnValues }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        if (!columnValues || Object.keys(columnValues).length === 0) {
          return new Err(
            new MCPError("Invalid column values format", { tracked: false })
          );
        }
        const item = await updateItem(accessToken, itemId, columnValues);
        return new Ok([
          { type: "text" as const, text: "Item updated successfully" },
          { type: "text" as const, text: JSON.stringify(item, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "create_update",
    "Adds an update (comment) to a Monday.com item",
    createUpdateSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MONDAY_TOOL_NAME,
        agentLoopContext,
      },
      async ({ itemId, body }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const update = await createUpdate(accessToken, itemId, body);
        return new Ok([
          { type: "text" as const, text: "Update added successfully" },
          { type: "text" as const, text: JSON.stringify(update, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "delete_item",
    "Deletes a Monday.com item",
    deleteItemSchema,
    async ({ itemId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const result = await deleteItem(accessToken, itemId);
      return {
        isError: false,
        content: [
          { type: "text", text: "Item deleted successfully" },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "update_item_name",
    "Updates the name of a Monday.com item",
    updateItemNameSchema,
    async ({ itemId, name }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const item = await updateItemName(accessToken, itemId, name);
      return {
        isError: false,
        content: [
          { type: "text", text: "Item name updated successfully" },
          { type: "text", text: JSON.stringify(item, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "create_board",
    "Creates a new board in Monday.com",
    createBoardSchema,
    async (
      { boardName, boardKind, workspaceId, description },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const board = await createBoard(
        accessToken,
        boardName,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        boardKind || "public",
        workspaceId,
        description
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Board created successfully" },
          { type: "text", text: JSON.stringify(board, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "create_column",
    "Creates a new column in a Monday.com board",
    createColumnSchema,
    async ({ boardId, title, columnType, description }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const column = await createColumn(
        accessToken,
        boardId,
        title,
        columnType,
        description
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Column created successfully" },
          { type: "text", text: JSON.stringify(column, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "create_group",
    "Creates a new group in a Monday.com board",
    createGroupSchema,
    async ({ boardId, groupName, position }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const group = await createGroup(
        accessToken,
        boardId,
        groupName,
        position
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Group created successfully" },
          { type: "text", text: JSON.stringify(group, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "create_subitem",
    "Creates a new subitem for a Monday.com item",
    createSubitemSchema,
    async ({ parentItemId, itemName, columnValues }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const subitem = await createSubitem(
        accessToken,
        parentItemId,
        itemName,
        columnValues
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Subitem created successfully" },
          { type: "text", text: JSON.stringify(subitem, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "delete_group",
    "Deletes a group from a Monday.com board",
    deleteGroupSchema,
    async ({ boardId, groupId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const result = await deleteGroup(accessToken, boardId, groupId);
      return {
        isError: false,
        content: [
          { type: "text", text: "Group deleted successfully" },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "duplicate_group",
    "Duplicates a group in a Monday.com board",
    duplicateGroupSchema,
    async ({ boardId, groupId, addToTop, groupTitle }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const group = await duplicateGroup(
        accessToken,
        boardId,
        groupId,
        addToTop,
        groupTitle
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Group duplicated successfully" },
          { type: "text", text: JSON.stringify(group, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "update_subitem",
    "Updates column values of a Monday.com subitem",
    updateSubitemSchema,
    async ({ subitemId, columnValues }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const subitem = await updateSubitem(accessToken, subitemId, columnValues);
      return {
        isError: false,
        content: [
          { type: "text", text: "Subitem updated successfully" },
          { type: "text", text: JSON.stringify(subitem, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "upload_file_to_column",
    "Uploads a file to a Monday.com column",
    uploadFileToColumnSchema,
    async ({ itemId, columnId, file }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const result = await uploadFileToColumn(
        accessToken,
        itemId,
        columnId,
        file
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "File uploaded successfully" },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_items_by_column_value",
    "Retrieves items from a board by column value",
    getItemsByColumnValueSchema,
    async ({ boardId, columnId, columnValue }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const items = await getItemsByColumnValue(
        accessToken,
        boardId,
        columnId,
        columnValue
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Items retrieved successfully" },
          { type: "text", text: JSON.stringify(items, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "find_user_by_name",
    "Finds a Monday.com user by name",
    findUserByNameSchema,
    async ({ name }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const user = await findUserByName(accessToken, name);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: "User not found" }],
        };
      }
      return {
        isError: false,
        content: [
          { type: "text", text: "User found successfully" },
          { type: "text", text: JSON.stringify(user, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_board_values",
    "Retrieves detailed information about a Monday.com board including columns and groups",
    getBoardValuesSchema,
    async ({ boardId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const board = await getBoardValues(accessToken, boardId);
      return {
        isError: false,
        content: [
          { type: "text", text: "Board details retrieved successfully" },
          { type: "text", text: JSON.stringify(board, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_column_values",
    "Retrieves column values for a specific item and column",
    getColumnValuesSchema,
    async ({ boardId, itemId, columnId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const columnValue = await getColumnValues(
        accessToken,
        boardId,
        itemId,
        columnId
      );
      if (!columnValue) {
        return {
          isError: true,
          content: [{ type: "text", text: "Column value not found" }],
        };
      }
      return {
        isError: false,
        content: [
          { type: "text", text: "Column values retrieved successfully" },
          { type: "text", text: JSON.stringify(columnValue, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_file_column_values",
    "Retrieves file column values for a specific item and column",
    getFileColumnValuesSchema,
    async ({ itemId, columnId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const fileColumnValue = await getFileColumnValues(
        accessToken,
        itemId,
        columnId
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "File column values retrieved successfully" },
          { type: "text", text: JSON.stringify(fileColumnValue, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_group_details",
    "Retrieves details about a specific group in a Monday.com board",
    getGroupDetailsSchema,
    async ({ boardId, groupId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const group = await getGroupDetails(accessToken, boardId, groupId);
      if (!group) {
        return {
          isError: true,
          content: [{ type: "text", text: "Group not found" }],
        };
      }
      return {
        isError: false,
        content: [
          { type: "text", text: "Group details retrieved successfully" },
          { type: "text", text: JSON.stringify(group, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_subitem_values",
    "Retrieves subitems for a specific Monday.com item",
    getSubitemValuesSchema,
    async ({ itemId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const subitems = await getSubitemValues(accessToken, itemId);
      return {
        isError: false,
        content: [
          { type: "text", text: "Subitems retrieved successfully" },
          { type: "text", text: JSON.stringify(subitems, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_user_details",
    "Retrieves details about a specific Monday.com user",
    getUserDetailsSchema,
    async ({ userId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const user = await getUserDetails(accessToken, userId);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: "User not found" }],
        };
      }
      return {
        isError: false,
        content: [
          { type: "text", text: "User details retrieved successfully" },
          { type: "text", text: JSON.stringify(user, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "move_item_to_board",
    "Moves an item from one board to another. Useful for converting leads to opportunities in CRM workflows.",
    moveItemToBoardSchema,
    async (
      { itemId, targetBoardId, targetGroupId, columnsMapping },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const item = await moveItemToBoard(
        accessToken,
        itemId,
        targetBoardId,
        targetGroupId,
        columnsMapping
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Item moved to board successfully" },
          { type: "text", text: JSON.stringify(item, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "create_multiple_items",
    "Creates multiple items in one or more boards in a single operation. Useful for bulk importing leads or opportunities.",
    createMultipleItemsSchema,
    async ({ items }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const createdItems = await createMultipleItems(accessToken, items);
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Created ${createdItems.length} items successfully`,
          },
          { type: "text", text: JSON.stringify(createdItems, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_activity_logs",
    "Retrieves activity logs for a board. Useful for tracking pipeline velocity and user actions.",
    getActivityLogsSchema,
    async ({ boardId, from, to, limit }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const logs = await getActivityLogs(
        accessToken,
        boardId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        limit
      );
      return {
        isError: false,
        content: [
          { type: "text", text: "Activity logs retrieved successfully" },
          { type: "text", text: JSON.stringify(logs, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_board_analytics",
    "Retrieves analytics and statistics for a board including item counts by status, group, and assignee. Useful for CRM reporting.",
    getBoardAnalyticsSchema,
    async ({ boardId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const analytics = await getBoardAnalytics(accessToken, boardId);
      return {
        isError: false,
        content: [
          { type: "text", text: "Board analytics retrieved successfully" },
          { type: "text", text: JSON.stringify(analytics, null, 2) },
        ],
      };
    }
  );

  return server;
}

export default createServer;
