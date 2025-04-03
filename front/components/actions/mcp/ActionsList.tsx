import {
  Avatar,
  classNames,
  DataTable,
  IconButton,
  SearchInput,
  SliderToggle,
  Spinner,
  XMarkIcon,
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
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types";

type RowData = {
  mcpServer: MCPServerType;
  serverView?: MCPServerViewType;
  onClick: () => void;
};

type ActionCellProps = {
  mcpServer: MCPServerType;
  mcpServerView?: MCPServerViewType;
  owner: LightWorkspaceType;
};

const ActionCell = ({ mcpServer, mcpServerView, owner }: ActionCellProps) => {
  const { deleteServer } = useDeleteMCPServer(owner);
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  const [loading, setLoading] = useState(false);
  const { serverType } = getServerTypeAndIdFromSId(mcpServer.id);

  if (serverType === "internal") {
    const enabled = mcpServerView !== undefined;
    return (
      <DataTable.CellContent>
        <SliderToggle
          disabled={loading}
          selected={enabled}
          onClick={async (e) => {
            e.stopPropagation();
            setLoading(true);
            if (enabled) {
              await deleteServer(mcpServer.id);
            } else {
              await createInternalMCPServer(mcpServer.name);
            }
            setLoading(false);
          }}
        />
      </DataTable.CellContent>
    );
  } else {
    return (
      <DataTable.CellContent>
        <IconButton
          variant="outline"
          icon={XMarkIcon}
          onClick={async (e) => {
            e.stopPropagation();

            await deleteServer(mcpServer.id);
          }}
          size="sm"
        />
      </DataTable.CellContent>
    );
  }
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

  const getTableColumns = (): ColumnDef<RowData>[] => {
    const columns: ColumnDef<RowData, any>[] = [];

    columns.push({
      id: "name",
      header: "Name",
      accessorKey: "mcpServer",
      filterFn: (row, id, filterValue) => {
        return row.original.mcpServer.name
          .toLowerCase()
          .includes(filterValue.toLowerCase());
      },
      sortingFn: (a, b) =>
        a.original.mcpServer.name.localeCompare(b.original.mcpServer.name),
      cell: (info: CellContext<RowData, MCPServerType>) => (
        <DataTable.CellContent>
          <div
            className={classNames(
              "flex flex-row items-center gap-2 py-3",
              info.row.original.serverView ? "" : "opacity-50"
            )}
          >
            <div>
              <Avatar
                visual={React.createElement(
                  MCP_SERVER_ICONS[
                    info.getValue().icon || DEFAULT_MCP_SERVER_ICON
                  ]
                )}
              />
            </div>
            <div className="flex min-w-0 grow flex-col">
              <div className="overflow-hidden truncate text-sm font-semibold text-foreground dark:text-foreground-night">
                {info.getValue().name}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                {info.getValue().description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
    });

    columns.push({
      id: "action",
      accessorKey: "mcpServer",
      header: "",
      cell: (info: CellContext<RowData, MCPServerType>) => (
        <ActionCell
          mcpServer={info.getValue()}
          mcpServerView={info.row.original.serverView}
          owner={owner}
        />
      ),
      meta: {
        className: "w-28",
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
    const serverView = mcpServerWithViews?.views.find(
      (v) => v.spaceId === systemSpace?.sId
    );

    return {
      mcpServer,
      serverView,
      onClick: () => {
        if (serverView && mcpServer) {
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
