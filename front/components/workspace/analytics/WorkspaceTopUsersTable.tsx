import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import { useWorkspaceTopUsers } from "@app/lib/swr/workspaces";
import {
  Avatar,
  DataTable,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

interface TopUserRowData {
  userId: string;
  name: string;
  imageUrl: string | null;
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
    cell: (info: TopUserInfo) => {
      const { name, imageUrl } = info.row.original;
      return (
        <DataTable.CellContent>
          <div className="flex items-center gap-2">
            <Avatar
              name={name}
              visual={imageUrl ?? undefined}
              size="xs"
              isRounded
            />
            <span className="text-sm">{name}</span>
          </div>
        </DataTable.CellContent>
      );
    },
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
      <DataTable.BasicCellContent
        label={info.row.original.messageCount.toLocaleString()}
      />
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
      <DataTable.BasicCellContent
        label={info.row.original.agentCount.toLocaleString()}
      />
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
      imageUrl: user.imageUrl,
      messageCount: user.messageCount,
      agentCount: user.agentCount,
    }));
  }, [topUsers]);

  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/users-export?days=${period}`,
    filename: `dust_users_last_${period}_days.csv`,
    disabled: isTopUsersLoading || isTopUsersError || rows.length === 0,
  });

  function renderTableContent() {
    if (isTopUsersLoading) {
      return (
        <div className="flex h-48 items-center justify-center">
          <Spinner size="lg" />
        </div>
      );
    }
    if (isTopUsersError) {
      return (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Failed to load top users.
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No user activity for this selection.
        </div>
      );
    }
    return (
      <ScrollableDataTable<TopUserRowData>
        data={rows}
        columns={columns}
        maxHeight="max-h-64"
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 dark:border-border-night">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-foreground dark:text-foreground-night">
            Top users
          </h3>
          <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Top 100 users with the most messages over the last {period} days.
          </p>
        </div>
        <CsvDownloadButton {...csvDownload} />
      </div>
      {renderTableContent()}
    </div>
  );
}
