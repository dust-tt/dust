import {
  Avatar,
  Button,
  Chip,
  classNames,
  Cog6ToothIcon,
  DataTable,
  IconButton,
  SearchInput,
  SliderToggle,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React, { useMemo, useState } from "react";

import { CreateRemoteMCPServerModal } from "@app/components/actions/mcp/CreateRemoteMCPServerModal";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  DEFAULT_MCP_SERVER_ICON,
  MCP_SERVER_ICONS,
} from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { MCPServerViewType } from "@app/lib/resources/mcp_server_view_resource";
import {
  useAvailableMCPServers,
  useCreateInternalMCPServer,
  useDeleteMCPServer,
  useMCPServerConnections,
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type RowData = {
  mcpServer: MCPServerType;
  mcpServerView?: MCPServerViewType;
  isConnected: boolean;
  spaces: SpaceType[];
  onClick: () => void;
};

type CellProps = {
  owner: LightWorkspaceType;
  row: RowData;
};

const Cell = ({ owner, row }: CellProps) => {
  const { mcpServer, mcpServerView, isConnected, spaces } = row;
  const { deleteServer } = useDeleteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  const [loading, setLoading] = useState(false);
  const { serverType } = getServerTypeAndIdFromSId(mcpServer.id);

  const enabled = mcpServerView !== undefined;
  return (
    <DataTable.CellContent grow>
      <div
        className={classNames(
          "flex flex-row items-center gap-2 py-3",
          mcpServerView ? "" : "opacity-50"
        )}
      >
        <div>
          <Avatar
            visual={React.createElement(
              MCP_SERVER_ICONS[mcpServer.icon || DEFAULT_MCP_SERVER_ICON]
            )}
          />
        </div>
        <div className="flex flex-grow items-center justify-between overflow-hidden truncate">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
              {mcpServer.name}
            </div>
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {mcpServer.description}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {mcpServerView && !spaces.find((s) => s.kind === "global") && (
            <Chip color="red" size="xs">
              Restricted
            </Chip>
          )}

          {mcpServerView && isConnected && (
            <Chip color="emerald" size="xs">
              Connected
            </Chip>
          )}
          {mcpServerView && !isConnected && mcpServer.authorization && (
            <Chip color="red" size="xs">
              Disconnected
            </Chip>
          )}
        </div>

        {mcpServerView && (
          <Button
            disabled={!mcpServerView}
            variant="outline"
            label="Manage"
            size="sm"
            icon={Cog6ToothIcon}
          />
        )}
        {!mcpServer.isDefault && (
          <>
            {serverType === "internal" ? (
              <SliderToggle
                disabled={loading}
                selected={enabled}
                onClick={async (e) => {
                  e.stopPropagation();
                  setLoading(true);
                  if (enabled) {
                    await deleteServer(mcpServer.id);
                  } else {
                    await createInternalMCPServer(mcpServer.name, true);
                  }
                  setLoading(false);
                }}
              />
            ) : (
              <IconButton
                variant="outline"
                icon={TrashIcon}
                onClick={async (e) => {
                  e.stopPropagation();

                  await deleteServer(mcpServer.id);
                }}
                size="sm"
              />
            )}
          </>
        )}
      </div>
    </DataTable.CellContent>
  );
};

type AdminActionsListProps = {
  owner: LightWorkspaceType;
  setMcpServer: (mcpServer: MCPServerType) => void;
};

export const AdminActionsList = ({
  owner,
  setMcpServer,
}: AdminActionsListProps) => {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });

  const systemSpace = useMemo(() => {
    return spaces.find((space) => space.kind === "system");
  }, [spaces]);

  const { availableMCPServers, isAvailableMCPServersLoading } =
    useAvailableMCPServers({
      owner,
    });

  const { mcpServers, isMCPServersLoading } = useMCPServers({
    owner,
  });

  const [isCreating, setIsCreating] = useState(false);

  const { connections } = useMCPServerConnections({
    owner,
  });

  const getTableColumns = (): ColumnDef<RowData>[] => {
    const columns: ColumnDef<RowData, any>[] = [];

    columns.push({
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: (info: CellContext<RowData, string>) => (
        <Cell row={info.row.original} owner={owner} />
      ),
      filterFn: (row, id, filterValue) => {
        return (
          row.original.mcpServer.name
            .toLowerCase()
            .includes(filterValue.toLowerCase()) ||
          row.original.mcpServer.description
            .toLowerCase()
            .includes(filterValue.toLowerCase()) ||
          row.original.mcpServer.tools.some((tool) =>
            tool.name.toLowerCase().includes(filterValue.toLowerCase())
          )
        );
      },
    });

    return columns;
  };

  const allServers = [
    ...availableMCPServers,
    ...mcpServers.filter(
      (server) =>
        !availableMCPServers.some((available) => available.id === server.id)
    ),
  ];

  const rows: RowData[] = allServers.map((mcpServer) => {
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
  });
  const columns = getTableColumns();

  const [filter, setFilter] = useState("");

  return (
    <>
      <div className="flex flex-row gap-2">
        <SearchInput
          name="filter"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e)}
        />
        <CreateRemoteMCPServerModal
          owner={owner}
          setMCPServer={setMcpServer}
          setIsCreating={setIsCreating}
        />
      </div>

      {isAvailableMCPServersLoading || isMCPServersLoading || isCreating ? (
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
