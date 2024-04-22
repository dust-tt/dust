import type { ModelId } from "@dust-tt/types";

import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";

export function makeRetrieveTranscriptWorkflowId(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): string {
  return `labs-transcripts-retrieve-${transcriptsConfiguration.id}`;
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
