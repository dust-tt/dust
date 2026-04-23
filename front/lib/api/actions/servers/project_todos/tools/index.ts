import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  getProjectSpace,
  withErrorHandling,
} from "@app/lib/api/actions/servers/project_manager/helpers";
import { PROJECT_TODOS_TOOLS_METADATA } from "@app/lib/api/actions/servers/project_todos/metadata";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { ProjectTodoCategory } from "@app/types/project_todo";
import { Err, Ok } from "@app/types/shared/result";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatTodo(todo: ProjectTodoResource): string {
  const lines = [
    `- [${todo.sId}] (${todo.category}) ${todo.text}`,
    `  Status: ${todo.status} | Created: ${todo.createdAt.toISOString().slice(0, 10)}`,
  ];
  if (todo.doneAt) {
    lines.push(`  Done: ${todo.doneAt.toISOString().slice(0, 10)}`);
  }
  return lines.join("\n");
}

export function createProjectTodosTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof PROJECT_TODOS_TOOLS_METADATA> = {
    list_todos: async ({
      status = "open",
      daysAgo = 7,
      category,
      dustProject,
    }) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }
        const { space } = contextRes.value;

        let todos = await ProjectTodoResource.fetchLatestBySpace(auth, {
          spaceId: space.id,
        });

        const cutoff = new Date(Date.now() - daysAgo * MS_PER_DAY);

        if (status === "open") {
          todos = todos.filter((t) => t.status !== "done");
        } else if (status === "done") {
          todos = todos.filter(
            (t) =>
              t.status === "done" && t.doneAt !== null && t.doneAt >= cutoff
          );
        } else {
          // "all": keep open items as-is; limit done items by daysAgo.
          todos = todos.filter(
            (t) =>
              t.status !== "done" || (t.doneAt !== null && t.doneAt >= cutoff)
          );
        }

        if (category) {
          todos = todos.filter((t) => t.category === category);
        }

        if (todos.length === 0) {
          return new Ok([{ type: "text" as const, text: "No TODOs found." }]);
        }

        if (status === "done") {
          todos.sort(
            (a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0)
          );
          const lines: string[] = [
            `Found ${todos.length} completed TODO(s) in the last ${daysAgo} day(s):\n`,
          ];
          for (const todo of todos) {
            lines.push(formatTodo(todo));
          }
          return new Ok([{ type: "text" as const, text: lines.join("\n") }]);
        }

        // "open" or "all": group by category.
        const grouped = new Map<ProjectTodoCategory, ProjectTodoResource[]>();
        for (const todo of todos) {
          const list = grouped.get(todo.category) ?? [];
          list.push(todo);
          grouped.set(todo.category, list);
        }

        const label =
          status === "open"
            ? `Found ${todos.length} open TODO(s):\n`
            : `Found ${todos.length} TODO(s):\n`;
        const lines: string[] = [label];
        for (const [cat, items] of grouped) {
          lines.push(`### ${cat}`);
          for (const todo of items) {
            lines.push(formatTodo(todo));
          }
          lines.push("");
        }

        return new Ok([{ type: "text" as const, text: lines.join("\n") }]);
      }, "Failed to list TODOs");
    },

    create_todo: async ({ creatorType, text, category, dustProject }) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }
        const { space } = contextRes.value;

        const currentUser = auth.getNonNullableUser();

        const todo = await ProjectTodoResource.makeNew(auth, {
          spaceId: space.id,
          userId: currentUser.id,
          createdByType: creatorType,
          createdByAgentConfigurationId:
            creatorType === "agent"
              ? (agentLoopContext?.runContext?.agentConfiguration?.sId ?? null)
              : null,
          createdByUserId: creatorType === "user" ? currentUser.id : null,
          category: category ?? "to_do",
          text,
          status: "todo",
          doneAt: null,
          actorRationale: null,
        });

        return new Ok([
          {
            type: "text" as const,
            text: `TODO created (${todo.sId}): "${text}" [${todo.category}]`,
          },
        ]);
      }, "Failed to create TODO");
    },

    create_todos_batch: async ({ creatorType, todos, dustProject }) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }
        const { space } = contextRes.value;

        const currentUser = auth.getNonNullableUser();
        const agentConfigId =
          agentLoopContext?.runContext?.agentConfiguration?.sId ?? null;

        const created: string[] = [];
        for (const item of todos) {
          const todo = await ProjectTodoResource.makeNew(auth, {
            spaceId: space.id,
            userId: currentUser.id,
            createdByType: creatorType,
            createdByAgentConfigurationId:
              creatorType === "agent" ? agentConfigId : null,
            createdByUserId: creatorType === "user" ? currentUser.id : null,
            category: item.category ?? "to_do",
            text: item.text,
            status: "todo",
            doneAt: null,
            actorRationale: null,
          });

          created.push(`- [${todo.sId}] (${todo.category}) "${item.text}"`);
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Created ${created.length} TODO(s):\n${created.join("\n")}`,
          },
        ]);
      }, "Failed to create TODOs");
    },

    mark_todo_done: async ({ actorType, todoId, dustProject }) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const currentUser = auth.getNonNullableUser();
        const todo = await ProjectTodoResource.fetchBySId(auth, todoId);

        if (!todo) {
          return new Err(
            new MCPError(`TODO not found: ${todoId}`, { tracked: false })
          );
        }

        if (todo.userId !== currentUser.id) {
          return new Err(
            new MCPError("You can only mark your own TODOs as done.", {
              tracked: false,
            })
          );
        }

        if (todo.status === "done") {
          return new Ok([
            { type: "text" as const, text: `TODO ${todoId} is already done.` },
          ]);
        }

        await todo.updateWithVersion(auth, {
          status: "done",
          doneAt: new Date(),
          markedAsDoneByType: actorType,
          markedAsDoneByUserId: actorType === "user" ? currentUser.id : null,
          markedAsDoneByAgentConfigurationId:
            actorType === "agent"
              ? (agentLoopContext?.runContext?.agentConfiguration?.sId ?? null)
              : null,
        });

        return new Ok([
          {
            type: "text" as const,
            text: `TODO marked as done: "${todo.text}"`,
          },
        ]);
      }, "Failed to mark TODO as done");
    },

    reopen_todo: async ({ todoId, dustProject }) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const currentUser = auth.getNonNullableUser();
        const todo = await ProjectTodoResource.fetchBySId(auth, todoId);

        if (!todo) {
          return new Err(
            new MCPError(`TODO not found: ${todoId}`, { tracked: false })
          );
        }

        if (todo.userId !== currentUser.id) {
          return new Err(
            new MCPError("You can only reopen your own TODOs.", {
              tracked: false,
            })
          );
        }

        if (todo.status !== "done") {
          return new Ok([
            {
              type: "text" as const,
              text: `TODO ${todoId} is not done (current status: ${todo.status}).`,
            },
          ]);
        }

        await todo.updateWithVersion(auth, {
          status: "todo",
          doneAt: null,
          markedAsDoneByType: null,
          markedAsDoneByUserId: null,
          markedAsDoneByAgentConfigurationId: null,
        });

        return new Ok([
          {
            type: "text" as const,
            text: `TODO reopened: "${todo.text}"`,
          },
        ]);
      }, "Failed to reopen TODO");
    },
  };

  return buildTools(PROJECT_TODOS_TOOLS_METADATA, handlers);
}
