import type { ModelId } from "@dust-tt/types";

export async function microsoftTeamsFullSync() {}

export function microsoftTeamsFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-teams-fullSync-${connectorId}`;
}
