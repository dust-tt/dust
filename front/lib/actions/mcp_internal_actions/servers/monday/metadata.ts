import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// Exports for monitoring

export const MONDAY_TOOL_NAME = "monday" as const;

export const getBoardsSchema = {};

export const getBoardItemsSchema = {
  boardId: z.string().describe("The board ID to retrieve items from"),
};

export const getItemDetailsSchema = {
  itemId: z.string().describe("The item ID to retrieve details for"),
};

export const searchItemsSchema = {
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
};

export const createItemSchema = {
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
};

export const updateItemSchema = {
  itemId: z.string().describe("The item ID to update"),
  columnValues: z
    .record(z.any())
    .describe(
      'Column values to update as a JSON object (e.g., {"status": "Done", "priority": "High"})'
    ),
};

export const createUpdateSchema = {
  itemId: z.string().describe("The item ID to add the update to"),
  body: z.string().describe("The content of the update/comment"),
};

export const deleteItemSchema = {
  itemId: z.string().describe("The item ID to delete"),
};

export const updateItemNameSchema = {
  itemId: z.string().describe("The item ID to update"),
  name: z.string().describe("The new name for the item"),
};

export const createBoardSchema = {
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
};

export const createColumnSchema = {
  boardId: z.string().describe("The board ID to create the column in"),
  title: z.string().describe("The title of the new column"),
  columnType: z
    .string()
    .describe("The type of column (e.g., 'text', 'status', 'date')"),
  description: z
    .string()
    .optional()
    .describe("Optional description for the column"),
};

export const createGroupSchema = {
  boardId: z.string().describe("The board ID to create the group in"),
  groupName: z.string().describe("The name of the new group"),
  position: z
    .string()
    .optional()
    .describe("Optional position for the group (e.g., 'top', 'bottom')"),
};

export const createSubitemSchema = {
  parentItemId: z.string().describe("The parent item ID"),
  itemName: z.string().describe("The name of the new subitem"),
  columnValues: z
    .record(z.any())
    .optional()
    .describe("Optional column values as a JSON object"),
};

export const deleteGroupSchema = {
  boardId: z.string().describe("The board ID containing the group"),
  groupId: z.string().describe("The group ID to delete"),
};

export const duplicateGroupSchema = {
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
};

export const updateSubitemSchema = {
  subitemId: z.string().describe("The subitem ID to update"),
  columnValues: z
    .record(z.any())
    .describe("Column values to update as a JSON object"),
};

export const uploadFileToColumnSchema = {
  itemId: z.string().describe("The item ID to upload the file to"),
  columnId: z.string().describe("The column ID to upload the file to"),
  file: z.any().describe("The file to upload"),
};

export const getItemsByColumnValueSchema = {
  boardId: z.string().describe("The board ID to search in"),
  columnId: z.string().describe("The column ID to filter by"),
  columnValue: z.string().describe("The column value to search for"),
};

export const findUserByNameSchema = {
  name: z.string().describe("The name of the user to find"),
};

export const getBoardValuesSchema = {
  boardId: z.string().describe("The board ID to retrieve details for"),
};

export const getColumnValuesSchema = {
  boardId: z.string().describe("The board ID containing the item"),
  itemId: z.string().describe("The item ID to get column values from"),
  columnId: z.string().describe("The column ID to retrieve values for"),
};

export const getFileColumnValuesSchema = {
  itemId: z.string().describe("The item ID to get file column values from"),
  columnId: z.string().describe("The file column ID to retrieve values for"),
};

export const getGroupDetailsSchema = {
  boardId: z.string().describe("The board ID containing the group"),
  groupId: z.string().describe("The group ID to retrieve details for"),
};

export const getSubitemValuesSchema = {
  itemId: z.string().describe("The item ID to retrieve subitems for"),
};

export const getUserDetailsSchema = {
  userId: z.string().describe("The user ID to retrieve details for"),
};

export const moveItemToBoardSchema = {
  itemId: z.string().describe("The item ID to move"),
  targetBoardId: z.string().describe("The target board ID to move the item to"),
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
};

export const createMultipleItemsSchema = {
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
};

export const getActivityLogsSchema = {
  boardId: z.string().describe("The board ID to retrieve activity logs for"),
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
};

export const getBoardAnalyticsSchema = {
  boardId: z.string().describe("The board ID to retrieve analytics for"),
};

export const MONDAY_TOOLS: MCPToolType[] = [
  {
    name: "get_boards",
    description:
      "Lists all accessible boards in Monday.com workspace. Returns up to 100 boards.",
    inputSchema: zodToJsonSchema(z.object(getBoardsSchema)) as JSONSchema7,
  },
  {
    name: "get_board_items",
    description:
      "Retrieves items from a specific Monday.com board. Returns up to 100 items.",
    inputSchema: zodToJsonSchema(z.object(getBoardItemsSchema)) as JSONSchema7,
  },
  {
    name: "get_item_details",
    description:
      "Retrieves detailed information about a specific Monday.com item",
    inputSchema: zodToJsonSchema(z.object(getItemDetailsSchema)) as JSONSchema7,
  },
  {
    name: "search_items",
    description:
      "Searches for items in Monday.com with advanced filtering options. Returns up to 100 items.",
    inputSchema: zodToJsonSchema(z.object(searchItemsSchema)) as JSONSchema7,
  },
  {
    name: "create_item",
    description: "Creates a new item in a Monday.com board",
    inputSchema: zodToJsonSchema(z.object(createItemSchema)) as JSONSchema7,
  },
  {
    name: "update_item",
    description: "Updates column values of an existing Monday.com item",
    inputSchema: zodToJsonSchema(z.object(updateItemSchema)) as JSONSchema7,
  },
  {
    name: "create_update",
    description: "Adds an update (comment) to a Monday.com item",
    inputSchema: zodToJsonSchema(z.object(createUpdateSchema)) as JSONSchema7,
  },
  {
    name: "delete_item",
    description: "Deletes a Monday.com item",
    inputSchema: zodToJsonSchema(z.object(deleteItemSchema)) as JSONSchema7,
  },
  {
    name: "update_item_name",
    description: "Updates the name of a Monday.com item",
    inputSchema: zodToJsonSchema(z.object(updateItemNameSchema)) as JSONSchema7,
  },
  {
    name: "create_board",
    description: "Creates a new board in Monday.com",
    inputSchema: zodToJsonSchema(z.object(createBoardSchema)) as JSONSchema7,
  },
  {
    name: "create_column",
    description: "Creates a new column in a Monday.com board",
    inputSchema: zodToJsonSchema(z.object(createColumnSchema)) as JSONSchema7,
  },
  {
    name: "create_group",
    description: "Creates a new group in a Monday.com board",
    inputSchema: zodToJsonSchema(z.object(createGroupSchema)) as JSONSchema7,
  },
  {
    name: "create_subitem",
    description: "Creates a new subitem for a Monday.com item",
    inputSchema: zodToJsonSchema(z.object(createSubitemSchema)) as JSONSchema7,
  },
  {
    name: "delete_group",
    description: "Deletes a group from a Monday.com board",
    inputSchema: zodToJsonSchema(z.object(deleteGroupSchema)) as JSONSchema7,
  },
  {
    name: "duplicate_group",
    description: "Duplicates a group in a Monday.com board",
    inputSchema: zodToJsonSchema(z.object(duplicateGroupSchema)) as JSONSchema7,
  },
  {
    name: "update_subitem",
    description: "Updates column values of a Monday.com subitem",
    inputSchema: zodToJsonSchema(z.object(updateSubitemSchema)) as JSONSchema7,
  },
  {
    name: "upload_file_to_column",
    description: "Uploads a file to a Monday.com column",
    inputSchema: zodToJsonSchema(
      z.object(uploadFileToColumnSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_items_by_column_value",
    description: "Retrieves items from a board by column value",
    inputSchema: zodToJsonSchema(
      z.object(getItemsByColumnValueSchema)
    ) as JSONSchema7,
  },
  {
    name: "find_user_by_name",
    description: "Finds a Monday.com user by name",
    inputSchema: zodToJsonSchema(z.object(findUserByNameSchema)) as JSONSchema7,
  },
  {
    name: "get_board_values",
    description:
      "Retrieves detailed information about a Monday.com board including columns and groups",
    inputSchema: zodToJsonSchema(z.object(getBoardValuesSchema)) as JSONSchema7,
  },
  {
    name: "get_column_values",
    description: "Retrieves column values for a specific item and column",
    inputSchema: zodToJsonSchema(
      z.object(getColumnValuesSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_file_column_values",
    description: "Retrieves file column values for a specific item and column",
    inputSchema: zodToJsonSchema(
      z.object(getFileColumnValuesSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_group_details",
    description:
      "Retrieves details about a specific group in a Monday.com board",
    inputSchema: zodToJsonSchema(
      z.object(getGroupDetailsSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_subitem_values",
    description: "Retrieves subitems for a specific Monday.com item",
    inputSchema: zodToJsonSchema(
      z.object(getSubitemValuesSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_user_details",
    description: "Retrieves details about a specific Monday.com user",
    inputSchema: zodToJsonSchema(z.object(getUserDetailsSchema)) as JSONSchema7,
  },
  {
    name: "move_item_to_board",
    description:
      "Moves an item from one board to another. Useful for converting leads to opportunities in CRM workflows.",
    inputSchema: zodToJsonSchema(
      z.object(moveItemToBoardSchema)
    ) as JSONSchema7,
  },
  {
    name: "create_multiple_items",
    description:
      "Creates multiple items in one or more boards in a single operation. Useful for bulk importing leads or opportunities.",
    inputSchema: zodToJsonSchema(
      z.object(createMultipleItemsSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_activity_logs",
    description:
      "Retrieves activity logs for a board. Useful for tracking pipeline velocity and user actions.",
    inputSchema: zodToJsonSchema(
      z.object(getActivityLogsSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_board_analytics",
    description:
      "Retrieves analytics and statistics for a board including item counts by status, group, and assignee. Useful for CRM reporting.",
    inputSchema: zodToJsonSchema(
      z.object(getBoardAnalyticsSchema)
    ) as JSONSchema7,
  },
];

export const MONDAY_SERVER_INFO = {
  name: "monday" as const,
  version: "1.0.0",
  description: "Manage project boards, items and updates.",
  authorization: {
    provider: "monday" as const,
    supported_use_cases: [
      "personal_actions",
      "platform_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "MondayLogo" as const,
  documentationUrl:
    "https://developer.monday.com/api-reference/docs/introduction-to-graphql",
  instructions: null,
};

export const MONDAY_TOOL_STAKES = {
  // Read operations
  get_boards: "never_ask",
  get_board_items: "never_ask",
  get_item_details: "never_ask",
  search_items: "never_ask",
  get_items_by_column_value: "never_ask",
  find_user_by_name: "never_ask",
  get_board_values: "never_ask",
  get_column_values: "never_ask",
  get_file_column_values: "never_ask",
  get_group_details: "never_ask",
  get_subitem_values: "never_ask",
  get_user_details: "never_ask",
  get_activity_logs: "never_ask",
  get_board_analytics: "never_ask",

  // Write operations - High stakes
  create_item: "high",
  update_item: "high",
  update_item_name: "high",
  create_update: "high",
  create_board: "high",
  create_column: "high",
  create_group: "high",
  create_subitem: "high",
  update_subitem: "high",
  duplicate_group: "high",
  upload_file_to_column: "high",
  delete_item: "high",
  delete_group: "high",
  move_item_to_board: "high",
  create_multiple_items: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;
