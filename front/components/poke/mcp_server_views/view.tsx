import { OAUTH_USE_CASE_TO_LABEL } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import { CopyTokenButton } from "@app/components/poke/CopyTokenButton";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableCellWithLink,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType, PokeMCPServerViewType } from "@app/types";

interface ViewMCPServerViewTableProps {
  mcpServerView: PokeMCPServerViewType;
  owner: LightWorkspaceType;
}

export function ViewMCPServerViewTable({
  mcpServerView,
  owner,
}: ViewMCPServerViewTableProps) {
  return (
    <div className="flex flex-col space-y-8">
      <div className="flex justify-between gap-3">
        <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-md flex-grow pb-4 font-bold">Overview</h2>
          </div>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableHead>Id</PokeTableHead>
                <PokeTableCellWithCopy label={mcpServerView.id.toString()} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Server Name</PokeTableHead>
                <PokeTableCell>
                  {getMcpServerViewDisplayName(mcpServerView)}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Server ID</PokeTableHead>
                <PokeTableCellWithCopy label={mcpServerView.server.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Server Description</PokeTableHead>
                <PokeTableCell>
                  {getMcpServerViewDescription(mcpServerView)}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Credentials Type</PokeTableHead>
                <PokeTableCell>
                  {mcpServerView.oAuthUseCase
                    ? `${OAUTH_USE_CASE_TO_LABEL[mcpServerView.oAuthUseCase]} credentials`
                    : "Not configured"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Space</PokeTableHead>
                <PokeTableCellWithLink
                  href={`/poke/${owner.sId}/spaces/${mcpServerView.spaceId}`}
                  content={mcpServerView.space.name}
                />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Created At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(mcpServerView.createdAt)}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Updated At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(mcpServerView.updatedAt)}
                </PokeTableCell>
              </PokeTableRow>
              {mcpServerView.editedByUser && (
                <>
                  <PokeTableRow>
                    <PokeTableHead>Edited By</PokeTableHead>
                    <PokeTableCell>
                      {mcpServerView.editedByUser.fullName}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Edited At</PokeTableHead>
                    <PokeTableCell>
                      {formatTimestampToFriendlyDate(
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        mcpServerView.editedByUser.editedAt || 0
                      )}
                    </PokeTableCell>
                  </PokeTableRow>
                </>
              )}
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
      {mcpServerView.connections && mcpServerView.connections.length > 0 && (
        <div className="flex justify-between gap-3">
          <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-md flex-grow pb-4 font-bold">Connections</h2>
            </div>
            <PokeTable>
              <PokeTableHeader>
                <PokeTableRow>
                  <PokeTableHead>Connection Type</PokeTableHead>
                  <PokeTableHead>User</PokeTableHead>
                  <PokeTableHead>Access Token</PokeTableHead>
                </PokeTableRow>
              </PokeTableHeader>
              <PokeTableBody>
                {mcpServerView.connections.map((connection, index) => (
                  <PokeTableRow key={index}>
                    <PokeTableCell>
                      <span className="capitalize">
                        {connection.connectionType}
                      </span>
                    </PokeTableCell>
                    <PokeTableCell>
                      {connection.connectionType === "workspace" ? (
                        <span className="text-gray-500">Workspace</span>
                      ) : (
                        (connection.userFullName ??
                        connection.userEmail ??
                        connection.userId ?? (
                          <span className="text-gray-500">N/A</span>
                        ))
                      )}
                    </PokeTableCell>
                    <PokeTableCell>
                      {(() => {
                        let url = `/api/poke/workspaces/${owner.sId}/mcp/connections/${mcpServerView.server.sId}/${connection.connectionType}/token`;
                        if (
                          connection.connectionType === "personal" &&
                          connection.userId
                        ) {
                          url += `?userId=${encodeURIComponent(
                            connection.userId
                          )}`;
                        }
                        return <CopyTokenButton tokenUrl={url} />;
                      })()}
                    </PokeTableCell>
                  </PokeTableRow>
                ))}
              </PokeTableBody>
            </PokeTable>
          </div>
        </div>
      )}
    </div>
  );
}
