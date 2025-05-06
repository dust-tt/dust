import Link from "next/link";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type {
  ExtensionConfigurationType,
  WorkspaceDomain,
  WorkspaceType,
} from "@app/types";

export function WorkspaceInfoTable({
  owner,
  workspaceVerifiedDomain,
  worspaceCreationDay,
  extensionConfig,
}: {
  owner: WorkspaceType;
  workspaceVerifiedDomain: WorkspaceDomain | null;
  worspaceCreationDay: string;
  extensionConfig: ExtensionConfigurationType | null;
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
              <PokeTableCell>Workspace Health</PokeTableCell>
              <PokeTableCell>
                <Link
                  href={`https://metabase.dust.tt/dashboard/34-snowflake-workspace-health?end_date=2030-12-31&start_date=2024-01-01&tab=30-executive-summary&workspace_size_difference_margin=0.2&workspacesid=${owner.sId}`}
                  target="_blank"
                  className="text-xs text-highlight-400"
                >
                  Metabase
                </Link>
              </PokeTableCell>
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
            <PokeTableRow>
              <PokeTableCell className="max-w-48">
                Extension blacklisted domains/URLs
              </PokeTableCell>
              <PokeTableCell>
                {extensionConfig?.blacklistedDomains.length
                  ? extensionConfig.blacklistedDomains.join(", ")
                  : "None"}
              </PokeTableCell>
            </PokeTableRow>
          </PokeTableBody>
        </PokeTable>
      </div>
    </div>
  );
}
