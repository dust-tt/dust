import type { ModelId } from "@connectors/types";

export function getIntercomSyncWorkflowId(connectorId: ModelId) {
  return `intercom-sync-${connectorId}`;
}
