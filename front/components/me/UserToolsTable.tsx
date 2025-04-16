import { Avatar, DataTable, Input, Page, Spinner } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { SearchIcon } from "lucide-react";
import type {
  FunctionComponentElement,
  SVGProps} from "react";
import {
  useCallback,
  useMemo,
  useState,
} from "react";

import { getVisual } from "@app/lib/actions/mcp_icons";
import { useMCPServerViews } from "@app/lib/swr/mcp_server_views";
import { useSpaces } from "@app/lib/swr/spaces";
import { useDeleteMetadata } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types";
interface UserTableRow {
  id: string;
  name: string;
  description: string;
  visual:
    | `https://${string}`
    | FunctionComponentElement<SVGProps<SVGSVGElement>>;
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
  const { serverViews, isMCPServerViewsLoading } = useMCPServerViews({
    owner,
    space: spaces[0],
  });

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
      .filter((serverView) =>
        serverView.server.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map((serverView) => ({
        id: serverView.id,
        name: serverView.server.name,
        description: serverView.server.description,
        visual: getVisual(serverView.server),
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

      {isMCPServerViewsLoading ? (
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
