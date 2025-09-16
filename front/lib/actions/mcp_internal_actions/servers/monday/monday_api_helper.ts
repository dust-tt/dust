import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

const localLogger = logger.child({ module: "monday_api_helper" });

export interface MondayBoard {
  id: string;
  name: string;
  description?: string;
  state: string;
  board_folder_id?: string;
  board_kind: string;
  workspace_id?: string;
}

export interface MondayItem {
  id: string;
  name: string;
  state: string;
  board: {
    id: string;
    name: string;
  };
  group: {
    id: string;
    title: string;
  };
  column_values: MondayColumnValue[];
  created_at: string;
  updated_at?: string;
  creator?: {
    id: string;
    name: string;
    email?: string;
  };
}

export interface MondayColumnValue {
  id: string;
  column: {
    title: string;
  };
  type: string;
  value?: string;
  text?: string;
}

export interface MondayUser {
  id: string;
  name: string;
  email: string;
  title?: string;
  phone?: string;
}

export interface MondayWorkspace {
  id: string;
  name: string;
  kind: string;
  description?: string;
}

const RETRIEVAL_LIMIT = 100;

const makeGraphQLRequest = async (
  accessToken: string,
  query: string,
  variables?: Record<string, any>
): Promise<any> => {
  try {
    const response = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "API-Version": "2024-01", // Add API version header
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    // Capture response text for better error reporting
    const responseText = await response.text();

    if (!response.ok) {
      localLogger.error("Monday API HTTP error", {
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText,
        query: query.substring(0, 200), // Log first 200 chars of query
        variables,
      });

      // Special handling for authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Authentication failed: ${response.status} - Token may be expired or invalid`
        );
      }

      // Include response body in error message for better debugging
      let errorMessage = `Monday API request failed: ${response.status} ${response.statusText}`;
      if (responseText) {
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error_message) {
            errorMessage += ` - ${errorData.error_message}`;
          } else if (errorData.errors) {
            errorMessage += ` - ${JSON.stringify(errorData.errors)}`;
          }
        } catch {
          // If not JSON, include raw text (truncated)
          errorMessage += ` - ${responseText.substring(0, 200)}`;
        }
      }

      const error = new Error(errorMessage);
      throw normalizeError(error);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      localLogger.error("Failed to parse Monday API response", {
        responseText,
        parseError,
      });
      throw new Error("Invalid JSON response from Monday API");
    }

    if (result.errors) {
      localLogger.error("Monday GraphQL error", {
        errors: result.errors,
        query: query.substring(0, 200),
        variables,
      });

      const errorDetails = result.errors
        .map((e: any) =>
          e.extensions
            ? `${e.message} (${JSON.stringify(e.extensions)})`
            : e.message
        )
        .join(", ");

      const error = new Error(`Monday GraphQL error: ${errorDetails}`);
      throw normalizeError(error);
    }

    return result.data;
  } catch (error) {
    localLogger.error("Error making Monday API request:", {
      error,
      query: query.substring(0, 200),
    });
    throw normalizeError(error);
  }
};

export const getBoards = async (
  accessToken: string
): Promise<MondayBoard[]> => {
  const query = `
    query GetBoards($limit: Int!) {
      boards(limit: $limit) {
        id
        name
        description
        state
        board_folder_id
        board_kind
        workspace_id
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    limit: RETRIEVAL_LIMIT,
  });
  return data.boards;
};

export const getBoardItems = async (
  accessToken: string,
  boardId: string
): Promise<MondayItem[]> => {
  // Convert boardId to integer to ensure proper format
  const boardIdInt = parseInt(boardId, 10);
  if (isNaN(boardIdInt)) {
    throw new Error(`Invalid board ID: ${boardId}`);
  }

  const query = `
    query GetBoardItems($boardIds: [ID!], $limit: Int!) {
      boards(ids: $boardIds) {
        items_page(limit: $limit) {
          items {
            id
            name
            state
            board {
              id
              name
            }
            group {
              id
              title
            }
            column_values {
              id
              column {
                title
              }
              type
              value
              text
            }
            created_at
            updated_at
            creator {
              id
              name
              email
            }
          }
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardIds: [boardIdInt],
    limit: RETRIEVAL_LIMIT,
  });
  return data.boards[0]?.items_page?.items || [];
};

export const getItemDetails = async (
  accessToken: string,
  itemId: string
): Promise<MondayItem | null> => {
  const query = `
    query GetItemDetails($itemId: ID!) {
      items(ids: [$itemId]) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          title
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, { itemId });
  return data.items?.[0] || null;
};

export interface SearchItemsFilters {
  query?: string;
  boardId?: string;
  status?: string;
  assigneeId?: string;
  timeframe?: {
    start?: Date;
    end?: Date;
  };
  groupId?: string;
  orderBy?: "created_at" | "updated_at" | "name";
  orderDirection?: "asc" | "desc";
}

export const searchItems = async (
  accessToken: string,
  filters: SearchItemsFilters
): Promise<MondayItem[]> => {
  // Build the query based on filters
  let query: string;
  const variables: Record<string, any> = { limit: RETRIEVAL_LIMIT };

  if (filters.boardId) {
    // Search within a specific board
    // Convert boardId to integer
    const boardIdInt = parseInt(filters.boardId, 10);
    if (isNaN(boardIdInt)) {
      throw new Error(`Invalid board ID: ${filters.boardId}`);
    }

    query = `
      query SearchBoardItems($boardIds: [ID!], $limit: Int!) {
        boards(ids: $boardIds) {
          items_page(limit: $limit) {
            items {
              id
              name
              state
              board {
                id
                name
              }
              group {
                id
                title
              }
              column_values {
                id
                column {
                  title
                }
                type
                value
                text
              }
              created_at
              updated_at
              creator {
                id
                name
                email
              }
            }
          }
        }
      }
    `;
    variables.boardIds = [boardIdInt];
  } else {
    // For global search, first get all boards, then search items
    query = `
      query SearchAllItems($boardLimit: Int!) {
        boards(limit: $boardLimit) {
          id
          name
          items_page(limit: 25) {
            items {
              id
              name
              state
              board {
                id
                name
              }
              group {
                id
                title
              }
              column_values {
                id
                column {
                  title
                }
                type
                value
                text
              }
              created_at
              updated_at
              creator {
                id
                name
                email
              }
            }
          }
        }
      }
    `;
    variables.boardLimit = 10; // Limit boards to avoid timeout
  }

  const data = await makeGraphQLRequest(accessToken, query, variables);

  // Get all items
  let allItems: MondayItem[] = [];
  if (filters.boardId) {
    allItems = data.boards[0]?.items_page?.items || [];
  } else {
    // For global search, collect items from all boards
    if (data.boards && Array.isArray(data.boards)) {
      allItems = data.boards.flatMap(
        (board: any) => board.items_page?.items || []
      );
    }
  }

  // Apply client-side filters
  if (filters.query) {
    const searchQuery = filters.query.toLowerCase();
    allItems = allItems.filter(
      (item: MondayItem) =>
        item.name.toLowerCase().includes(searchQuery) ||
        item.column_values.some((col: MondayColumnValue) =>
          col.text?.toLowerCase().includes(searchQuery)
        )
    );
  }

  // Filter by status
  if (filters.status) {
    allItems = allItems.filter((item: MondayItem) => {
      const statusColumn = item.column_values.find(
        (col) =>
          col.type === "status" ||
          col.column.title.toLowerCase().includes("status")
      );
      return (
        statusColumn?.text?.toLowerCase() === filters.status?.toLowerCase()
      );
    });
  }

  // Filter by assignee
  if (filters.assigneeId) {
    allItems = allItems.filter((item: MondayItem) => {
      const peopleColumns = item.column_values.filter(
        (col) => col.type === "people" || col.type === "person"
      );
      return peopleColumns.some((col) => {
        try {
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const value = JSON.parse(col.value || "{}");
          const personsIds =
            value.personsAndTeams?.map((p: any) => p.id.toString()) || [];
          return personsIds.includes(filters.assigneeId);
        } catch {
          return false;
        }
      });
    });
  }

  // Filter by group
  if (filters.groupId) {
    allItems = allItems.filter(
      (item: MondayItem) => item.group.id === filters.groupId
    );
  }

  // Filter by timeframe
  if (filters.timeframe) {
    allItems = allItems.filter((item: MondayItem) => {
      const createdAt = new Date(item.created_at);
      if (filters.timeframe?.start && createdAt < filters.timeframe.start) {
        return false;
      }
      if (filters.timeframe?.end && createdAt > filters.timeframe.end) {
        return false;
      }
      return true;
    });
  }

  // Sort items
  if (filters.orderBy) {
    allItems.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (filters.orderBy) {
        case "created_at":
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case "updated_at":
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          aVal = new Date(a.updated_at || a.created_at).getTime();
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          bVal = new Date(b.updated_at || b.created_at).getTime();
          break;
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        default:
          return 0;
      }

      const direction = filters.orderDirection === "desc" ? -1 : 1;
      return aVal < bVal ? -direction : aVal > bVal ? direction : 0;
    });
  }

  // Return limited results
  return allItems.slice(0, RETRIEVAL_LIMIT);
};

export const createItem = async (
  accessToken: string,
  boardId: string,
  itemName: string,
  groupId?: string,
  columnValues?: Record<string, any>
): Promise<MondayItem> => {
  const query = `
    mutation CreateItem($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON) {
      create_item(
        board_id: $boardId
        item_name: $itemName
        group_id: $groupId
        column_values: $columnValues
      ) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          title
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    }
  `;

  const variables = {
    boardId,
    itemName,
    groupId,
    columnValues: columnValues ? JSON.stringify(columnValues) : undefined,
  };

  const data = await makeGraphQLRequest(accessToken, query, variables);
  return data.create_item;
};

export const updateItem = async (
  accessToken: string,
  itemId: string,
  columnValues: Record<string, any>
): Promise<MondayItem> => {
  const query = `
    mutation UpdateItem($itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        item_id: $itemId
        column_values: $columnValues
      ) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          title
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    }
  `;

  const variables = {
    itemId,
    columnValues: JSON.stringify(columnValues),
  };

  const data = await makeGraphQLRequest(accessToken, query, variables);
  return data.change_multiple_column_values;
};

export const createUpdate = async (
  accessToken: string,
  itemId: string,
  body: string
): Promise<{ id: string; body: string; created_at: string }> => {
  const query = `
    mutation CreateUpdate($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
        body
        created_at
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, { itemId, body });
  return data.create_update;
};

export const deleteItem = async (
  accessToken: string,
  itemId: string
): Promise<{ id: string }> => {
  const query = `
    mutation DeleteItem($itemId: ID!) {
      delete_item(item_id: $itemId) {
        id
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, { itemId });
  return data.delete_item;
};

export const updateItemName = async (
  accessToken: string,
  itemId: string,
  name: string
): Promise<MondayItem> => {
  // First get the item to find its board ID
  const itemDetails = await getItemDetails(accessToken, itemId);
  if (!itemDetails) {
    throw new Error("Item not found");
  }

  const query = `
    mutation UpdateItemName($boardId: ID!, $itemId: ID!, $name: String!) {
      change_simple_column_value(
        item_id: $itemId
        board_id: $boardId
        column_id: "name"
        value: $name
      ) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          title
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardId: itemDetails.board.id,
    itemId,
    name,
  });
  return data.change_simple_column_value;
};

export const createBoard = async (
  accessToken: string,
  boardName: string,
  boardKind: string = "public",
  workspaceId?: string,
  description?: string
): Promise<MondayBoard> => {
  const query = `
    mutation CreateBoard($boardName: String!, $boardKind: BoardKind!, $workspaceId: ID, $description: String) {
      create_board(
        board_name: $boardName
        board_kind: $boardKind
        workspace_id: $workspaceId
        description: $description
      ) {
        id
        name
        description
        state
        board_folder_id
        board_kind
        workspace_id
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardName,
    boardKind,
    workspaceId,
    description,
  });
  return data.create_board;
};

export const createColumn = async (
  accessToken: string,
  boardId: string,
  title: string,
  columnType: string,
  description?: string
): Promise<{ id: string; title: string; type: string }> => {
  const query = `
    mutation CreateColumn($boardId: ID!, $title: String!, $columnType: ColumnType!, $description: String) {
      create_column(
        board_id: $boardId
        title: $title
        column_type: $columnType
        description: $description
      ) {
        id
        title
        type
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardId,
    title,
    columnType,
    description,
  });
  return data.create_column;
};

export const createGroup = async (
  accessToken: string,
  boardId: string,
  groupName: string,
  position?: string
): Promise<{ id: string; title: string; position: string }> => {
  const query = `
    mutation CreateGroup($boardId: ID!, $groupName: String!, $position: String) {
      create_group(
        board_id: $boardId
        group_name: $groupName
        position: $position
      ) {
        id
        title
        position
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardId,
    groupName,
    position,
  });
  return data.create_group;
};

export const createSubitem = async (
  accessToken: string,
  parentItemId: string,
  itemName: string,
  columnValues?: Record<string, any>
): Promise<MondayItem> => {
  const query = `
    mutation CreateSubitem($parentItemId: ID!, $itemName: String!, $columnValues: JSON) {
      create_subitem(
        parent_item_id: $parentItemId
        item_name: $itemName
        column_values: $columnValues
      ) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          title
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    }
  `;

  const variables = {
    parentItemId,
    itemName,
    columnValues: columnValues ? JSON.stringify(columnValues) : undefined,
  };

  const data = await makeGraphQLRequest(accessToken, query, variables);
  return data.create_subitem;
};

export const deleteGroup = async (
  accessToken: string,
  boardId: string,
  groupId: string
): Promise<{ id: string; deleted: boolean }> => {
  const query = `
    mutation DeleteGroup($boardId: ID!, $groupId: String!) {
      delete_group(board_id: $boardId, group_id: $groupId) {
        id
        deleted
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardId,
    groupId,
  });
  return data.delete_group;
};

export const duplicateGroup = async (
  accessToken: string,
  boardId: string,
  groupId: string,
  addToTop?: boolean,
  groupTitle?: string
): Promise<{ id: string; title: string }> => {
  const query = `
    mutation DuplicateGroup($boardId: ID!, $groupId: String!, $addToTop: Boolean, $groupTitle: String) {
      duplicate_group(
        board_id: $boardId
        group_id: $groupId
        add_to_top: $addToTop
        group_title: $groupTitle
      ) {
        id
        title
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardId,
    groupId,
    addToTop,
    groupTitle,
  });
  return data.duplicate_group;
};

export const updateSubitem = async (
  accessToken: string,
  subitemId: string,
  columnValues: Record<string, any>
): Promise<MondayItem> => {
  const query = `
    mutation UpdateSubitem($subitemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        item_id: $subitemId
        column_values: $columnValues
      ) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          title
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    }
  `;

  const variables = {
    subitemId,
    columnValues: JSON.stringify(columnValues),
  };

  const data = await makeGraphQLRequest(accessToken, query, variables);
  return data.change_multiple_column_values;
};

export const uploadFileToColumn = async (
  accessToken: string,
  itemId: string,
  columnId: string,
  file: File | Blob
): Promise<{ id: string; url: string }> => {
  const formData = new FormData();
  formData.append(
    "query",
    `
    mutation AddFileToColumn($itemId: ID!, $columnId: String!, $file: File!) {
      add_file_to_column(
        item_id: $itemId
        column_id: $columnId
        file: $file
      ) {
        id
        url
      }
    }
  `
  );
  formData.append(
    "variables",
    JSON.stringify({
      itemId,
      columnId,
    })
  );
  formData.append(
    "map",
    JSON.stringify({
      "0": ["variables.file"],
    })
  );
  formData.append("0", file);

  try {
    const response = await fetch("https://api.monday.com/v2/file", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = new Error(
        `Monday API file upload failed: ${response.status} ${response.statusText}`
      );
      throw normalizeError(error);
    }

    const result = await response.json();

    if (result.errors) {
      const error = new Error(
        `Monday GraphQL error: ${result.errors.map((e: any) => e.message).join(", ")}`
      );
      throw normalizeError(error);
    }

    return result.data.add_file_to_column;
  } catch (error) {
    localLogger.error("Error uploading file to Monday:", error);
    throw normalizeError(error);
  }
};

export const getItemsByColumnValue = async (
  accessToken: string,
  boardId: string,
  columnId: string,
  columnValue: string
): Promise<MondayItem[]> => {
  const query = `
    query GetItemsByColumnValue($boardId: ID!, $columnId: String!, $columnValue: String!, $limit: Int!) {
      items_page_by_column_values(
        board_id: $boardId
        columns: [{column_id: $columnId, column_values: [$columnValue]}]
        limit: $limit
      ) {
        items {
          id
          name
          state
          board {
            id
            name
          }
          group {
            id
            title
          }
          column_values {
            id
            title
            type
            value
            text
          }
          created_at
          updated_at
          creator {
            id
            name
            email
          }
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardId,
    columnId,
    columnValue,
    limit: RETRIEVAL_LIMIT,
  });
  return data.items_page_by_column_values?.items || [];
};

export const findUserByName = async (
  accessToken: string,
  name: string
): Promise<MondayUser | null> => {
  const query = `
    query FindUsers {
      users {
        id
        name
        email
        title
        phone
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query);
  const users = data.users || [];

  return (
    users.find(
      (user: MondayUser) => user.name.toLowerCase() === name.toLowerCase()
    ) || null
  );
};

export const getBoardValues = async (
  accessToken: string,
  boardId: string
): Promise<any> => {
  // Convert boardId to integer
  const boardIdInt = parseInt(boardId, 10);
  if (isNaN(boardIdInt)) {
    throw new Error(`Invalid board ID: ${boardId}`);
  }

  const query = `
    query GetBoardValues($boardIds: [ID!]) {
      boards(ids: $boardIds) {
        id
        name
        description
        state
        board_kind
        workspace_id
        columns {
          id
          title
          type
          settings_str
        }
        groups {
          id
          title
          position
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardIds: [boardIdInt],
  });
  return data.boards[0] || null;
};

export const getColumnValues = async (
  accessToken: string,
  _boardId: string,
  itemId: string,
  columnId: string
): Promise<MondayColumnValue | null> => {
  const query = `
    query GetColumnValues($itemId: ID!, $columnId: String!) {
      items(ids: [$itemId]) {
        column_values(ids: [$columnId]) {
          id
          title
          type
          value
          text
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    itemId,
    columnId,
  });
  const item = data.items?.[0];
  return item?.column_values?.[0] || null;
};

export const getFileColumnValues = async (
  accessToken: string,
  itemId: string,
  columnId: string
): Promise<any> => {
  const query = `
    query GetFileColumnValues($itemId: ID!, $columnId: String!) {
      items(ids: [$itemId]) {
        column_values(ids: [$columnId]) {
          id
          title
          type
          value
          text
          ... on FileValue {
            files {
              id
              name
              url
              file_size
              file_extension
              uploaded_by {
                id
                name
              }
            }
          }
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    itemId,
    columnId,
  });
  const item = data.items?.[0];
  const columnValue = item?.column_values?.[0];

  if (columnValue?.type === "file") {
    return {
      ...columnValue,
      files: JSON.parse(columnValue.value || "[]"),
    };
  }

  return null;
};

export const getGroupDetails = async (
  accessToken: string,
  boardId: string,
  groupId: string
): Promise<{ id: string; title: string; position: string } | null> => {
  // Convert boardId to integer
  const boardIdInt = parseInt(boardId, 10);
  if (isNaN(boardIdInt)) {
    throw new Error(`Invalid board ID: ${boardId}`);
  }

  const query = `
    query GetGroupDetails($boardIds: [ID!], $groupId: String!) {
      boards(ids: $boardIds) {
        groups(ids: [$groupId]) {
          id
          title
          position
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, {
    boardIds: [boardIdInt],
    groupId,
  });
  const board = data.boards?.[0];
  return board?.groups?.[0] || null;
};

export const getSubitemValues = async (
  accessToken: string,
  itemId: string
): Promise<MondayItem[]> => {
  const query = `
    query GetSubitemValues($itemId: ID!) {
      items(ids: [$itemId]) {
        subitems {
          id
          name
          state
          board {
            id
            name
          }
          group {
            id
            title
          }
          column_values {
            id
            title
            type
            value
            text
          }
          created_at
          updated_at
          creator {
            id
            name
            email
          }
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, { itemId });
  const item = data.items?.[0];
  return item?.subitems || [];
};

export const getUserDetails = async (
  accessToken: string,
  userId: string
): Promise<MondayUser | null> => {
  const query = `
    query GetUserDetails($userId: ID!) {
      users(ids: [$userId]) {
        id
        name
        email
        title
        phone
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, { userId });
  return data.users?.[0] || null;
};

export const moveItemToBoard = async (
  accessToken: string,
  itemId: string,
  targetBoardId: string,
  targetGroupId: string,
  columnsMapping?: Array<{ source: string; target: string }>
): Promise<MondayItem> => {
  const query = `
    mutation MoveItemToBoard($itemId: ID!, $boardId: ID!, $groupId: String!, $columnsMapping: [ColumnMappingInput!]) {
      move_item_to_board(
        item_id: $itemId
        board_id: $boardId
        group_id: $groupId
        columns_mapping: $columnsMapping
      ) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          column {
            title
          }
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    }
  `;

  const variables = {
    itemId,
    boardId: targetBoardId,
    groupId: targetGroupId,
    columnsMapping,
  };

  const data = await makeGraphQLRequest(accessToken, query, variables);
  return data.move_item_to_board;
};

export const createMultipleItems = async (
  accessToken: string,
  items: Array<{
    boardId: string;
    itemName: string;
    groupId?: string;
    columnValues?: Record<string, any>;
  }>
): Promise<MondayItem[]> => {
  const mutations = items
    .map(
      (item, index) => `
      item${index}: create_item(
        board_id: ${item.boardId}
        item_name: "${item.itemName}"
        ${item.groupId ? `group_id: "${item.groupId}"` : ""}
        ${
          item.columnValues
            ? `column_values: ${JSON.stringify(
                JSON.stringify(item.columnValues)
              )}`
            : ""
        }
      ) {
        id
        name
        state
        board {
          id
          name
        }
        group {
          id
          title
        }
        column_values {
          id
          column {
            title
          }
          type
          value
          text
        }
        created_at
        updated_at
        creator {
          id
          name
          email
        }
      }
    `
    )
    .join("\n");

  const query = `
    mutation CreateMultipleItems {
      ${mutations}
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query);
  return Object.values(data);
};

export interface ActivityLog {
  id: string;
  event: string;
  data: any;
  user: {
    id: string;
    name: string;
  };
  created_at: string;
}

export const getActivityLogs = async (
  accessToken: string,
  boardId: string,
  from?: Date,
  to?: Date,
  limit: number = 50
): Promise<ActivityLog[]> => {
  const query = `
    query GetActivityLogs($boardId: ID!, $limit: Int, $from: String, $to: String) {
      boards(ids: [$boardId]) {
        activity_logs(limit: $limit, from: $from, to: $to) {
          id
          event
          data
          user {
            id
            name
          }
          created_at
        }
      }
    }
  `;

  const variables = {
    boardId,
    limit,
    from: from?.toISOString(),
    to: to?.toISOString(),
  };

  const data = await makeGraphQLRequest(accessToken, query, variables);
  return data.boards?.[0]?.activity_logs || [];
};

export interface BoardAnalytics {
  boardId: string;
  boardName: string;
  totalItems: number;
  itemsByStatus: Record<string, number>;
  itemsByGroup: Record<string, number>;
  itemsByAssignee: Record<string, number>;
  completionRate: number;
  averageTimeToComplete?: number;
}

export const getBoardAnalytics = async (
  accessToken: string,
  boardId: string
): Promise<BoardAnalytics> => {
  const query = `
    query GetBoardAnalytics($boardId: ID!) {
      boards(ids: [$boardId]) {
        id
        name
        items_page(limit: 500) {
          items {
            id
            name
            state
            group {
              id
              title
            }
            column_values {
              id
              column {
                id
                title
                type
              }
              type
              value
              text
            }
            created_at
            updated_at
          }
        }
      }
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, { boardId });
  const board = data.boards?.[0];

  if (!board) {
    throw new Error("Board not found");
  }

  const items = board.items_page?.items || [];

  const analytics: BoardAnalytics = {
    boardId: board.id,
    boardName: board.name,
    totalItems: items.length,
    itemsByStatus: {},
    itemsByGroup: {},
    itemsByAssignee: {},
    completionRate: 0,
  };

  let completedCount = 0;

  items.forEach((item: any) => {
    const groupTitle = item.group?.title || "No Group";
    analytics.itemsByGroup[groupTitle] =
      (analytics.itemsByGroup[groupTitle] || 0) + 1;

    const statusColumn = item.column_values?.find(
      (cv: any) => cv.type === "status"
    );
    if (statusColumn?.text) {
      analytics.itemsByStatus[statusColumn.text] =
        (analytics.itemsByStatus[statusColumn.text] || 0) + 1;
      if (
        statusColumn.text.toLowerCase() === "done" ||
        statusColumn.text.toLowerCase() === "complete"
      ) {
        completedCount++;
      }
    }

    const peopleColumn = item.column_values?.find(
      (cv: any) => cv.type === "people"
    );
    if (peopleColumn?.text) {
      analytics.itemsByAssignee[peopleColumn.text] =
        (analytics.itemsByAssignee[peopleColumn.text] || 0) + 1;
    }
  });

  analytics.completionRate =
    items.length > 0 ? (completedCount / items.length) * 100 : 0;

  return analytics;
};
