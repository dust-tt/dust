import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import type {TodoItem} from "@app/lib/resources/agent_todo_list_resource";
import {
  AgentTodoListResource
} from "@app/lib/resources/agent_todo_list_resource";

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("todo_list");

  const isUserScopedTodoLists = true;

  const user = auth.user();

  if (!user && isUserScopedTodoLists) {
    // If we are executed without users yet the todo lists are user scoped we show to the model that the
    // todo list functions are not available.
    server.tool(
      "todo_lists_not_available",
      "Todo lists are configured to be scoped to users but no user is currently authenticated.",
      {},
      async () => {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No user todo lists available as there is no user authenticated.",
            },
          ],
        };
      }
    );
    return server;
  }

  const renderTodoList = (
    name: string,
    items: TodoItem[]
  ): {
    isError: boolean;
    content: { type: "text"; text: string }[];
  } => {
    if (items.length === 0) {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `# ${name}\n\n(empty todo list)`,
          },
        ],
      };
    }

    const markdownItems = items.map((item) => {
      const content = Object.keys(item).find((key) => key !== "id");
      if (!content) {
        return "";
      }
      const state = item[content];
      const checkbox = state ? "[x]" : "[ ]";
      return `- ${checkbox} ${content} [id:${item.id}]`;
    });

    return {
      isError: false,
      content: [
        {
          type: "text",
          text: `# ${name}\n${markdownItems.join("\n")}`,
        },
      ],
    };
  };

  server.tool(
    "list_todo_lists",
    `List all available todo lists${isUserScopedTodoLists ? " for the current user" : ""}`,
    {},
    async () => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required to run the list_todo_lists tool"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const todoListNames = await AgentTodoListResource.listTodoLists(auth, {
        agentConfiguration,
        user: user.toJSON(),
      });

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: todoListNames.length > 0 
              ? `Available todo lists:\n${todoListNames.map(name => `- ${name}`).join("\n")}`
              : "No todo lists found.",
          },
        ],
      };
    }
  );

  server.tool(
    "create_todo_list",
    `Create a new todo list${isUserScopedTodoLists ? " for the current user" : ""}`,
    {
      name: z
        .string()
        .describe("The name of the todo list (will be normalized to lowercase-with-dashes)"),
    },
    async ({ name }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required to run the create_todo_list tool"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentTodoListResource.createTodoList(auth, {
        agentConfiguration,
        user: user.toJSON(),
        name,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: result.error,
            },
          ],
        };
      }

      const normalizedName = name.toLowerCase().replace(/\s+/g, "-");
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Successfully created todo list: ${normalizedName}`,
          },
        ],
      };
    }
  );

  server.tool(
    "delete_todo_list",
    `Delete a todo list${isUserScopedTodoLists ? " for the current user" : ""}`,
    {
      name: z
        .string()
        .describe("The name of the todo list to delete"),
    },
    async ({ name }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required to run the delete_todo_list tool"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentTodoListResource.deleteTodoList(auth, {
        agentConfiguration,
        user: user.toJSON(),
        name,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: result.error,
            },
          ],
        };
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Successfully deleted todo list: ${name}`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_items_in_todo_list",
    `List all items in a specific todo list${isUserScopedTodoLists ? " for the current user" : ""}`,
    {
      todo_list_name: z
        .string()
        .describe("The name of the todo list to retrieve items from"),
    },
    async ({ todo_list_name }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required to run the list_items_in_todo_list tool"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentTodoListResource.listItemsInTodoList(auth, {
        agentConfiguration,
        user: user.toJSON(),
        todoListName: todo_list_name,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: result.error,
            },
          ],
        };
      }

      return renderTodoList(todo_list_name, result.value);
    }
  );

  server.tool(
    "add_item",
    `Add an item to a todo list${isUserScopedTodoLists ? " for the current user" : ""}`,
    {
      todo_list: z
        .string()
        .describe("The name of the todo list to add the item to"),
      item: z
        .string()
        .describe("The content of the todo item"),
      state: z
        .boolean()
        .describe("The initial completion state of the item (true for completed, false for not completed)")
        .default(false),
    },
    async ({ todo_list, item, state }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required to run the add_item tool"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentTodoListResource.addItem(auth, {
        agentConfiguration,
        user: user.toJSON(),
        todoListName: todo_list,
        item,
        state,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: result.error,
            },
          ],
        };
      }

      const newId = result.value;
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Successfully added item "${item}" to todo list "${todo_list}" with ID: ${newId}`,
          },
        ],
      };
    }
  );

  server.tool(
    "update_item_state",
    `Update the completion state of an item in a todo list${isUserScopedTodoLists ? " for the current user" : ""}`,
    {
      todo_list: z
        .string()
        .describe("The name of the todo list containing the item"),
      id: z
        .number()
        .describe("The ID of the item to update"),
      state: z
        .boolean()
        .describe("The new completion state (true for completed, false for not completed)"),
    },
    async ({ todo_list, id, state }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required to run the update_item_state tool"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentTodoListResource.updateItemState(auth, {
        agentConfiguration,
        user: user.toJSON(),
        todoListName: todo_list,
        id,
        state,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: result.error,
            },
          ],
        };
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Successfully updated item ${id} in todo list "${todo_list}" to ${state ? "completed" : "not completed"}`,
          },
        ],
      };
    }
  );

  server.tool(
    "delete_item",
    `Delete an item from a todo list${isUserScopedTodoLists ? " for the current user" : ""}`,
    {
      todo_list: z
        .string()
        .describe("The name of the todo list containing the item"),
      id: z
        .number()
        .describe("The ID of the item to delete"),
    },
    async ({ todo_list, id }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required to run the delete_item tool"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentTodoListResource.deleteItem(auth, {
        agentConfiguration,
        user: user.toJSON(),
        todoListName: todo_list,
        id,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: result.error,
            },
          ],
        };
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Successfully deleted item ${id} from todo list "${todo_list}"`,
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
