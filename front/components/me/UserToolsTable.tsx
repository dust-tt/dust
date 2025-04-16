import {
  Avatar,
  DataTable,
  Label,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { getAvatar } from "@app/lib/actions/mcp_icons";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_server_views";
import { useSpaces } from "@app/lib/swr/spaces";
import { useDeleteMetadata } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types";

interface UserTableRow {
  id: string;
  name: string;
  description: string;
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
    useMCPServerViewsFromSpaces(owner, spaces);

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
    [sendNotification, deleteMetadata]
  );

  // Prepare data for the actions table
  const actionsTableData = useMemo(() => {
    if (!serverViews) {
      return [];
    }

    return serverViews
      .filter(
        (serverView) =>
          serverView.server.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          serverView.server.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      )
      .map((serverView) => ({
        id: serverView.id,
        name: serverView.server.name,
        description: serverView.server.description,
        visual: getAvatar(serverView.server),
        onClick: () => {},
        moreMenuItems: [],
      }));
  }, [serverViews, searchQuery]);

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
                <span className="line-clamp-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
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
        cell: ({ row }) => (
          <DataTable.MoreButton
            menuItems={[
              {
                label: "Delete tool approbation history",
                onClick: () => handleDeleteToolMetadata(row.original.id),
                kind: "item",
              },
            ]}
          />
        ),
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
        <SearchInput
          name="search"
          placeholder="Search toolsets"
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {isMCPServerViewsLoading ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : actionsTableData.length > 0 ? (
        <DataTable data={actionsTableData} columns={actionColumns} />
      ) : (
        <Label>
          {searchQuery ? "No matching toolsets found" : "No toolsets available"}
        </Label>
      )}
    </>
  );
}
