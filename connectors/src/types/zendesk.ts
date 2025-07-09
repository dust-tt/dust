import type { ModelId } from "@connectors/types";

export function getZendeskSyncWorkflowId(connectorId: ModelId): string {
  return `zendesk-sync-${connectorId}`;
}

export function getZendeskGarbageCollectionWorkflowId(
  connectorId: ModelId
): string {
  return `zendesk-gc-${connectorId}`;
}
