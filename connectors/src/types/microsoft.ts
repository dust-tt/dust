import type { ModelId } from "@connectors/types";

export function microsoftIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-incrementalSync-${connectorId}`;
}

export function microsoftGarbageCollectionWorkflowId(connectorId: ModelId) {
  return `microsoft-garbageCollection-${connectorId}`;
}
