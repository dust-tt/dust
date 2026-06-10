import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithLink,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeMCPServerViewSpaceAvailabilityType } from "@app/lib/api/poke/mcp_server_views";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types/user";

interface MCPServerSpaceAvailabilityTableProps {
  owner: LightWorkspaceType;
  spaceViews: PokeMCPServerViewSpaceAvailabilityType[];
}

export function MCPServerSpaceAvailabilityTable({
  owner,
  spaceViews,
}: MCPServerSpaceAvailabilityTableProps) {
  return (
    <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Available in spaces</h2>
      {spaceViews.length === 0 ? (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          This server is only installed in the system space and not shared to
          any other space yet.
        </p>
      ) : (
        <PokeTable>
          <PokeTableHeader>
            <PokeTableRow>
              <PokeTableHead>Space</PokeTableHead>
              <PokeTableHead>View ID</PokeTableHead>
              <PokeTableHead>Kind</PokeTableHead>
              <PokeTableHead>Added by</PokeTableHead>
              <PokeTableHead>Added at</PokeTableHead>
            </PokeTableRow>
          </PokeTableHeader>
          <PokeTableBody>
            {spaceViews.map((view) => (
              <PokeTableRow key={view.sId}>
                <PokeTableCellWithLink
                  href={`/poke/${owner.sId}/spaces/${view.spaceId}/mcp_server_views/${view.sId}`}
                  content={view.space.name}
                />
                <PokeTableCell>{view.sId}</PokeTableCell>
                <PokeTableCell>{view.space.kind}</PokeTableCell>
                <PokeTableCell>{view.editedBy ?? ""}</PokeTableCell>
                <PokeTableCell>
                  {view.editedAt
                    ? formatTimestampToFriendlyDate(view.editedAt)
                    : formatTimestampToFriendlyDate(view.createdAt)}
                </PokeTableCell>
              </PokeTableRow>
            ))}
          </PokeTableBody>
        </PokeTable>
      )}
    </div>
  );
}
