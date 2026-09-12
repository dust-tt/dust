import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { SpaceSearchContext } from "@app/components/spaces/search/SpaceSearchContext";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useQueryParams } from "@app/hooks/useQueryParams";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useAppRouter } from "@app/lib/platform";
import {
  useAddMCPServerToSpace,
  useMCPServerViews,
  useMCPServerViewsNotActivated,
  useRemoveMCPServerViewFromSpace,
} from "@app/lib/swr/mcp_servers";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import { isDevelopment } from "@app/types/shared/env";
import { isString } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import { DataTable, DataTableSkeleton, LoadingBlock } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { ParsedUrlQuery } from "querystring";
import * as React from "react";

import { RequestActionsModal } from "./mcp/RequestActionsModal";
import SpaceManagedActionsViewsModel from "./SpaceManagedActionsViewsModal";

type RowData = {
  id: string;
  name: string;
  description: string;
  avatar: React.ReactNode;
  onClick?: () => void;
};

const hasToolsModalQuery = (
  query: ParsedUrlQuery
): query is ParsedUrlQuery & { modal: string } =>
  isString(query.modal) && query.modal === "tools";

interface SpaceActionsListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

function SpaceActionSkeletonCell({
  columnId,
  rowIndex,
}: DataTableSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return (
        <div className="flex items-center gap-2 py-3">
          <LoadingBlock className="h-9 w-9 shrink-0 rounded-lg" />
          <LoadingBlock
            className={rowIndex % 2 === 0 ? "h-4 w-28" : "h-4 w-36"}
          />
        </div>
      );
    case "description":
      return (
        <LoadingBlock
          className={rowIndex % 2 === 0 ? "h-4 w-3/4" : "h-4 w-1/2"}
        />
      );
    default:
      return null;
  }
}

export const SpaceActionsList = ({
  owner,
  isAdmin,
  space,
}: SpaceActionsListProps) => {
  const router = useAppRouter();
  const { frontendListFilterQuery } = React.useContext(SpaceSearchContext);
  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = frontendListFilterQuery ?? searchParam.value ?? "";

  const { serverViews, isMCPServerViewsLoading, mutateMCPServerViews } =
    useMCPServerViews({
      owner,
      space,
    });
  const { addToSpace } = useAddMCPServerToSpace(owner);
  const { removeFromSpace } = useRemoveMCPServerViewFromSpace(owner);
  const { mutateMCPServerViews: mutateActivableMCPServerViews } =
    useMCPServerViewsNotActivated({ owner, space, disabled: true });

  const [shouldOpenToolsMenu, setShouldOpenToolsMenu] = React.useState(false);
  React.useEffect(() => {
    if (!router.isReady || !isAdmin) {
      return;
    }
    const { query } = router;
    if (!hasToolsModalQuery(query)) {
      return;
    }
    setShouldOpenToolsMenu(true);
    void removeParamFromRouter(router, "modal");
  }, [router.isReady, router.query.modal, isAdmin, router]);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const onAddServerView = async (serverView: MCPServerViewType) => {
    await addToSpace(serverView.server, space);
    await mutateMCPServerViews();
    await mutateActivableMCPServerViews();
  };

  const onRemoveServer = async (sId: string) => {
    await removeFromSpace(serverViews.find((view) => view.sId === sId)!, space);
    await mutateMCPServerViews();
    await mutateActivableMCPServerViews();
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
                <div className="text-xs text-muted-foreground">
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
      serverViews
        .map((serverView) => ({
          id: serverView.sId,
          name: getMcpServerViewDisplayName(serverView),
          description: getMcpServerViewDescription(serverView),
          avatar: getAvatar(serverView.server),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)) || [],
    [serverViews]
  );

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  const columns = getTableColumns();

  if (isMCPServerViewsLoading) {
    return (
      <div className="pb-4">
        <DataTableSkeleton
          columns={columns}
          SkeletonCell={SpaceActionSkeletonCell}
          rowHeight={60}
        />
      </div>
    );
  }

  const isEmpty = rows.length === 0;

  const actionButton = (
    <>
      {isAdmin ? (
        <>
          <SpaceManagedActionsViewsModel
            space={space}
            owner={owner}
            onAddServerView={onAddServerView}
            shouldOpenMenu={shouldOpenToolsMenu}
            onOpenMenuHandled={() => setShouldOpenToolsMenu(false)}
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
        <div className="flex h-36 w-full items-center justify-center gap-2 rounded-lg bg-muted-background">
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
