import type { ModelId } from "@app/types";

export function getNotionWorkflowId(
  connectorId: ModelId,
  isGarbageCollectionRun: boolean
) {
  let wfName = `workflow-notion-${connectorId}`;
  if (isGarbageCollectionRun) {
    wfName += "-garbage-collector";
  }
  return wfName;
}

export function getIntercomSyncWorkflowId(connectorId: ModelId) {
  return `intercom-sync-${connectorId}`;
}

export function getZendeskSyncWorkflowId(connectorId: ModelId): string {
  return `zendesk-sync-${connectorId}`;
}

export function getZendeskGarbageCollectionWorkflowId(
  connectorId: ModelId
): string {
  return `zendesk-gc-${connectorId}`;
}

export function googleDriveIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-IncrementalSync-${connectorId}`;
}

export function makeConfluenceSyncWorkflowId(connectorId: ModelId) {
  return `confluence-sync-${connectorId}`;
}

export function microsoftIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-incrementalSync-${connectorId}`;
}

export function microsoftGarbageCollectionWorkflowId(connectorId: ModelId) {
  return `microsoft-garbageCollection-${connectorId}`;
}
