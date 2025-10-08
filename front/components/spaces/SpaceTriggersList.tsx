import { DataTable, Spinner } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useWebhookSourceViews } from "@app/lib/swr/webhook_source";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type RowData = {
  id: string;
  name: string;
  description: string;
  avatar: React.ReactNode;
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
            <div>{info.row.original.avatar}</div>
            <div className="flex flex-col">
              <div className="flex-grow truncate">{info.getValue()}</div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.name,
      meta: {
        className: "w-80",
      },
    },
    {
      id: "description",
      header: "Description",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.BasicCellContent label={info.row.original.description} />
      ),
      meta: {
        className: "w-full",
      },
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

  const rows: RowData[] = React.useMemo(
    () =>
      webhookSourceViews.map((webhookSourceView) => {
        return {
          id: webhookSourceView.sId,
          name:
            webhookSourceView.customName ??
            webhookSourceView.webhookSource.name,
          description: webhookSourceView.description ?? "",
          avatar: getAvatarFromIcon(webhookSourceView.icon, "sm"),
          lastUpdated: webhookSourceView.updatedAt,
        };
      }),
    [webhookSourceViews]
  );

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
