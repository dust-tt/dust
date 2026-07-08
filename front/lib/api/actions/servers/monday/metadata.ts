import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const MONDAY_TOOLS_METADATA = createToolsRecord({
  get_boards: {
    description:
      "List all accessible boards in Monday.com workspace. Returns up to 100 boards.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Monday boards",
      done: "List Monday boards",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_board_items: {
    description:
      "Retrieve items from a specific Monday.com board. Returns up to 100 items.",
    schema: {
      boardId: z.string().describe("The board ID to retrieve items from"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday board items",
      done: "Retrieve Monday board items",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_item_details: {
    description:
      "Retrieve detailed information about a specific Monday.com item",
    schema: {
      itemId: z.string().describe("The item ID to retrieve details for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday item details",
      done: "Retrieve Monday item details",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  search_items: {
    description:
      "Search for items in Monday.com with advanced filtering options. Returns up to 100 items.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Searching Monday items",
      done: "Search Monday items",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_items_by_column_value: {
    description: "Retrieve items from a board by column value",
    schema: {
      boardId: z.string().describe("The board ID to search in"),
      columnId: z.string().describe("The column ID to filter by"),
      columnValue: z.string().describe("The column value to search for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday items by column value",
      done: "Retrieve Monday items by column value",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  find_user_by_name: {
    description: "Find a Monday.com user by name",
    schema: {
      name: z.string().describe("The name of the user to find"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Finding Monday user",
      done: "Find Monday user",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_board_values: {
    description:
      "Retrieve detailed information about a Monday.com board including columns and groups",
    schema: {
      boardId: z.string().describe("The board ID to retrieve details for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday board details",
      done: "Retrieve Monday board details",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_column_values: {
    description: "Retrieve column values for a specific item and column",
    schema: {
      boardId: z.string().describe("The board ID containing the item"),
      itemId: z.string().describe("The item ID to get column values from"),
      columnId: z.string().describe("The column ID to retrieve values for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday column values",
      done: "Retrieve Monday column values",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_file_column_values: {
    description: "Retrieve file column values for a specific item and column",
    schema: {
      itemId: z.string().describe("The item ID to get file column values from"),
      columnId: z
        .string()
        .describe("The file column ID to retrieve values for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday file column values",
      done: "Retrieve Monday file column values",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_group_details: {
    description:
      "Retrieve details about a specific group in a Monday.com board",
    schema: {
      boardId: z.string().describe("The board ID containing the group"),
      groupId: z.string().describe("The group ID to retrieve details for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday group details",
      done: "Retrieve Monday group details",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_subitem_values: {
    description: "Retrieve subitems for a specific Monday.com item",
    schema: {
      itemId: z.string().describe("The item ID to retrieve subitems for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday subitems",
      done: "Retrieve Monday subitems",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_user_details: {
    description: "Retrieve details about a specific Monday.com user",
    schema: {
      userId: z.string().describe("The user ID to retrieve details for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday user details",
      done: "Retrieve Monday user details",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_activity_logs: {
    description:
      "Retrieve activity logs for a board. Useful for tracking pipeline velocity and user actions.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday activity logs",
      done: "Retrieve Monday activity logs",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  get_board_analytics: {
    description:
      "Retrieve analytics and statistics for a board including item counts by status, group, and assignee. Useful for CRM reporting.",
    schema: {
      boardId: z.string().describe("The board ID to retrieve analytics for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Monday board analytics",
      done: "Retrieve Monday board analytics",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  create_item: {
    description: "Create a new item in a Monday.com board",
    schema: {
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
    stake: "high",
    displayLabels: {
      running: "Creating Monday item",
      done: "Create Monday item",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  update_item: {
    description: "Update column values of an existing Monday.com item",
    schema: {
      itemId: z.string().describe("The item ID to update"),
      columnValues: z
        .record(z.any())
        .describe(
          'Column values to update as a JSON object (e.g., {"status": "Done", "priority": "High"})'
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating Monday item",
      done: "Update Monday item",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  update_item_name: {
    description: "Update the name of a Monday.com item",
    schema: {
      itemId: z.string().describe("The item ID to update"),
      name: z.string().describe("The new name for the item"),
    },
    stake: "high",
    displayLabels: {
      running: "Updating Monday item name",
      done: "Update Monday item name",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  create_update: {
    description: "Add an update (comment) to a Monday.com item",
    schema: {
      itemId: z.string().describe("The item ID to add the update to"),
      body: z.string().describe("The content of the update/comment"),
    },
    stake: "high",
    displayLabels: {
      running: "Adding Monday update",
      done: "Add Monday update",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  create_board: {
    description: "Create a new board in Monday.com",
    schema: {
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
    stake: "high",
    displayLabels: {
      running: "Creating Monday board",
      done: "Create Monday board",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  create_column: {
    description: "Create a new column in a Monday.com board",
    schema: {
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
    stake: "high",
    displayLabels: {
      running: "Creating Monday column",
      done: "Create Monday column",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  create_group: {
    description: "Create a new group in a Monday.com board",
    schema: {
      boardId: z.string().describe("The board ID to create the group in"),
      groupName: z.string().describe("The name of the new group"),
      position: z
        .string()
        .optional()
        .describe("Optional position for the group (e.g., 'top', 'bottom')"),
    },
    stake: "high",
    displayLabels: {
      running: "Creating Monday group",
      done: "Create Monday group",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  create_subitem: {
    description: "Create a new subitem for a Monday.com item",
    schema: {
      parentItemId: z.string().describe("The parent item ID"),
      itemName: z.string().describe("The name of the new subitem"),
      columnValues: z
        .record(z.any())
        .optional()
        .describe("Optional column values as a JSON object"),
    },
    stake: "high",
    displayLabels: {
      running: "Creating Monday subitem",
      done: "Create Monday subitem",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  update_subitem: {
    description: "Update column values of a Monday.com subitem",
    schema: {
      subitemId: z.string().describe("The subitem ID to update"),
      columnValues: z
        .record(z.any())
        .describe("Column values to update as a JSON object"),
    },
    stake: "high",
    displayLabels: {
      running: "Updating Monday subitem",
      done: "Update Monday subitem",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  duplicate_group: {
    description: "Duplicate a group in a Monday.com board",
    schema: {
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
    stake: "high",
    displayLabels: {
      running: "Duplicating Monday group",
      done: "Duplicate Monday group",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  upload_file_to_column: {
    description: "Upload a file to a Monday.com column",
    schema: {
      itemId: z.string().describe("The item ID to upload the file to"),
      columnId: z.string().describe("The column ID to upload the file to"),
      file: z.any().describe("The file to upload"),
    },
    stake: "high",
    displayLabels: {
      running: "Uploading file to Monday",
      done: "Upload file to Monday",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  delete_item: {
    description: "Delete a Monday.com item",
    schema: {
      itemId: z.string().describe("The item ID to delete"),
    },
    stake: "high",
    displayLabels: {
      running: "Deleting Monday item",
      done: "Delete Monday item",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  delete_group: {
    description: "Delete a group from a Monday.com board",
    schema: {
      boardId: z.string().describe("The board ID containing the group"),
      groupId: z.string().describe("The group ID to delete"),
    },
    stake: "high",
    displayLabels: {
      running: "Deleting Monday group",
      done: "Delete Monday group",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  move_item_to_board: {
    description:
      "Move an item from one board to another. Useful for converting leads to opportunities in CRM workflows.",
    schema: {
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
    stake: "high",
    displayLabels: {
      running: "Moving Monday item to board",
      done: "Move Monday item to board",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  create_multiple_items: {
    description:
      "Create multiple items in one or more boards in a single operation. Useful for bulk importing leads or opportunities.",
    schema: {
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
    stake: "high",
    displayLabels: {
      running: "Creating multiple Monday items",
      done: "Create multiple Monday items",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
});

export const MONDAY_SERVER = {
  serverInfo: {
    name: "monday",
    version: "1.0.0",
    description:
      "Interact with Monday.com boards, items, and workflows. Manage tasks, track projects, and automate CRM workflows.",
    authorization: {
      provider: "monday",
      supported_use_cases: ["personal_actions", "platform_actions"],
    },
    icon: "MondayLogo",
    documentationUrl: "https://docs.dust.tt/docs/monday",
  },
  tools: Object.values(MONDAY_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(MONDAY_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
