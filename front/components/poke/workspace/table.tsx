import { Chip } from "@dust-tt/sparkle";
import Link from "next/link";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { usePokeWorkOSDSyncStatus } from "@app/lib/swr/poke";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type {
  ExtensionConfigurationType,
  WorkspaceDomain,
  WorkspaceType,
} from "@app/types";
import { asDisplayName } from "@app/types";

export function WorkspaceInfoTable({
  owner,
  workspaceVerifiedDomains,
  workspaceCreationDay,
  extensionConfig,
  workspaceRetention,
  workosEnvironmentId,
}: {
  owner: WorkspaceType;
  workspaceVerifiedDomains: WorkspaceDomain[];
  workspaceCreationDay: string;
  extensionConfig: ExtensionConfigurationType | null;
  workspaceRetention: number | null;
  workosEnvironmentId: string;
}) {
  const { dsyncStatus } = usePokeWorkOSDSyncStatus({ owner });

  const getStatusChipColor = (status: WorkOSConnectionSyncStatus["status"]) => {
    switch (status) {
      case "configured":
        return "green";
      case "configuring":
        return "warning";
      case "not_configured":
        return "primary";
      default:
        return "primary";
    }
  };

  const getConnectionStateChipColor = (state: string) => {
    switch (state) {
      case "active":
        return "green";
      case "inactive":
      case "deleting":
      case "invalid_credentials":
        return "rose";
      case "validating":
        return "warning";
      case "draft":
        return "blue";
      default:
        return "primary";
    }
  };
  return (
    <div className="flex justify-between gap-3">
      <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-md flex-grow pb-4 font-bold">Workspace info</h2>
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
              <PokeTableCell>WorkOS dashboard</PokeTableCell>
              <PokeTableCell>
                {owner.workOSOrganizationId && (
                  <Link
                    href={`https://dashboard.workos.com/${workosEnvironmentId}/organizations/${owner.workOSOrganizationId}`}
                    target="_blank"
                    className="text-xs text-highlight-400"
                  >
                    Organization
                  </Link>
                )}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Creation</PokeTableCell>
              <PokeTableCell>{workspaceCreationDay}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Conversations retention</PokeTableCell>
              <PokeTableCell>
                {workspaceRetention ? `${workspaceRetention} days` : "❌"}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>SSO Enforced</PokeTableCell>
              <PokeTableCell>{owner.ssoEnforced ? "✅" : "❌"}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Auto Join</PokeTableCell>
              <PokeTableCell>
                {workspaceVerifiedDomains.length > 0 &&
                workspaceVerifiedDomains.every((d) => d.domainAutoJoinEnabled)
                  ? "✅"
                  : workspaceVerifiedDomains.some(
                        (d) => d.domainAutoJoinEnabled
                      )
                    ? "⚠️"
                    : "❌"}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Verified Domains</PokeTableCell>
              <PokeTableCell className="max-w-sm break-words">
                {workspaceVerifiedDomains.map((d) => d.domain).join(", ")}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell className="max-w-48">
                Extension blacklisted domains/URLs
              </PokeTableCell>
              <PokeTableCell className="max-w-sm break-words">
                {extensionConfig?.blacklistedDomains.length
                  ? extensionConfig.blacklistedDomains.join(", ")
                  : "None"}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell className="max-w-48">
                WorkOS organization
              </PokeTableCell>
              <PokeTableCell>
                {owner.workOSOrganizationId ?? "None"}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Directory Sync</PokeTableCell>
              <PokeTableCell>
                <Chip
                  color={getStatusChipColor(
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    dsyncStatus?.status || "not_configured"
                  )}
                >
                  {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                  {asDisplayName(dsyncStatus?.status || "not_configured")}
                </Chip>
              </PokeTableCell>
            </PokeTableRow>
            {dsyncStatus?.connection && (
              <PokeTableRow>
                <PokeTableCell>Directory Sync State</PokeTableCell>
                <PokeTableCell>
                  <Chip
                    color={getConnectionStateChipColor(
                      dsyncStatus.connection.state
                    )}
                  >
                    {dsyncStatus.connection.state}
                  </Chip>
                </PokeTableCell>
              </PokeTableRow>
            )}
          </PokeTableBody>
        </PokeTable>
      </div>
    </div>
  );
}
