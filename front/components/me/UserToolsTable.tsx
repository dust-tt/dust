import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import {
  useCreatePersonalConnection,
  useDeleteMCPServerConnection,
  useMCPServerConnections,
  useMCPServerViews,
  useMCPServerViewsFromSpaces,
} from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import { useDeleteToolApproval, useUserApprovals } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  CloudArrowLeftRight,
  DataTable,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  LoadingBlock,
  SearchInput,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import keyBy from "lodash/keyBy";
import { useCallback, useMemo, useState } from "react";

interface UserTableRow {
  id: string;
  name: string;
  description: string;
  serverView: MCPServerViewType;
  connection: MCPServerConnectionType | undefined;
  canConnect: boolean;
  hasApproval: boolean;
  visual: React.JSX.Element;
  onClick?: () => void;
}

interface UserToolsTableProps {
  owner: LightWorkspaceType;
}

interface UserToolSkeletonRow {
  actions: string;
  name: string;
  onClick?: () => void;
}

const USER_TOOL_SKELETON_ROWS: UserToolSkeletonRow[] = Array.from(
  { length: 5 },
  (_, index) => ({
    actions: `action-${index}`,
    name: `tool-${index}`,
  })
);

const USER_TOOL_SKELETON_COLUMNS: ColumnDef<UserToolSkeletonRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <DataTable.CellContent grow>
        <div className="flex flex-row items-center gap-3 py-3">
          <LoadingBlock className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-grow flex-col overflow-hidden">
            <div className="flex h-5 items-center">
              <LoadingBlock
                className={classNames(
                  "h-4 max-w-full",
                  ["w-28", "w-36", "w-24", "w-32", "w-40"][row.index]
                )}
              />
            </div>
            <div className="flex h-5 items-center">
              <LoadingBlock
                className={classNames(
                  "h-4 max-w-full",
                  ["w-64", "w-52", "w-72", "w-60", "w-56"][row.index]
                )}
              />
            </div>
          </div>
          <LoadingBlock className="h-6 w-20 shrink-0 rounded-[9px]" />
        </div>
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-full",
    },
  },
  {
    accessorKey: "actions",
    header: "",
    cell: () => (
      <DataTable.CellContent>
        <LoadingBlock className="h-8 w-8 rounded-xl" />
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-12",
    },
  },
];

function UserToolsTableSkeleton() {
  return (
    <div aria-hidden="true">
      <DataTable
        data={USER_TOOL_SKELETON_ROWS}
        columns={USER_TOOL_SKELETON_COLUMNS}
        sorting={[{ id: "name", desc: false }]}
      />
    </div>
  );
}

export function UserToolsTable({ owner }: UserToolsTableProps) {
  const sendNotification = useSendNotification();
  const [searchQuery, setSearchQuery] = useState("");

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular"],
  });
  const globalSpace = spaces.find((space) => space.kind === "global");
  const { serverViews, isLoading: isMCPServerViewsLoading } =
    useMCPServerViewsFromSpaces(owner, spaces);
  const {
    serverViews: hiddenServerViews,
    isMCPServerViewsLoading: isHiddenMCPServerViewsLoading,
  } = useMCPServerViews({
    owner,
    space: globalSpace,
    availability: "auto_hidden_builder",
    disabled: !globalSpace,
  });
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
    connectionType: "personal",
  });
  const { approvals, isApprovalsLoading, mutateApprovals } =
    useUserApprovals(owner);
  const { deleteToolApproval } = useDeleteToolApproval();

  const handleDeleteToolMetadata = useCallback(
    async (mcpServerId: string) => {
      const response = await deleteToolApproval(owner, mcpServerId);
      if (response && !response.ok) {
        sendNotification({
          title: "Error",
          description: "Failed to delete tool approbation history.",
          type: "error",
        });
        return;
      }

      await mutateApprovals();
      sendNotification({
        title: "Success!",
        description: "Tool approbation history deleted.",
        type: "success",
      });
    },
    [sendNotification, deleteToolApproval, mutateApprovals, owner]
  );

  const { deleteMCPServerConnection } = useDeleteMCPServerConnection({
    owner,
  });

  const { createPersonalConnection } = useCreatePersonalConnection(owner);
  const [connectingServerId, setConnectingServerId] = useState<string | null>(
    null
  );

  const handleConnect = useCallback(
    async (serverView: MCPServerViewType) => {
      const { authorization } = serverView.server;
      if (!authorization) {
        return;
      }
      setConnectingServerId(serverView.server.sId);
      try {
        const result = await createPersonalConnection({
          mcpServerId: serverView.server.sId,
          mcpServerDisplayName: getMcpServerViewDisplayName(serverView),
          authorization,
          provider: authorization.provider,
          useCase: "personal_actions",
          scope: authorization.scope,
        });
        if (!result.success && result.error) {
          sendNotification({
            type: "error",
            title: "Failed to connect provider",
            description: result.error,
          });
        }
      } finally {
        setConnectingServerId(null);
      }
    },
    [createPersonalConnection, sendNotification]
  );

  // Prepare data for the actions table
  const actionsTableData = useMemo(() => {
    const connectionsByServerId = keyBy(
      connections,
      (c) => c.internalMCPServerId ?? `${c.remoteMCPServerId}`
    );

    const approvalServerIds = new Set(
      approvals.map((approval) => approval.mcpServerId)
    );

    const isConnectable = (serverView: MCPServerViewType) =>
      serverView.oAuthUseCase === "personal_actions" &&
      !!serverView.server.authorization;

    return [...serverViews, ...hiddenServerViews]
      .filter((serverView) => {
        // Include servers that have approvals, connections, or that the user
        // could connect to (personal-auth tools available in the workspace).
        const hasConnection = !!connectionsByServerId[serverView.server.sId];
        const hasApproval = approvalServerIds.has(serverView.server.sId);
        return hasConnection || hasApproval || isConnectable(serverView);
      })
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
        canConnect: isConnectable(serverView),
        hasApproval: approvalServerIds.has(serverView.server.sId),
        visual: getAvatar(serverView.server),
        onClick: () => {},
      }));
  }, [serverViews, hiddenServerViews, connections, approvals, searchQuery]);

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
                <div className="truncate text-sm font-semibold text-foreground">
                  {getMcpServerViewDisplayName(row.original.serverView)}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {getMcpServerViewDescription(row.original.serverView)}
                </div>
              </div>

              {row.original.connection && (
                <Chip color="success" size="xs">
                  Connected
                </Chip>
              )}
              {!row.original.connection && row.original.canConnect && (
                <Button
                  icon={CloudArrowLeftRight}
                  size="xs"
                  variant="outline"
                  label="Connect"
                  disabled={connectingServerId !== null}
                  isLoading={
                    connectingServerId === row.original.serverView.server.sId
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleConnect(row.original.serverView);
                  }}
                />
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
        cell: ({ row }) =>
          (row.original.hasApproval || row.original.connection) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  icon={DotsHorizontal}
                  size="icon"
                  variant="ghost-secondary"
                  onClick={(e) => e.stopPropagation()}
                />
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    {row.original.hasApproval && (
                      <DropdownMenuItem
                        label="Clear confirmation preferences"
                        onClick={() =>
                          handleDeleteToolMetadata(
                            row.original.serverView.server.sId
                          )
                        }
                      />
                    )}
                    {row.original.connection && (
                      <DropdownMenuItem
                        label="Disconnect"
                        onClick={() =>
                          deleteMCPServerConnection({
                            connection: row.original.connection!,
                            mcpServer: row.original.serverView.server,
                          })
                        }
                      />
                    )}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>
          ),
        meta: {
          className: "w-12",
        },
      },
    ],
    [
      deleteMCPServerConnection,
      handleDeleteToolMetadata,
      handleConnect,
      connectingServerId,
    ]
  );

  return (
    <>
      <div className="relative my-4">
        <SearchInput
          name="search"
          placeholder="Search tools"
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {isMCPServerViewsLoading ||
      isHiddenMCPServerViewsLoading ||
      isConnectionsLoading ||
      isApprovalsLoading ? (
        <UserToolsTableSkeleton />
      ) : actionsTableData.length > 0 ? (
        <DataTable
          data={actionsTableData}
          columns={actionColumns}
          sorting={[{ id: "name", desc: false }]}
        />
      ) : (
        <p className="py-8 text-center text-muted-foreground">
          {searchQuery ? "No matching tools found" : "No tools available yet."}
        </p>
      )}
    </>
  );
}
