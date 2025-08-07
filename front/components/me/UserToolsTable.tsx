import { Chip, DataTable, Label, SearchInput, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { keyBy } from "lodash";
import { useCallback, useMemo, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { useRemoteMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import {
  useDeleteMCPServerConnection,
  useMCPServerConnections,
} from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import { useDeleteMetadata } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types";

interface UserTableRow {
  id: string;
  name: string;
  description: string;
  serverView: MCPServerViewType;
  connection: MCPServerConnectionType | undefined;
  visual: React.ReactNode;
  onClick?: () => void;
  moreMenuItems?: any[];
}

interface UserToolsTableProps {
  owner: LightWorkspaceType;
}

export function UserToolsTable({ owner }: UserToolsTableProps) {
  const sendNotification = useSendNotification();
  const [searchQuery, setSearchQuery] = useState("");

  const { spaces } = useSpaces({ workspaceId: owner.sId });
  const { serverViews, isLoading: isMCPServerViewsLoading } =
    useRemoteMCPServerViewsFromSpaces(owner, spaces);
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
    connectionType: "personal",
  });
  const { deleteMetadata } = useDeleteMetadata();

  const handleDeleteToolMetadata = useCallback(
    async (mcpServerId: string) => {
      try {
        await deleteMetadata(`toolsValidations:${mcpServerId}`);
        sendNotification({
          title: "Success!",
          description: "Tool approbation history deleted.",
          type: "success",
        });
      } catch (error) {
        sendNotification({
          title: "Error",
          description: "Failed to delete tool approbation history.",
          type: "error",
        });
      }
    },
    [sendNotification, deleteMetadata]
  );

  const { deleteMCPServerConnection } = useDeleteMCPServerConnection({
    owner,
  });

  // Prepare data for the actions table
  const actionsTableData = useMemo(() => {
    if (!serverViews) {
      return [];
    }

    const connectionsByServerId = keyBy(
      connections,
      (c) => c.internalMCPServerId ?? `${c.remoteMCPServerId}`
    );

    return serverViews
      .filter(
        (serverView) =>
          (serverView.name ?? serverView.server.name)
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          getMcpServerViewDescription(serverView)
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      )
      .map((serverView) => ({
        id: serverView.sId,
        name: getMcpServerViewDisplayName(serverView),
        description: getMcpServerViewDescription(serverView),
        serverView: serverView,
        connection: connectionsByServerId[serverView.server.sId],
        visual: getAvatar(serverView.server),
        onClick: () => {},
        moreMenuItems: [],
      }));
  }, [serverViews, connections, searchQuery]);

  // Define columns for the actions table
  const actionColumns = useMemo<ColumnDef<UserTableRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        sortingFn: (rowA, rowB) => {
          return rowA.original.name.localeCompare(rowB.original.name);
        },
        cell: ({ row }) => (
          <DataTable.CellContent grow>
            <div
              className={classNames("flex flex-row items-center gap-3 py-3")}
            >
              {getAvatar(row.original.serverView.server)}
              <div className="flex flex-grow flex-col gap-0 overflow-hidden truncate">
                <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
                  {getMcpServerViewDisplayName(row.original.serverView)}
                </div>
                <div className="truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {getMcpServerViewDescription(row.original.serverView)}
                </div>
              </div>

              {row.original.connection && (
                <Chip color="success" size="xs">
                  Connected
                </Chip>
              )}
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-full",
        },
      },
      {
        header: "",
        accessorKey: "actions",
        cell: ({ row }) => (
          <DataTable.MoreButton
            menuItems={[
              {
                label: "Delete confirmation preferences",
                onClick: () =>
                  handleDeleteToolMetadata(row.original.serverView.server.sId),
                kind: "item",
              },
              ...(row.original.connection
                ? [
                    {
                      label: "Disconnect",
                      onClick: () =>
                        deleteMCPServerConnection({
                          connection: row.original.connection!,
                          mcpServer: row.original.serverView.server,
                        }),
                      kind: "item" as const,
                    },
                  ]
                : []),
            ]}
          />
        ),
        meta: {
          className: "w-12",
        },
      },
    ],
    [deleteMCPServerConnection, handleDeleteToolMetadata]
  );

  return (
    <>
      <div className="relative mb-4">
        <SearchInput
          name="search"
          placeholder="Search tools"
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {isMCPServerViewsLoading || isConnectionsLoading ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : actionsTableData.length > 0 ? (
        <DataTable
          data={actionsTableData}
          columns={actionColumns}
          sorting={[{ id: "name", desc: false }]}
        />
      ) : (
        <Label>
          {searchQuery ? "No matching tools found" : "No tools available"}
        </Label>
      )}
    </>
  );
}
