import type { WorkspaceDomain, WorkspaceType } from "@dust-tt/types";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";

export function WorkspaceInfoTable({
  owner,
  workspaceVerifiedDomain,
  worspaceCreationDay,
}: {
  owner: WorkspaceType;
  workspaceVerifiedDomain: WorkspaceDomain | null;
  worspaceCreationDay: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-md flex-grow pb-4 font-bold">Workspace info:</h2>
        </div>
        <PokeTable>
          <PokeTableBody>
            <PokeTableRow>
              <PokeTableCell>Id</PokeTableCell>
              <PokeTableCellWithCopy label={owner.id.toString()} />
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>sId</PokeTableCell>
              <PokeTableCellWithCopy label={owner.sId} />
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Creation</PokeTableCell>
              <PokeTableCell>{worspaceCreationDay}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>SSO Enforced</PokeTableCell>
              <PokeTableCell>{owner.ssoEnforced ? "✅" : "❌"}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Auto Join</PokeTableCell>
              <PokeTableCell>
                {workspaceVerifiedDomain?.domainAutoJoinEnabled ? "✅" : "❌"}
              </PokeTableCell>
              <PokeTableCell>{workspaceVerifiedDomain?.domain}</PokeTableCell>
            </PokeTableRow>
          </PokeTableBody>
        </PokeTable>
      </div>
    </div>
  );
}
