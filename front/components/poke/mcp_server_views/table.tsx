import { makeColumnsForMCPServerViews } from "@app/components/poke/mcp_server_views/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeMCPServerViewListItemType } from "@app/lib/api/poke/mcp_server_views";
import { useAppRouter } from "@app/lib/platform";
import {
  usePokeMCPServerViews,
  usePokeSystemSpaceMCPServerViews,
} from "@app/poke/swr/mcp_server_views";
import type { LightWorkspaceType } from "@app/types/user";

interface MCPServerViewsDataTableProps {
  owner: LightWorkspaceType;
  spaceId?: string;
  loadOnInit?: boolean;
  systemSpaceOnly?: boolean;
}

function prepareMCPServerViewsForDisplay(
  owner: LightWorkspaceType,
  mcpServerViews: PokeMCPServerViewListItemType[],
  spaceId?: string
) {
  return mcpServerViews
    .map((sv) => {
      // We need to add display properties but keep the original properties
      const result = {
        ...sv,
        // For display purposes
        mcpServerViewLink: `/poke/${owner.sId}/spaces/${sv.spaceId}/mcp_server_views/${sv.sId}`,
        spaceLink: `/poke/${owner.sId}/spaces/${sv.spaceId}`,
        editedAt: sv.editedByUser?.editedAt ?? undefined,
        editedBy: sv.editedByUser?.fullName ?? undefined,
      };

      return result;
    })
    .filter((sv) => !spaceId || sv.spaceId === spaceId);
}

export function MCPServerViewsDataTable({
  owner,
  spaceId,
  loadOnInit,
  systemSpaceOnly = false,
}: MCPServerViewsDataTableProps) {
  const router = useAppRouter();

  return (
    <PokeDataTableConditionalFetch
      header={systemSpaceOnly ? "MCP Servers" : "MCP Server Views"}
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={
        systemSpaceOnly
          ? usePokeSystemSpaceMCPServerViews
          : usePokeMCPServerViews
      }
    >
      {(data) => (
        <PokeDataTable
          columns={makeColumnsForMCPServerViews({
            hideSpaceColumn: systemSpaceOnly,
          })}
          data={prepareMCPServerViewsForDisplay(owner, data, spaceId)}
          onRowClick={(row) => void router.push(row.mcpServerViewLink)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
