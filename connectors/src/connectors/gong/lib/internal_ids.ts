import type { ConnectorResource } from "@connectors/resources/connector_resource";

export function makeGongTranscriptFolderInternalId(
  connector: ConnectorResource
) {
  return `gong-transcript-folder-${connector.id}`;
}

export function makeGongTranscriptInternalId(
  connector: ConnectorResource,
  callId: string
) {
  return `gong-transcript-${connector.id}-${callId}`;
}

export function makeGongSyncTranscriptsWorkflowIdFromParentId(
  workflowId: string
): string | undefined {
  return `${workflowId}-transcripts`;
}

export function makeGongGarbageCollectionWorkflowIdFromParentId(
  workflowId: string
): string {
  return `${workflowId}-garbage-collection`;
}
