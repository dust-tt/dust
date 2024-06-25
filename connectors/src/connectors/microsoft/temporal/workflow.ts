import type { ModelId } from "@dust-tt/types";

export async function microsoftFullSync() {}

export function microsoftFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-${connectorId}`;
}
