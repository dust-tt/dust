import type { ModelId } from "@app/types";

export function getNotionWorkflowId(
  connectorId: ModelId,
  workflowType: "sync" | "garbage-collector" | "process-database-upsert-queue"
) {
  let wfName = `workflow-notion-${connectorId}`;
  if (workflowType === "garbage-collector") {
    wfName += "-garbage-collector";
  } else if (workflowType === "process-database-upsert-queue") {
    wfName += "-process-database-upsert-queue";
  }
  return wfName;
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

export function makeGongSyncScheduleId(connectorId: ModelId): string {
  return `gong-sync-${connectorId}`;
}

export function makeIntercomHelpCenterScheduleId(connectorId: ModelId): string {
  return `intercom-help-center-sync-${connectorId}`;
}

export function makeIntercomConversationScheduleId(
  connectorId: ModelId
): string {
  return `intercom-conversation-sync-${connectorId}`;
}
