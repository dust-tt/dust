import type { ModelId } from "@dust-tt/types";

export async function microsoftSharepointFullSync() {}

export function microsoftSharepointFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-sharepoint-fullSync-${connectorId}`;
}
