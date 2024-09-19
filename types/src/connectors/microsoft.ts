import { ModelId } from "../shared/model_id";

export function microsoftIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-incrementalSync-${connectorId}`;
}

export function getMicrosoftSheetContentNodeInternalIdFromTableId(
  tableId: string
): string {
  return tableId;
}

export function microsoftGarbageCollectionWorkflowId(connectorId: ModelId) {
  return `microsoft-garbageCollection-${connectorId}`;
}
