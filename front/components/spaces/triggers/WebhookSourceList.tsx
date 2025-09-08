import {
  Avatar,
  BellIcon,
  Button,
  Chip,
  classNames,
  DataTable,
  EmptyCTA,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { AddActionMenu } from "@app/components/actions/mcp/AddActionMenu";
import { CreateMCPServerDialog } from "@app/components/actions/mcp/CreateMCPServerDialog";
import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import {
  getMcpServerDisplayName,
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
  mcpServersSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import {
  useCreateInternalMCPServer,
  useMCPServerConnections,
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { EditedByUser, LightWorkspaceType, SpaceType } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

type RowData = {
  webhookSource: WebhookSourceType;
  onClick: () => void;
};

const NameCell = ({ row }: { row: RowData }) => {
  const { webhookSource } = row;
  return (
    <DataTable.CellContent grow>
      <div
        className={classNames(
          "flex flex-row items-center gap-3 py-3",
          webhookSource ? "" : "opacity-50"
        )}
      >
        <Avatar icon={BellIcon} size="sm" />
        <div className="flex flex-grow flex-col gap-0 overflow-hidden truncate">
          <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
            {webhookSource.name}
          </div>
        </div>
      </div>
    </DataTable.CellContent>
  );
};

type AdminActionsListProps = {
  owner: LightWorkspaceType;
  filter: string;
  webhookSources: WebhookSourceType[];
  setWebhookSourceToShow: (webhookSource: WebhookSourceType) => void;
};

export const WebhookSourceList = ({
  owner,
  filter,
  webhookSources,
  setWebhookSourceToShow,
}: AdminActionsListProps) => {
  const rows: RowData[] = useMemo(
    () =>
      webhookSources.map((webhookSource) => {
        return {
          webhookSource,
          onClick: () => {
            setWebhookSourceToShow(webhookSource);
          },
        };
      }),
    [webhookSources, setWebhookSourceToShow]
  );

  const columns = useMemo((): ColumnDef<RowData>[] => {
    const columns: ColumnDef<RowData, any>[] = [];

    columns.push(
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: (info: CellContext<RowData, string>) => (
          <NameCell row={info.row.original} />
        ),
        sortingFn: (rowA, rowB) => {
          return rowA.original.webhookSource.name.localeCompare(
            rowB.original.webhookSource.name
          );
        },
      },
      {
        id: "lastUpdated",
        accessorKey: "webhookSource.updatedAt",
        header: "Last updated",
        cell: (info: CellContext<RowData, number>) => (
          <DataTable.BasicCellContent
            label={
              info.getValue()
                ? formatTimestampToFriendlyDate(info.getValue(), "compact")
                : "-"
            }
          />
        ),
        meta: {
          className: "w-28",
        },
      }
    );

    return columns;
  }, []);

  return (
    <>
      {rows.length === 0 ? (
        <EmptyCTA
          message="You don’t have any triggers setup yet."
          action={<Button onClick={() => {}} size="sm" />}
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          className="pb-4"
          filter={filter}
          filterColumn="name"
        />
      )}
    </>
  );
};
