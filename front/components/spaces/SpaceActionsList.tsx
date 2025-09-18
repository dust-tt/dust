import { DataTable, Spinner } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useQueryParams } from "@app/hooks/useQueryParams";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useAddMCPServerToSpace,
  useMCPServerViews,
  useRemoveMCPServerViewFromSpace,
} from "@app/lib/swr/mcp_servers";
import { useAvailableMCPServers } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import { isDevelopment } from "@app/types";

import { RequestActionsModal } from "./mcp/RequestActionsModal";
import SpaceManagedActionsViewsModel from "./SpaceManagedActionsViewsModal";

type RowData = {
  id: string;
  name: string;
  description: string;
  avatar: React.ReactNode;
  onClick?: () => void;
};

interface SpaceActionsListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SpaceActionsList = ({
  owner,
  isAdmin,
  space,
}: SpaceActionsListProps) => {
  const { q: searchParam } = useQueryParams(["q"]);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const searchTerm = searchParam.value || "";

  const { serverViews, isMCPServerViewsLoading, mutateMCPServerViews } =
    useMCPServerViews({
      owner,
      space,
    });
  const { addToSpace } = useAddMCPServerToSpace(owner);
  const { removeFromSpace } = useRemoveMCPServerViewFromSpace(owner);
  const { mutateAvailableMCPServers } = useAvailableMCPServers({
    owner,
    space,
  });

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const onAddServer = async (server: MCPServerType) => {
    await addToSpace(server, space);
    await mutateMCPServerViews();
    await mutateAvailableMCPServers();
  };

  const onRemoveServer = async (sId: string) => {
    await removeFromSpace(serverViews.find((view) => view.sId === sId)!, space);
    await mutateMCPServerViews();
    await mutateAvailableMCPServers();
  };

  const getTableColumns = (): ColumnDef<RowData, string>[] => {
    return [
      {
        id: "name",
        cell: (info: CellContext<RowData, string>) => (
          <DataTable.CellContent>
            <div className="flex flex-row items-center gap-2 py-3">
              <div>{info.row.original.avatar}</div>
              <div className="flex-grow truncate">{info.getValue()}</div>
              {isDevelopment() && (
                <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {info.row.original.id}
                </div>
              )}
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
        cell: (info: CellContext<RowData, string>) => (
          <DataTable.CellContent>{info.getValue()}</DataTable.CellContent>
        ),
        accessorFn: (row: RowData) => row.description,
        meta: {
          className: "w-full",
        },
      },
      {
        id: "actions",
        cell: (info: CellContext<RowData, string>) => (
          <DataTable.MoreButton
            menuItems={
              isAdmin
                ? [
                    {
                      label: "Remove tools from space",
                      onClick: async () => onRemoveServer(info.row.original.id),
                      kind: "item",
                    },
                  ]
                : []
            }
          />
        ),
        meta: {
          className: "w-12",
        },
      },
    ];
  };

  const rows: RowData[] = React.useMemo(
    () =>
      serverViews.map((serverView) => ({
        id: serverView.sId,
        name: getMcpServerViewDisplayName(serverView),
        description: getMcpServerViewDescription(serverView),
        avatar: getAvatar(serverView.server),
      })) || [],
    [serverViews]
  );

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  if (isMCPServerViewsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const columns = getTableColumns();

  const isEmpty = rows.length === 0;

  const actionButton = (
    <>
      {isAdmin ? (
        <>
          <SpaceManagedActionsViewsModel
            space={space}
            owner={owner}
            onAddServer={onAddServer}
          />
        </>
      ) : (
        <RequestActionsModal owner={owner} space={space} />
      )}
    </>
  );

  return (
    <>
      {!isEmpty && portalToHeader(actionButton)}
      {isEmpty ? (
        <div className="flex h-36 w-full max-w-4xl items-center justify-center gap-2 rounded-lg bg-muted-background dark:bg-muted-background-night">
          {actionButton}
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          className="pb-4"
          filter={searchTerm}
          filterColumn="name"
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
    </>
  );
};
