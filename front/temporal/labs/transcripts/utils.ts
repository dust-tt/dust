import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";

export function makeRetrieveTranscriptWorkflowId(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): string {
  return `labs-transcripts-retrieve-${transcriptsConfiguration.workspaceId}-${transcriptsConfiguration.id}`;
}

export function makeProcessTranscriptWorkflowId({
  workspaceId,
  transcriptsConfigurationId,
  fileId,
}: {
  workspaceId: string;
  transcriptsConfigurationId: string;
  fileId: string;
}): string {
  return `labs-transcripts-process-${workspaceId}-${transcriptsConfigurationId}-${fileId}`;
}
