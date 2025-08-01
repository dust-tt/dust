import {
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
          "flex flex-row items-center gap-3 py-3",
          mcpServerView ? "" : "opacity-50"
        )}
      >
        {getAvatar(mcpServer)}
        <div className="flex flex-grow flex-col gap-0 overflow-hidden truncate">
          <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
            {mcpServerView
              ? getMcpServerViewDisplayName(mcpServerView)
              : getMcpServerDisplayName(mcpServer)}
          </div>
          <div className="truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
            {mcpServerView
              ? getMcpServerViewDescription(mcpServerView)
              : mcpServer.description}
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
  setMcpServerToShow: (mcpServer: MCPServerType) => void;
};

export const AdminActionsList = ({
  owner,
  filter,
  systemSpace,
  setMcpServerToShow,
}: AdminActionsListProps) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [internalMCPServerToCreate, setInternalMCPServerToCreate] = useState<
    MCPServerType | undefined
  >();
  const [defaultServerConfig, setDefaultServerConfig] = useState<
    DefaultRemoteMCPServerConfig | undefined
  >();
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });

  const { mcpServers, isMCPServersLoading } = useMCPServers({
    owner,
  });

  const [isLoading, setIsLoading] = useState(false);

  const showLoader = isMCPServersLoading || isLoading;

  const { connections } = useMCPServerConnections({
    owner,
    connectionType: "workspace",
  });

  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  const onCreateRemoteMCPServer = (
    defaultServerConfig?: DefaultRemoteMCPServerConfig
  ) => {
    setInternalMCPServerToCreate(undefined);
    setDefaultServerConfig(defaultServerConfig);
    setIsCreateOpen(true);
  };

  const onCreateInternalMCPServer = async (mcpServer: MCPServerType) => {
    if (mcpServer.authorization) {
      setInternalMCPServerToCreate(mcpServer);
      setDefaultServerConfig(undefined);
      setIsCreateOpen(true);
    } else {
      setIsLoading(true);
      await createInternalMCPServer({
        name: mcpServer.name,
        includeGlobal: true,
      });
      setIsLoading(false);
    }
  };

  const enabledMCPServers = mcpServers.map((s) => ({
    id: s.sId,
    name: s.name,
  }));

  const rows: RowData[] = useMemo(
    () =>
      mcpServers
        .filter((mcpServer) => mcpServer.availability === "manual")
        .map((mcpServer) => {
          const mcpServerWithViews = mcpServers.find(
            (s) => s.sId === mcpServer.sId
          );
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
              (c) =>
                c.internalMCPServerId === mcpServer.sId ||
                c.remoteMCPServerId === mcpServer.sId
            ),
            onClick: () => {
              if (mcpServerView && mcpServer) {
                setMcpServerToShow(mcpServer);
              }
            },
          };
        })
        .sort(mcpServersSortingFn),
    [connections, mcpServers, setMcpServerToShow, spaces, systemSpace?.sId]
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
                {globalSpace
                  ? "Everyone"
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
  }, []);

  return (
    <>
      <CreateMCPServerDialog
        isOpen={isCreateOpen}
        internalMCPServer={internalMCPServerToCreate}
        setIsOpen={setIsCreateOpen}
        setIsLoading={setIsLoading}
        owner={owner}
        setMCPServerToShow={setMcpServerToShow}
        defaultServerConfig={defaultServerConfig}
      />
      {rows.length > 0 &&
        portalToHeader(
          <AddActionMenu
            owner={owner}
            enabledMCPServers={enabledMCPServers}
            setIsLoading={setIsLoading}
            createRemoteMCPServer={onCreateRemoteMCPServer}
            createInternalMCPServer={onCreateInternalMCPServer}
          />
        )}

      {showLoader && (
        <div className="mt-16 flex justify-center">
          <Spinner />
        </div>
      )}

      {!showLoader &&
        (rows.length === 0 ? (
          <EmptyCTA
            message="You don’t have any tools yet."
            action={
              <AddActionMenu
                buttonVariant="outline"
                owner={owner}
                enabledMCPServers={enabledMCPServers}
                setIsLoading={setIsLoading}
                createRemoteMCPServer={onCreateRemoteMCPServer}
                createInternalMCPServer={onCreateInternalMCPServer}
              />
            }
          />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            className="pb-4"
            filter={filter}
            filterColumn="name"
          />
        ))}
    </>
  );
};
