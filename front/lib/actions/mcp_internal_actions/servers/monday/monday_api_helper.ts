import { normalizeError } from "@app/types";

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
  title: string;
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
  photo_url?: string;
}

export interface MondayWorkspace {
  id: string;
  name: string;
  kind: string;
  description?: string;
}

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
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      const error = new Error(
        `Monday API request failed: ${response.status} ${response.statusText}`
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

    return result.data;
  } catch (error) {
    console.error("Error making Monday API request:", error);
    throw normalizeError(error);
  }
};

export const getBoards = async (
  accessToken: string,
  limit: number = 50
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

  const data = await makeGraphQLRequest(accessToken, query, { limit });
  return data.boards;
};

export const getBoardItems = async (
  accessToken: string,
  boardId: string,
  limit: number = 50
): Promise<MondayItem[]> => {
  const query = `
    query GetBoardItems($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
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
    }
  `;

  const data = await makeGraphQLRequest(accessToken, query, { boardId, limit });
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

export const searchItems = async (
  accessToken: string,
  searchQuery: string,
  boardId?: string,
  limit: number = 50
): Promise<MondayItem[]> => {
  // Monday.com's items_page_by_column_values allows searching by text
  const query = boardId
    ? `
      query SearchBoardItems($boardId: ID!, $limit: Int!) {
        boards(ids: [$boardId]) {
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
      }
    `
    : `
      query SearchAllItems($limit: Int!) {
        boards(limit: 10) {
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
      }
    `;

  const variables = boardId ? { boardId, limit } : { limit };
  const data = await makeGraphQLRequest(accessToken, query, variables);
  
  // Filter items based on search query
  const allItems = boardId
    ? data.boards[0]?.items_page?.items || []
    : data.boards.flatMap((board: any) => board.items_page?.items || []);
    
  return allItems.filter((item: MondayItem) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.column_values.some((col: MondayColumnValue) =>
      col.text?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
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