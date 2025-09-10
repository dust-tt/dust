import { DataTable, Spinner } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useWebhookSourceViews } from "@app/lib/swr/webhook_source";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type RowData = {
  id: string;
  name: string;
  lastUpdated: number;
  onClick?: () => void;
};

interface SpaceActionsListProps {
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SpaceTriggersList = ({ owner, space }: SpaceActionsListProps) => {
  const { webhookSourceViews, isWebhookSourceViewsLoading } =
    useWebhookSourceViews({
      owner,
      space,
    });

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const columns: ColumnDef<RowData, string>[] = [
    {
      id: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-2 py-3">
            {info.row.original.name}
          </div>
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.name,
    },
    {
      id: "lastUpdated",
      header: "Last updated",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.BasicCellContent
          label={formatTimestampToFriendlyDate(
            info.row.original.lastUpdated,
            "compact"
          )}
        />
      ),
      meta: {
        className: "w-28",
      },
    },
  ];

  const rows: RowData[] = React.useMemo(() => {
    // Add some fake rows for UI testing
    const fakeRows: RowData[] = [
      {
        id: "fake-trigger-1",
        name: "Slack Message Trigger",
        lastUpdated: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
      },
      {
        id: "fake-trigger-2",
        name: "GitHub PR Webhook",
        lastUpdated: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
      },
      {
        id: "fake-trigger-3",
        name: "Email Notification Trigger",
        lastUpdated: Date.now() - 1000 * 60 * 30, // 30 minutes ago
      },
      {
        id: "fake-trigger-4",
        name: "Document Update Trigger",
        lastUpdated: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
      },
    ];

    const realRows =
      webhookSourceViews.map((webhookSourceView) => ({
        id: webhookSourceView.sId,
        name:
          webhookSourceView.customName ?? webhookSourceView.webhookSource.name,
        lastUpdated: webhookSourceView.updatedAt,
      })) || [];

    return [...realRows, ...fakeRows];
  }, [webhookSourceViews]);

  if (isWebhookSourceViewsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const isEmpty = rows.length === 0;

  return (
    <>
      {isEmpty ? (
        <div className="text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
          You don’t have any triggers yet.
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          className="pb-4"
          filterColumn="name"
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
    </>
  );
};
