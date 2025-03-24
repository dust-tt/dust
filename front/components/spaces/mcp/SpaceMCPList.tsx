import {
  Button,
  CommandLineIcon,
  DataTable,
  PencilSquareIcon,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  TrashIcon,
  usePaginationFromUrl,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { MenuItem } from "@dust-tt/sparkle";
import { sortBy } from "lodash";
import type { ComponentType } from "react";
import * as React from "react";
import { useState } from "react";

import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useRemoteMCPServers, useDeleteRemoteMCPServer } from "@app/lib/swr/remote_mcp_servers";
import type {
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import SpaceMCPModal from "./SpaceMCPModal";

type MCPServerDisplay = {
  id: string;
  name: string;
  description: string;
  tools: { name: string, description: string }[];
  url: string;
};

type RowData = {
  server: MCPServerDisplay;
  category: string;
  name: string;
  icon: ComponentType;
  workspaceId: string;
  menuItems?: MenuItem[];
  onClick?: () => void;
};

interface SpaceMCPListProps {
  canWriteInSpace: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

const getTableColumns = (): ColumnDef<RowData, string>[] => {
  return [
    {
      id: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          {info.getValue()}
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.name,
      meta: {
        className: "w-1/3",
      },
    },
    {
      id: "tools",
      header: "Tools",
      cell: (info: CellContext<RowData, string>) => {
        const { server } = info.row.original;
        return (
          <div className="flex flex-wrap gap-1 items-center">
            {server.tools.length > 0 ? (
              <>
                {server.tools.slice(0, 2).map((tool, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-50"
                  >
                    {tool.name}
                  </span>
                ))}
                {server.tools.length > 2 && (
                  <span className="text-xs text-gray-500">
                    +{server.tools.length - 2} more
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-500">No tools</span>
            )}
          </div>
        );
      },
      accessorFn: () => "",
      meta: {
        className: "w-full",
      },
    },
    {
      id: "actions",
      header: "",
      meta: {
        className: "w-16 text-right",
      },
      cell: (info) => (
        <DataTable.MoreButton menuItems={info.row.original.menuItems} />
      ),
    },
  ];
};

export const SpaceMCPList = ({
  owner,
  canWriteInSpace,
  space,
}: SpaceMCPListProps) => {
  const sendNotification = useSendNotification();
  const [isCreateModalOpened, setIsCreateModalOpened] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<MCPServerDisplay | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { deleteServer } = useDeleteRemoteMCPServer();
  
  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value || "";

  const { servers, isServersLoading, mutateServers } = useRemoteMCPServers({
    owner,
    space,
  });

  // Wrapper function for mutateServers to match the expected type
  const handleRefreshServers = async () => {
    await mutateServers();
  };

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const handleDeleteServer = async (server: MCPServerDisplay) => {
    setServerToDelete(server);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteServer = async () => {
    if (!serverToDelete) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteServer(owner, space, serverToDelete.id);
      await mutateServers();
      sendNotification({
        title: "MCP server deleted",
        type: "success",
        description: "The MCP server has been successfully deleted.",
      });
      setIsDeleteConfirmOpen(false);
    } catch (err) {
      sendNotification({
        title: "Error deleting MCP",
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsDeleting(false);
      setServerToDelete(null);
    }
  };

  const handleEditServer = (server: MCPServerDisplay) => {
    setSelectedServerId(server.id);
    setIsEditMode(true);
  };

  const rows: RowData[] = React.useMemo(() => {
    if (!servers || servers.length === 0) {
      return [];
    }
    
    return sortBy(servers, "name").map((server) => {
      const menuItems: MenuItem[] = [];
      
      if (canWriteInSpace) {
        menuItems.push({
          label: "Edit",
          kind: "item",
          icon: PencilSquareIcon,
          onClick: (e) => {
            e.stopPropagation();
            handleEditServer({
              id: server.id || "",
              name: server.name,
              description: server.description,
              tools: server.tools || [],
              url: server.url || "",
            });
          },
        });
        
        menuItems.push({
          label: "Delete",
          icon: TrashIcon,
          kind: "item",
          variant: "warning",
          onClick: (e) => {
            e.stopPropagation();
            handleDeleteServer({
              id: server.id || "",
              name: server.name,
              description: server.description,
              tools: server.tools || [],
              url: server.url || "",
            });
          },
        });
      }

      return {
        server: {
          id: server.id || "",
          name: server.name,
          description: server.description,
          tools: server.tools || [],
          url: server.url || "",
        },
        category: "mcp",
        name: server.name,
        icon: CommandLineIcon,
        workspaceId: owner.sId,
        menuItems,
        onClick: () => {
          handleEditServer({
            id: server.id || "",
            name: server.name,
            description: server.description,
            tools: server.tools || [],
            url: server.url || "",
          });
        },
      };
    });
  }, [servers, owner.sId, canWriteInSpace]);

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  if (isServersLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const columns = getTableColumns();
  const isEmpty = rows.length === 0;

  const closeModal = () => {
    setIsCreateModalOpened(false);
    setSelectedServerId(null);
    setIsEditMode(false);
    // Refresh the server list when modal is closed
    mutateServers();
  };

  const actionButtons = (
    <>
      {canWriteInSpace && (
        <Button
          label="New MCP Server"
          variant="primary"
          icon={PlusIcon}
          size="sm"
          onClick={() => {
            setIsCreateModalOpened(true);
          }}
        />
      )}
    </>
  );

  return (
    <>
      {!isEmpty && portalToHeader(actionButtons)}
      {isEmpty ? (
        <div className="flex h-36 w-full max-w-4xl items-center justify-center gap-2 rounded-lg bg-structure-50 dark:bg-structure-50-night">
          <Button
            label="Add MCP Server"
            disabled={!canWriteInSpace}
            onClick={() => {
              setIsCreateModalOpened(true);
            }}
          />
        </div>
      ) : (
        <DataTable<RowData>
          data={rows}
          columns={columns}
          className="pb-4"
          filter={searchTerm}
          filterColumn="name"
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
      
      {/* Create/Edit Modal */}
      {(isCreateModalOpened || isEditMode) && (
        <SpaceMCPModal
          owner={owner}
          space={space}
          isOpen={isCreateModalOpened || isEditMode}
          onClose={closeModal}
          serverId={selectedServerId || undefined}
          canWriteInSpace={canWriteInSpace}
          onSave={handleRefreshServers}
        />
      )}
      
      {/* Delete Confirmation Dialog */}
      <Sheet
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDeleteConfirmOpen(false);
            setServerToDelete(null);
          }
        }}
      >
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>Delete MCP Server</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="py-4">
              <p>Are you sure you want to delete <strong>{serverToDelete?.name}</strong>?</p>
              <p className="mt-2 text-red-600">This action cannot be undone.</p>
            </div>
          </SheetContainer>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setIsDeleteConfirmOpen(false);
                setServerToDelete(null);
              },
            }}
            rightButtonProps={{
              label: isDeleting ? "Deleting..." : "Delete",
              variant: "warning",
              onClick: confirmDeleteServer,
              disabled: isDeleting,
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
};
