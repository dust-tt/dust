import { Chip, classNames, DataTable, Spinner } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

import { AddActionMenu } from "@app/components/actions/mcp/AddActionMenu";
import { CreateMCPServerModal } from "@app/components/actions/mcp/CreateMCPServerModal";
import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { mcpServersSortingFn } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { getSpaceIcon } from "@app/lib/spaces";
import {
  useCreateInternalMCPServer,
  useMCPServerConnections,
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { EditedByUser, LightWorkspaceType, SpaceType } from "@app/types";
import { asDisplayName } from "@app/types";

type RowData = {
  mcpServer: MCPServerType;
  mcpServerView?: MCPServerViewType;
  isConnected: boolean;
  spaces: SpaceType[];
  onClick: () => void;
};

const NameCell = ({ row }: { row: RowData }) => {
  const { mcpServer, mcpServerView, isConnected } = row;
  return (
    <DataTable.CellContent grow>
      <div
        className={classNames(
          "flex flex-row items-center gap-2 py-3",
          mcpServerView ? "" : "opacity-50"
        )}
      >
        <div>{getAvatar(mcpServer)}</div>
        <div className="flex flex-grow items-center justify-between overflow-hidden truncate">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
              {asDisplayName(mcpServer.name)}
            </div>
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {mcpServer.description}
            </div>
          </div>
        </div>

        {mcpServerView && !isConnected && mcpServer.authorization && (
          <Chip color="warning" size="xs">
            Disconnected
          </Chip>
        )}
      </div>
    </DataTable.CellContent>
  );
};

type AdminActionsListProps = {
  owner: LightWorkspaceType;
  filter: string;
  systemSpace: SpaceType;
  setMcpServer: (mcpServer: MCPServerType) => void;
};

export const AdminActionsList = ({
  owner,
  filter,
  systemSpace,
  setMcpServer,
}: AdminActionsListProps) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [internalMCPServerToCreate, setInternalMCPServerToCreate] = useState<
    MCPServerType | undefined
  >();
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });

  const { mcpServers, isMCPServersLoading } = useMCPServers({
    owner,
  });

  const [isLoading, setIsLoading] = useState(false);

  const { connections } = useMCPServerConnections({
    owner,
  });

  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  const getTableColumns = (): ColumnDef<RowData>[] => {
    const columns: ColumnDef<RowData, any>[] = [];

    columns.push(
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: (info: CellContext<RowData, string>) => (
          <NameCell row={info.row.original} />
        ),
        filterFn: (row, id, filterValue) =>
          filterMCPServer(row.original.mcpServer, filterValue),
        sortingFn: (rowA, rowB) => {
          return rowA.original.mcpServer.name.localeCompare(
            rowB.original.mcpServer.name
          );
        },
      },
      {
        id: "access",
        accessorKey: "spaces",
        header: "Access",
        cell: (info: CellContext<RowData, SpaceType[]>) => {
          const globalSpace = info.getValue().find((s) => s.kind === "global");
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                {globalSpace ? getSpaceIcon(globalSpace)({}) : null}
                {globalSpace
                  ? "Everybody"
                  : info
                      .getValue()
                      .filter((s) => s.kind === "regular")
                      .map((s) => s.name)
                      .join(", ")}
              </div>
            </DataTable.CellContent>
          );
        },
        sortingFn: (rowA, rowB) => {
          return rowA.original.mcpServer.name.localeCompare(
            rowB.original.mcpServer.name
          );
        },
        meta: {
          className: "w-28",
        },
      },
      {
        id: "by",
        accessorKey: "mcpServerView.editedByUser",
        header: "By",
        cell: (info: CellContext<RowData, EditedByUser>) => {
          const editedByUser = info.getValue();
          return (
            <DataTable.CellContent
              avatarUrl={editedByUser?.imageUrl ?? undefined}
              avatarTooltipLabel={editedByUser?.fullName ?? undefined}
              roundedAvatar
            />
          );
        },
        meta: {
          className: "w-10",
        },
      },
      {
        id: "lastUpdated",
        accessorKey: "mcpServerView.editedByUser.editedAt",
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
  };

  const rows: RowData[] = mcpServers
    .filter((mcpServer) => !mcpServer.isDefault)
    .map((mcpServer) => {
      const mcpServerWithViews = mcpServers.find((s) => s.id === mcpServer.id);
      const mcpServerView = mcpServerWithViews?.views.find(
        (v) => v.spaceId === systemSpace?.sId
      );
      const spaceIds = mcpServerWithViews
        ? mcpServerWithViews.views.map((v) => v.spaceId)
        : [];
      return {
        mcpServer,
        mcpServerView,
        spaces: spaces.filter((s) => spaceIds?.includes(s.sId)),
        isConnected: !!connections.find(
          (c) => c.internalMCPServerId === mcpServer.id
        ),
        onClick: () => {
          if (mcpServerView && mcpServer) {
            setMcpServer(mcpServer);
          }
        },
      };
    })
    .sort(mcpServersSortingFn);
  const columns = getTableColumns();

  return (
    <>
      <CreateMCPServerModal
        isOpen={isCreateOpen}
        internalMCPServer={internalMCPServerToCreate}
        setIsOpen={setIsCreateOpen}
        setIsLoading={setIsLoading}
        owner={owner}
        setMCPServer={setMcpServer}
      />
      {portalToHeader(
        <AddActionMenu
          owner={owner}
          enabledMCPServers={mcpServers.map((s) => s.id)}
          setIsLoading={setIsLoading}
          createRemoteMCPServer={() => {
            setInternalMCPServerToCreate(undefined);
            setIsCreateOpen(true);
          }}
          createInternalMCPServer={async (mcpServer: MCPServerType) => {
            if (mcpServer.authorization) {
              setInternalMCPServerToCreate(mcpServer);
              setIsCreateOpen(true);
            } else {
              setIsLoading(true);
              await createInternalMCPServer(mcpServer.name, true);
              setIsLoading(false);
            }
          }}
        />
      )}

      {isMCPServersLoading || isLoading ? (
        <div className="mt-16 flex justify-center">
          <Spinner />
        </div>
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
