import {
  ProjectTodosDataTableCell,
  ProjectTodosDataTableHeaderTitle,
  ProjectTodosDataTableUiProvider,
} from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosDataTableCell";
import type {
  ProjectTodoAssigneeType,
  ProjectTodoType,
} from "@app/types/project_todo";
import { DataTable, type MenuItem } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

export type ProjectTodosDataTableVariant = "suggested" | "regular";

const SUGGESTED_TABLE_SHELL_CLASS =
  "mx-auto w-full max-w-[52rem] rounded-lg border border-border bg-muted-background/50 p-2 dark:border-border-night dark:bg-muted-background-night/35";

type SparkleTodoTableExtras = {
  onClick?: () => void;
  onDoubleClick?: () => void;
  menuItems?: MenuItem[];
};

export type ProjectTodoTableRow = SparkleTodoTableExtras &
  (
    | {
        kind: "assignee_header";
        groupKey: string;
        user: ProjectTodoAssigneeType | null;
        isFirstGroup: boolean;
        /** Suggested table only: sIds of pending suggestions in this assignee group */
        pendingSuggestionTodoIds?: string[];
      }
    | { kind: "todo"; todo: ProjectTodoType }
  );

function flattenGroupedTodos(
  groups: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>,
  variant: ProjectTodosDataTableVariant
): ProjectTodoTableRow[] {
  const rows: ProjectTodoTableRow[] = [];
  let groupIndex = 0;

  for (const group of groups) {
    const groupKey =
      group.user?.sId ?? `unknown-${group.todos[0]?.id ?? "empty"}`;
    rows.push({
      kind: "assignee_header",
      groupKey,
      user: group.user,
      isFirstGroup: groupIndex === 0,
      pendingSuggestionTodoIds:
        variant === "suggested" ? group.todos.map((t) => t.sId) : undefined,
    });
    groupIndex += 1;

    for (const todo of group.todos) {
      rows.push({ kind: "todo", todo });
    }
  }
  return rows;
}

/**
 * Stable TanStack column defs. Sparkle `DataTable` does not expose an option to
 * freeze column instances; TanStack expects a stable `columns` reference. Row
 * cells read live props from `useProjectTodosPanel` instead of closing over
 * parent render state.
 */
const PROJECT_TODOS_DATA_TABLE_COLUMNS: ColumnDef<ProjectTodoTableRow>[] = [
  {
    id: "content",
    header: () => <ProjectTodosDataTableHeaderTitle />,
    accessorFn: (row) => row,
    enableSorting: false,
    meta: {
      className:
        "h-auto min-h-0 max-h-none align-top whitespace-normal overflow-visible py-0 px-1",
    },
    cell: ({ row }) => <ProjectTodosDataTableCell original={row.original} />,
  },
];

export type ProjectTodosDataTableProps = {
  variant: ProjectTodosDataTableVariant;
  groupedTodosForAll: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>;
  /** Regular table: omit per-assignee header rows (flat list). */
  hideAssigneeGroupHeaders?: boolean;
};

export function ProjectTodosDataTable({
  variant,
  groupedTodosForAll,
  hideAssigneeGroupHeaders = false,
}: ProjectTodosDataTableProps) {
  const data = useMemo(() => {
    if (
      variant === "regular" &&
      hideAssigneeGroupHeaders &&
      groupedTodosForAll.length > 0
    ) {
      return groupedTodosForAll.flatMap((group) =>
        group.todos.map((todo) => ({ kind: "todo" as const, todo }))
      );
    }
    return flattenGroupedTodos(groupedTodosForAll, variant);
  }, [groupedTodosForAll, variant, hideAssigneeGroupHeaders]);

  if (groupedTodosForAll.length === 0) {
    return null;
  }

  const table = (
    <ProjectTodosDataTableUiProvider variant={variant}>
      <DataTable<ProjectTodoTableRow>
        data={data}
        columns={PROJECT_TODOS_DATA_TABLE_COLUMNS}
        widthClassName="w-full"
        hideRowDivider
        className="[&_thead]:hidden"
        getRowId={(row) =>
          row.kind === "assignee_header"
            ? `${variant}-assignee-${row.groupKey}`
            : row.todo.sId
        }
      />
    </ProjectTodosDataTableUiProvider>
  );

  if (variant === "suggested") {
    return <div className={SUGGESTED_TABLE_SHELL_CLASS}>{table}</div>;
  }

  return table;
}
