import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { SearchItemsFilters } from "@app/lib/api/actions/servers/monday/helpers";
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
} from "@app/lib/api/actions/servers/monday/helpers";
import { MONDAY_TOOLS_METADATA } from "@app/lib/api/actions/servers/monday/metadata";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof MONDAY_TOOLS_METADATA> = {
  get_boards: async (_params, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const boards = await getBoards(accessToken);
    return new Ok([
      { type: "text" as const, text: "Boards retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(boards, null, 2) },
    ]);
  },

  get_board_items: async ({ boardId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const items = await getBoardItems(accessToken, boardId);
    return new Ok([
      { type: "text" as const, text: "Board items retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(items, null, 2) },
    ]);
  },

  get_item_details: async ({ itemId }, { authInfo }) => {
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
  },

  search_items: async (
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
  },

  get_items_by_column_value: async (
    { boardId, columnId, columnValue },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const items = await getItemsByColumnValue(
      accessToken,
      boardId,
      columnId,
      columnValue
    );
    return new Ok([
      { type: "text" as const, text: "Items retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(items, null, 2) },
    ]);
  },

  find_user_by_name: async ({ name }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const user = await findUserByName(accessToken, name);
    if (!user) {
      return new Err(new MCPError("User not found", { tracked: false }));
    }
    return new Ok([
      { type: "text" as const, text: "User found successfully" },
      { type: "text" as const, text: JSON.stringify(user, null, 2) },
    ]);
  },

  get_board_values: async ({ boardId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const board = await getBoardValues(accessToken, boardId);
    return new Ok([
      { type: "text" as const, text: "Board details retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(board, null, 2) },
    ]);
  },

  get_column_values: async ({ boardId, itemId, columnId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const columnValue = await getColumnValues(
      accessToken,
      boardId,
      itemId,
      columnId
    );
    if (!columnValue) {
      return new Err(
        new MCPError("Column value not found", { tracked: false })
      );
    }
    return new Ok([
      { type: "text" as const, text: "Column values retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(columnValue, null, 2) },
    ]);
  },

  get_file_column_values: async ({ itemId, columnId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const fileColumnValue = await getFileColumnValues(
      accessToken,
      itemId,
      columnId
    );
    return new Ok([
      {
        type: "text" as const,
        text: "File column values retrieved successfully",
      },
      { type: "text" as const, text: JSON.stringify(fileColumnValue, null, 2) },
    ]);
  },

  get_group_details: async ({ boardId, groupId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const group = await getGroupDetails(accessToken, boardId, groupId);
    if (!group) {
      return new Err(new MCPError("Group not found", { tracked: false }));
    }
    return new Ok([
      { type: "text" as const, text: "Group details retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(group, null, 2) },
    ]);
  },

  get_subitem_values: async ({ itemId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const subitems = await getSubitemValues(accessToken, itemId);
    return new Ok([
      { type: "text" as const, text: "Subitems retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(subitems, null, 2) },
    ]);
  },

  get_user_details: async ({ userId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const user = await getUserDetails(accessToken, userId);
    if (!user) {
      return new Err(new MCPError("User not found", { tracked: false }));
    }
    return new Ok([
      { type: "text" as const, text: "User details retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(user, null, 2) },
    ]);
  },

  get_activity_logs: async ({ boardId, from, to, limit }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const logs = await getActivityLogs(
      accessToken,
      boardId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      limit
    );
    return new Ok([
      { type: "text" as const, text: "Activity logs retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(logs, null, 2) },
    ]);
  },

  get_board_analytics: async ({ boardId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const analytics = await getBoardAnalytics(accessToken, boardId);
    return new Ok([
      { type: "text" as const, text: "Board analytics retrieved successfully" },
      { type: "text" as const, text: JSON.stringify(analytics, null, 2) },
    ]);
  },

  create_item: async (
    { boardId, itemName, groupId, columnValues },
    { authInfo }
  ) => {
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
  },

  update_item: async ({ itemId, columnValues }, { authInfo }) => {
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
  },

  update_item_name: async ({ itemId, name }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const item = await updateItemName(accessToken, itemId, name);
    return new Ok([
      { type: "text" as const, text: "Item name updated successfully" },
      { type: "text" as const, text: JSON.stringify(item, null, 2) },
    ]);
  },

  create_update: async ({ itemId, body }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const update = await createUpdate(accessToken, itemId, body);
    return new Ok([
      { type: "text" as const, text: "Update added successfully" },
      { type: "text" as const, text: JSON.stringify(update, null, 2) },
    ]);
  },

  create_board: async (
    { boardName, boardKind, workspaceId, description },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const board = await createBoard(
      accessToken,
      boardName,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      boardKind || "public",
      workspaceId,
      description
    );
    return new Ok([
      { type: "text" as const, text: "Board created successfully" },
      { type: "text" as const, text: JSON.stringify(board, null, 2) },
    ]);
  },

  create_column: async (
    { boardId, title, columnType, description },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const column = await createColumn(
      accessToken,
      boardId,
      title,
      columnType,
      description
    );
    return new Ok([
      { type: "text" as const, text: "Column created successfully" },
      { type: "text" as const, text: JSON.stringify(column, null, 2) },
    ]);
  },

  create_group: async ({ boardId, groupName, position }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const group = await createGroup(accessToken, boardId, groupName, position);
    return new Ok([
      { type: "text" as const, text: "Group created successfully" },
      { type: "text" as const, text: JSON.stringify(group, null, 2) },
    ]);
  },

  create_subitem: async (
    { parentItemId, itemName, columnValues },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const subitem = await createSubitem(
      accessToken,
      parentItemId,
      itemName,
      columnValues
    );
    return new Ok([
      { type: "text" as const, text: "Subitem created successfully" },
      { type: "text" as const, text: JSON.stringify(subitem, null, 2) },
    ]);
  },

  update_subitem: async ({ subitemId, columnValues }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const subitem = await updateSubitem(accessToken, subitemId, columnValues);
    return new Ok([
      { type: "text" as const, text: "Subitem updated successfully" },
      { type: "text" as const, text: JSON.stringify(subitem, null, 2) },
    ]);
  },

  duplicate_group: async (
    { boardId, groupId, addToTop, groupTitle },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const group = await duplicateGroup(
      accessToken,
      boardId,
      groupId,
      addToTop,
      groupTitle
    );
    return new Ok([
      { type: "text" as const, text: "Group duplicated successfully" },
      { type: "text" as const, text: JSON.stringify(group, null, 2) },
    ]);
  },

  upload_file_to_column: async ({ itemId, columnId, file }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const result = await uploadFileToColumn(
      accessToken,
      itemId,
      columnId,
      file
    );
    return new Ok([
      { type: "text" as const, text: "File uploaded successfully" },
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ]);
  },

  delete_item: async ({ itemId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const result = await deleteItem(accessToken, itemId);
    return new Ok([
      { type: "text" as const, text: "Item deleted successfully" },
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ]);
  },

  delete_group: async ({ boardId, groupId }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const result = await deleteGroup(accessToken, boardId, groupId);
    return new Ok([
      { type: "text" as const, text: "Group deleted successfully" },
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ]);
  },

  move_item_to_board: async (
    { itemId, targetBoardId, targetGroupId, columnsMapping },
    { authInfo }
  ) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const item = await moveItemToBoard(
      accessToken,
      itemId,
      targetBoardId,
      targetGroupId,
      columnsMapping
    );
    return new Ok([
      { type: "text" as const, text: "Item moved to board successfully" },
      { type: "text" as const, text: JSON.stringify(item, null, 2) },
    ]);
  },

  create_multiple_items: async ({ items }, { authInfo }) => {
    const accessToken = authInfo?.token;

    if (!accessToken) {
      return new Err(new MCPError("No Monday.com access token found"));
    }

    const createdItems = await createMultipleItems(accessToken, items);
    return new Ok([
      {
        type: "text" as const,
        text: `Created ${createdItems.length} items successfully`,
      },
      { type: "text" as const, text: JSON.stringify(createdItems, null, 2) },
    ]);
  },
};

export const TOOLS = buildTools(MONDAY_TOOLS_METADATA, handlers);
