import { DataTable, ScrollableDataTable, Spinner } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { useWorkspaceTopUsers } from "@app/lib/swr/workspaces";

interface TopUserRowData {
  userId: string;
  name: string;
  messageCount: number;
  agentCount: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

type TopUserInfo = CellContext<TopUserRowData, unknown>;

const columns: ColumnDef<TopUserRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "User",
    cell: (info: TopUserInfo) => (
      <DataTable.CellContent>{info.row.original.name}</DataTable.CellContent>
    ),
    meta: {
      sizeRatio: 70,
    },
  },
  {
    id: "messageCount",
    accessorKey: "messageCount",
    header: "Messages",
    meta: {
      sizeRatio: 15,
    },
    cell: (info: TopUserInfo) => (
      <DataTable.BasicCellContent label={`${info.row.original.messageCount}`} />
    ),
  },
  {
    id: "agentCount",
    accessorKey: "agentCount",
    header: "Agents used",
    meta: {
      sizeRatio: 15,
    },
    cell: (info: TopUserInfo) => (
      <DataTable.BasicCellContent label={`${info.row.original.agentCount}`} />
    ),
  },
];

interface WorkspaceTopUsersTableProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceTopUsersTable({
  workspaceId,
  period,
}: WorkspaceTopUsersTableProps) {
  const { topUsers, isTopUsersLoading, isTopUsersError } = useWorkspaceTopUsers(
    {
      workspaceId,
      days: period,
      limit: 100,
      disabled: !workspaceId,
    }
  );

  const rows = useMemo<TopUserRowData[]>(() => {
    return topUsers.map((user) => ({
      userId: user.userId,
      name: user.name,
      messageCount: user.messageCount,
      agentCount: user.agentCount,
    }));
  }, [topUsers]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 dark:border-border-night">
      <div className="mb-3">
        <h3 className="text-base font-medium text-foreground dark:text-foreground-night">
          Top users
        </h3>
        <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
          Top 100 users with the most messages over the last {period} days.
        </p>
      </div>
      {isTopUsersLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : isTopUsersError ? (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Failed to load top users.
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No user activity for this selection.
        </div>
      ) : (
        <ScrollableDataTable<TopUserRowData>
          data={rows}
          columns={columns}
          maxHeight="max-h-64"
        />
      )}
    </div>
  );
}
