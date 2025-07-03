import { Chip } from "@dust-tt/sparkle";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { useWorkOSDSyncStatus } from "@app/lib/swr/workos";
import type { WorkspaceType } from "@app/types";

interface DirectorySyncStatusProps {
  owner: WorkspaceType;
}

export function DirectorySyncStatus({ owner }: DirectorySyncStatusProps) {
  const { dsyncStatus, isLoading, error } = useWorkOSDSyncStatus({ owner });

  const getStatusChipColor = (status: string) => {
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
    <div className="border-material-200 flex flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Directory Sync Status</h2>
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-sm text-red-500">Error loading status</div>
      ) : (
        <PokeTable>
          <PokeTableBody>
            <PokeTableRow>
              <PokeTableCell>Status</PokeTableCell>
              <PokeTableCell>
                <Chip color={getStatusChipColor(dsyncStatus?.status || "not_configured")}>
                  {dsyncStatus?.status || "not_configured"}
                </Chip>
              </PokeTableCell>
            </PokeTableRow>
            {dsyncStatus?.connection && (
              <>
                <PokeTableRow>
                  <PokeTableCell>Connection State</PokeTableCell>
                  <PokeTableCell>
                    <Chip color={getConnectionStateChipColor(dsyncStatus.connection.state)}>
                      {dsyncStatus.connection.state}
                    </Chip>
                  </PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Connection Type</PokeTableCell>
                  <PokeTableCell>{dsyncStatus.connection.type}</PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Connection ID</PokeTableCell>
                  <PokeTableCell className="font-mono text-xs">
                    {dsyncStatus.connection.id}
                  </PokeTableCell>
                </PokeTableRow>
              </>
            )}
          </PokeTableBody>
        </PokeTable>
      )}
    </div>
  );
}