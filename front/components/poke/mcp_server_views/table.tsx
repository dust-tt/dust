import { makeColumnsForMCPServerViews } from "@app/components/poke/mcp_server_views/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { usePokeMCPServerViews } from "@app/poke/swr/mcp_server_views";
import type { LightWorkspaceType } from "@app/types";

interface MCPServerViewsDataTableProps {
  owner: LightWorkspaceType;
  spaceId?: string;
  loadOnInit?: boolean;
}

function prepareMCPServerViewsForDisplay(
  owner: LightWorkspaceType,
  mcpServerViews: MCPServerViewType[],
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
        name: sv.server.name,
      };

      return result;
    })
    .filter((sv) => !spaceId || sv.spaceId === spaceId);
}

export function MCPServerViewsDataTable({
  owner,
  spaceId,
  loadOnInit,
}: MCPServerViewsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="MCP Server Views"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeMCPServerViews}
    >
      {(data) => (
        <PokeDataTable
          columns={makeColumnsForMCPServerViews()}
          data={prepareMCPServerViewsForDisplay(owner, data, spaceId)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
