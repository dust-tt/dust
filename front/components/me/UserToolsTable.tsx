import { Avatar, DataTable, Input, Page, Spinner } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { SearchIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type { MCPServerTypeWithViews } from "@app/lib/api/mcp";
import { useDeleteMetadata } from "@app/lib/swr/user";
interface UserTableRow {
  id: string;
  name: string;
  description: string;
  visual: string;
  onClick?: () => void;
  moreMenuItems?: any[];
}

interface UserToolsTableProps {
  mcpServers: MCPServerTypeWithViews[] | undefined;
  isMCPServersLoading: boolean;
}

export function UserToolsTable({
  mcpServers,
  isMCPServersLoading,
}: UserToolsTableProps) {
  const sendNotification = useSendNotification();
  const [searchQuery, setSearchQuery] = useState("");

  const { deleteMetadata } = useDeleteMetadata("toolsValidations");
  const handleDeleteToolMetadata = useCallback(
    async (mcpServerId: string) => {
      try {
        await deleteMetadata(`:${mcpServerId}`);
        sendNotification({
          title: "Success!",
          description: "Tool approbation history deleted for this toolset.",
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
    [sendNotification]
  );

  // Prepare data for the actions table
  const actionsTableData = useMemo(() => {
    if (!mcpServers) return [];

    return mcpServers
      .filter((server) =>
        server.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map((server) => ({
        id: server.id,
        name: server.name,
        description: server.description,
        visual: server.visual,
        onClick: () => {},
        moreMenuItems: [],
      }));
  }, [mcpServers, searchQuery]);

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
          <DataTable.CellContent>
            <div className="flex flex-row items-center gap-2 py-3">
              <Avatar visual={row.original.visual} size="sm" />
              <div className="flex flex-col">
                <div className="flex-grow">{row.original.name}</div>
                <span className="line-clamp-1 text-sm text-muted-foreground">
                  {row.original.description || "No description available"}
                </span>
              </div>
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
        cell: ({ row }) => {
          return (
            <DataTable.MoreButton
              menuItems={[
                {
                  label: "Delete tool approbation history",
                  onClick: () => handleDeleteToolMetadata(row.original.id),
                  kind: "item",
                },
              ]}
            />
          );
        },
        meta: {
          className: "w-12",
        },
      },
    ],
    [handleDeleteToolMetadata]
  );

  return (
    <>
      <div className="relative mb-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <Input
          className="pl-10"
          placeholder="Search toolsets"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isMCPServersLoading ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : actionsTableData.length > 0 ? (
        <DataTable data={actionsTableData} columns={actionColumns} />
      ) : (
        <Page.P>
          {searchQuery ? "No matching toolsets found" : "No toolsets available"}
        </Page.P>
      )}
    </>
  );
} 