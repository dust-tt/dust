import {
  ProjectTasksDataTableCell,
  ProjectTasksDataTableHeaderTitle,
  ProjectTasksDataTableUiProvider,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksDataTableCell";
import {
  PROJECT_TASK_UNASSIGNED_GROUP_KEY,
  type ProjectTaskAssigneeType,
  type ProjectTaskType,
} from "@app/types/project_task";
import { DataTable, type MenuItem } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

export type ProjectTasksDataTableVariant = "suggested" | "regular";

const SUGGESTED_TABLE_SHELL_CLASS =
  "mx-auto w-full max-w-[52rem] rounded-lg border border-border bg-muted-background/50 p-2 dark:border-border-night dark:bg-muted-background-night/35";

type SparkleTaskTableExtras = {
  onClick?: () => void;
  onDoubleClick?: () => void;
  menuItems?: MenuItem[];
};

export type ProjectTaskTableRow = SparkleTaskTableExtras &
  (
    | {
        kind: "assignee_header";
        groupKey: string;
        user: ProjectTaskAssigneeType | null;
        isFirstGroup: boolean;
        /** Suggested table only: sIds of pending suggestions in this assignee group */
        pendingSuggestionTaskIds?: string[];
      }
    | { kind: "task"; task: ProjectTaskType }
  );

function flattenGroupedTasks(
  groups: Array<{
    user: ProjectTaskAssigneeType | null;
    tasks: ProjectTaskType[];
  }>,
  variant: ProjectTasksDataTableVariant
): ProjectTaskTableRow[] {
  const rows: ProjectTaskTableRow[] = [];
  let groupIndex = 0;

  for (const group of groups) {
    const groupKey = group.user?.sId ?? PROJECT_TASK_UNASSIGNED_GROUP_KEY;
    rows.push({
      kind: "assignee_header",
      groupKey,
      user: group.user,
      isFirstGroup: groupIndex === 0,
      pendingSuggestionTaskIds:
        variant === "suggested" ? group.tasks.map((t) => t.sId) : undefined,
    });
    groupIndex += 1;

    for (const task of group.tasks) {
      rows.push({ kind: "task", task });
    }
  }
  return rows;
}

/**
 * Stable TanStack column defs. Sparkle `DataTable` does not expose an option to
 * freeze column instances; TanStack expects a stable `columns` reference. Row
 * cells read live props from `useProjectTasksPanel` instead of closing over
 * parent render state.
 */
const PROJECT_TASKS_DATA_TABLE_COLUMNS: ColumnDef<ProjectTaskTableRow>[] = [
  {
    id: "content",
    header: () => <ProjectTasksDataTableHeaderTitle />,
    accessorFn: (row) => row,
    enableSorting: false,
    meta: {
      className:
        "h-auto min-h-0 max-h-none align-top whitespace-normal overflow-visible py-0 px-1",
    },
    cell: ({ row }) => <ProjectTasksDataTableCell original={row.original} />,
  },
];

export type ProjectTasksDataTableProps = {
  variant: ProjectTasksDataTableVariant;
  groupedTasksForAll: Array<{
    user: ProjectTaskAssigneeType | null;
    tasks: ProjectTaskType[];
  }>;
  /** Regular table: omit per-assignee header rows (flat list). */
  hideAssigneeGroupHeaders?: boolean;
};

export function ProjectTasksDataTable({
  variant,
  groupedTasksForAll,
  hideAssigneeGroupHeaders = false,
}: ProjectTasksDataTableProps) {
  const data = useMemo(() => {
    if (
      variant === "regular" &&
      hideAssigneeGroupHeaders &&
      groupedTasksForAll.length > 0
    ) {
      return groupedTasksForAll.flatMap((group) =>
        group.tasks.map((task) => ({ kind: "task" as const, task }))
      );
    }
    return flattenGroupedTasks(groupedTasksForAll, variant);
  }, [groupedTasksForAll, variant, hideAssigneeGroupHeaders]);

  if (groupedTasksForAll.length === 0) {
    return null;
  }

  const table = (
    <ProjectTasksDataTableUiProvider variant={variant}>
      <DataTable<ProjectTaskTableRow>
        data={data}
        columns={PROJECT_TASKS_DATA_TABLE_COLUMNS}
        widthClassName="w-full"
        hideRowDivider
        className="[&_thead]:hidden"
        getRowId={(row) =>
          row.kind === "assignee_header"
            ? `${variant}-assignee-${row.groupKey}`
            : row.task.sId
        }
      />
    </ProjectTasksDataTableUiProvider>
  );

  if (variant === "suggested") {
    return <div className={SUGGESTED_TABLE_SHELL_CLASS}>{table}</div>;
  }

  return table;
}
