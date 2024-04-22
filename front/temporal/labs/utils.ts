import type { ModelId } from "@dust-tt/types";

import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";

export function makeRetrieveTranscriptWorkflowId(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): string {
  const { provider, userId, workspaceId } = transcriptsConfiguration;

  return `labs-transcripts-retrieve-u${userId}-w${workspaceId}-${provider}`;
}

export function makeProcessTranscriptWorkflowId({
  transcriptsConfigurationId,
  fileId,
}: {
  transcriptsConfigurationId: ModelId;
  fileId: string;
}): string {
  return `labs-transcripts-process-${transcriptsConfigurationId}-${fileId}`;
}
