import {
  Avatar,
  DataTable,
  Spinner,
  usePaginationFromUrl,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { getVisual } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useAddMCPServerToSpace,
  useMCPServerViews,
} from "@app/lib/swr/mcp_server_views";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import { asDisplayName } from "@app/types";

import { RequestActionsModal } from "./mcp/RequestActionsModal";
import SpaceManagedActionsViewsModel from "./SpaceManagedActionsViewsModal";

type RowData = {
  name: string;
  description: string;
  visual: string | React.ReactNode;
  onClick?: () => void;
};

const getTableColumns = (): ColumnDef<RowData, string>[] => {
  return [
    {
      id: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-2 py-3">
            <div>
              <Avatar visual={info.row.original.visual} />
            </div>
            <div className="flex-grow truncate">{info.getValue()}</div>
          </div>
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => asDisplayName(row.name),
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
  ];
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
  const searchTerm = searchParam.value || "";

  const { serverViews, isMCPServerViewsLoading, mutateMCPServerViews } =
    useMCPServerViews({
      owner,
      space,
    });
  const { addToSpace } = useAddMCPServerToSpace(owner);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const rows: RowData[] = React.useMemo(
    () =>
      serverViews.map((serverView) => ({
        name: serverView.server.name,
        description: serverView.server.description,
        visual: getVisual(serverView.server),
      })) || [],
    [serverViews]
  );

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  const onAddServer = async (server: MCPServerType) => {
    await addToSpace(server, space);
    await mutateMCPServerViews();
  };

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
