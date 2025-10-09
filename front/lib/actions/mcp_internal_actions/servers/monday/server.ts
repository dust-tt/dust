import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SearchItemsFilters } from "@app/lib/actions/mcp_internal_actions/servers/monday/monday_api_helper";
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
} from "@app/lib/actions/mcp_internal_actions/servers/monday/monday_api_helper";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const createServer = (auth: Authenticator): McpServer => {
  const server = makeInternalMCPServer("monday");

  server.tool(
    "get_boards",
    "Lists all accessible boards in Monday.com workspace. Returns up to 100 boards.",
    {},
    withToolLogging(
      auth,
      { toolName: "get_boards" },
      async (_params, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const boards = await getBoards(accessToken);
        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Boards retrieved successfully",
            result: boards,
          }).content
        );
      }
    )
  );

  server.tool(
    "get_board_items",
    "Retrieves items from a specific Monday.com board. Returns up to 100 items.",
    {
      boardId: z.string().describe("The board ID to retrieve items from"),
    },
    withToolLogging(
      auth,
      { toolName: "get_board_items" },
      async ({ boardId }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const items = await getBoardItems(accessToken, boardId);
        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Board items retrieved successfully",
            result: items,
          }).content
        );
      }
    )
  );

  server.tool(
    "get_item_details",
    "Retrieves detailed information about a specific Monday.com item",
    {
      itemId: z.string().describe("The item ID to retrieve details for"),
    },
    withToolLogging(
      auth,
      { toolName: "get_item_details" },
      async ({ itemId }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const item = await getItemDetails(accessToken, itemId);
        if (!item) {
          return new Err(new MCPError("Item not found"));
        }
        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Item details retrieved successfully",
            result: item,
          }).content
        );
      }
    )
  );

  server.tool(
    "search_items",
    "Searches for items in Monday.com with advanced filtering options. Returns up to 100 items.",
    {
      query: z
        .string()
        .optional()
        .describe("Text query to search in item names and column values"),
      boardId: z.string().optional().describe("Filter by specific board ID"),
      status: z
        .string()
        .optional()
        .describe("Filter by status (e.g., 'Working on it', 'Done', 'Stuck')"),
      assigneeId: z.string().optional().describe("Filter by assignee user ID"),
      groupId: z.string().optional().describe("Filter by group ID"),
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
    withToolLogging(
      auth,
      { toolName: "search_items" },
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

        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        if (timeframeStart || timeframeEnd) {
          filters.timeframe = {
            start: timeframeStart ? new Date(timeframeStart) : undefined,
            end: timeframeEnd ? new Date(timeframeEnd) : undefined,
          };
        }

        const items = await searchItems(accessToken, filters);
        return new Ok(
          makeMCPToolJSONSuccess({
            message: `Found ${items.length} items (max 100 returned)`,
            result: items,
          }).content
        );
      }
    )
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
    withToolLogging(
      auth,
      { toolName: "create_item" },
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
        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Item created successfully",
            result: item,
          }).content
        );
      }
    )
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
    withToolLogging(
      auth,
      { toolName: "update_item" },
      async ({ itemId, columnValues }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        if (!columnValues || Object.keys(columnValues).length === 0) {
          return new Err(new MCPError("Invalid column values format"));
        }
        const item = await updateItem(accessToken, itemId, columnValues);
        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Item updated successfully",
            result: item,
          }).content
        );
      }
    )
  );

  server.tool(
    "create_update",
    "Adds an update (comment) to a Monday.com item",
    {
      itemId: z.string().describe("The item ID to add the update to"),
      body: z.string().describe("The content of the update/comment"),
    },
    withToolLogging(
      auth,
      { toolName: "create_update" },
      async ({ itemId, body }, { authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
          return new Err(new MCPError("No Monday.com access token found"));
        }

        const update = await createUpdate(accessToken, itemId, body);
        return new Ok(
          makeMCPToolJSONSuccess({
            message: "Update added successfully",
            result: update,
          }).content
        );
      }
    )
  );

  server.tool(
    "delete_item",
    "Deletes a Monday.com item",
    {
      itemId: z.string().describe("The item ID to delete"),
    },
    async ({ itemId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const result = await deleteItem(accessToken, itemId);
      return makeMCPToolJSONSuccess({
        message: "Item deleted successfully",
        result,
      });
    }
  );

  server.tool(
    "update_item_name",
    "Updates the name of a Monday.com item",
    {
      itemId: z.string().describe("The item ID to update"),
      name: z.string().describe("The new name for the item"),
    },
    async ({ itemId, name }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const item = await updateItemName(accessToken, itemId, name);
      return makeMCPToolJSONSuccess({
        message: "Item name updated successfully",
        result: item,
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
      return makeMCPToolJSONSuccess({
        message: "Board created successfully",
        result: board,
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
        .describe("The type of column (e.g., 'text', 'status', 'date')"),
      description: z
        .string()
        .optional()
        .describe("Optional description for the column"),
    },
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
      return makeMCPToolJSONSuccess({
        message: "Column created successfully",
        result: column,
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
        .describe("Optional position for the group (e.g., 'top', 'bottom')"),
    },
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
      return makeMCPToolJSONSuccess({
        message: "Group created successfully",
        result: group,
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
      return makeMCPToolJSONSuccess({
        message: "Subitem created successfully",
        result: subitem,
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
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const result = await deleteGroup(accessToken, boardId, groupId);
      return makeMCPToolJSONSuccess({
        message: "Group deleted successfully",
        result,
      });
    }
  );

  server.tool(
    "duplicate_group",
    "Duplicates a group in a Monday.com board",
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
      return makeMCPToolJSONSuccess({
        message: "Group duplicated successfully",
        result: group,
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
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const subitem = await updateSubitem(accessToken, subitemId, columnValues);
      return makeMCPToolJSONSuccess({
        message: "Subitem updated successfully",
        result: subitem,
      });
    }
  );

  server.tool(
    "upload_file_to_column",
    "Uploads a file to a Monday.com column",
    {
      itemId: z.string().describe("The item ID to upload the file to"),
      columnId: z.string().describe("The column ID to upload the file to"),
      file: z.any().describe("The file to upload"),
    },
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
      return makeMCPToolJSONSuccess({
        message: "File uploaded successfully",
        result,
      });
    }
  );

  server.tool(
    "get_items_by_column_value",
    "Retrieves items from a board by column value",
    {
      boardId: z.string().describe("The board ID to search in"),
      columnId: z.string().describe("The column ID to filter by"),
      columnValue: z.string().describe("The column value to search for"),
    },
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
      return makeMCPToolJSONSuccess({
        message: "Items retrieved successfully",
        result: items,
      });
    }
  );

  server.tool(
    "find_user_by_name",
    "Finds a Monday.com user by name",
    {
      name: z.string().describe("The name of the user to find"),
    },
    async ({ name }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const user = await findUserByName(accessToken, name);
      if (!user) {
        return makeMCPToolTextError("User not found");
      }
      return makeMCPToolJSONSuccess({
        message: "User found successfully",
        result: user,
      });
    }
  );

  server.tool(
    "get_board_values",
    "Retrieves detailed information about a Monday.com board including columns and groups",
    {
      boardId: z.string().describe("The board ID to retrieve details for"),
    },
    async ({ boardId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const board = await getBoardValues(accessToken, boardId);
      return makeMCPToolJSONSuccess({
        message: "Board details retrieved successfully",
        result: board,
      });
    }
  );

  server.tool(
    "get_column_values",
    "Retrieves column values for a specific item and column",
    {
      boardId: z.string().describe("The board ID containing the item"),
      itemId: z.string().describe("The item ID to get column values from"),
      columnId: z.string().describe("The column ID to retrieve values for"),
    },
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
        return makeMCPToolTextError("Column value not found");
      }
      return makeMCPToolJSONSuccess({
        message: "Column values retrieved successfully",
        result: columnValue,
      });
    }
  );

  server.tool(
    "get_file_column_values",
    "Retrieves file column values for a specific item and column",
    {
      itemId: z.string().describe("The item ID to get file column values from"),
      columnId: z
        .string()
        .describe("The file column ID to retrieve values for"),
    },
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
      return makeMCPToolJSONSuccess({
        message: "File column values retrieved successfully",
        result: fileColumnValue,
      });
    }
  );

  server.tool(
    "get_group_details",
    "Retrieves details about a specific group in a Monday.com board",
    {
      boardId: z.string().describe("The board ID containing the group"),
      groupId: z.string().describe("The group ID to retrieve details for"),
    },
    async ({ boardId, groupId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const group = await getGroupDetails(accessToken, boardId, groupId);
      if (!group) {
        return makeMCPToolTextError("Group not found");
      }
      return makeMCPToolJSONSuccess({
        message: "Group details retrieved successfully",
        result: group,
      });
    }
  );

  server.tool(
    "get_subitem_values",
    "Retrieves subitems for a specific Monday.com item",
    {
      itemId: z.string().describe("The item ID to retrieve subitems for"),
    },
    async ({ itemId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const subitems = await getSubitemValues(accessToken, itemId);
      return makeMCPToolJSONSuccess({
        message: "Subitems retrieved successfully",
        result: subitems,
      });
    }
  );

  server.tool(
    "get_user_details",
    "Retrieves details about a specific Monday.com user",
    {
      userId: z.string().describe("The user ID to retrieve details for"),
    },
    async ({ userId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const user = await getUserDetails(accessToken, userId);
      if (!user) {
        return makeMCPToolTextError("User not found");
      }
      return makeMCPToolJSONSuccess({
        message: "User details retrieved successfully",
        result: user,
      });
    }
  );

  server.tool(
    "move_item_to_board",
    "Moves an item from one board to another. Useful for converting leads to opportunities in CRM workflows.",
    {
      itemId: z.string().describe("The item ID to move"),
      targetBoardId: z
        .string()
        .describe("The target board ID to move the item to"),
      targetGroupId: z
        .string()
        .describe("The target group ID in the destination board"),
      columnsMapping: z
        .array(
          z.object({
            source: z.string().describe("Source column ID"),
            target: z.string().describe("Target column ID"),
          })
        )
        .optional()
        .describe(
          "Optional mapping of column IDs between source and target boards"
        ),
    },
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
      return makeMCPToolJSONSuccess({
        message: "Item moved to board successfully",
        result: item,
      });
    }
  );

  server.tool(
    "create_multiple_items",
    "Creates multiple items in one or more boards in a single operation. Useful for bulk importing leads or opportunities.",
    {
      items: z
        .array(
          z.object({
            boardId: z.string().describe("The board ID to create the item in"),
            itemName: z.string().describe("The name of the new item"),
            groupId: z
              .string()
              .optional()
              .describe("Optional group ID to add the item to"),
            columnValues: z
              .record(z.any())
              .optional()
              .describe("Optional column values as a JSON object"),
          })
        )
        .describe("Array of items to create"),
    },
    async ({ items }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const createdItems = await createMultipleItems(accessToken, items);
      return makeMCPToolJSONSuccess({
        message: `Created ${createdItems.length} items successfully`,
        result: createdItems,
      });
    }
  );

  server.tool(
    "get_activity_logs",
    "Retrieves activity logs for a board. Useful for tracking pipeline velocity and user actions.",
    {
      boardId: z
        .string()
        .describe("The board ID to retrieve activity logs for"),
      from: z
        .string()
        .optional()
        .describe("Filter logs from this date (ISO 8601 format)"),
      to: z
        .string()
        .optional()
        .describe("Filter logs to this date (ISO 8601 format)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of logs to return (default: 50)"),
    },
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
      return makeMCPToolJSONSuccess({
        message: "Activity logs retrieved successfully",
        result: logs,
      });
    }
  );

  server.tool(
    "get_board_analytics",
    "Retrieves analytics and statistics for a board including item counts by status, group, and assignee. Useful for CRM reporting.",
    {
      boardId: z.string().describe("The board ID to retrieve analytics for"),
    },
    async ({ boardId }, { authInfo }) => {
      const accessToken = authInfo?.token;

      if (!accessToken) {
        throw new Error("No Monday.com access token found");
      }

      const analytics = await getBoardAnalytics(accessToken, boardId);
      return makeMCPToolJSONSuccess({
        message: "Board analytics retrieved successfully",
        result: analytics,
      });
    }
  );

  return server;
};

export default createServer;
