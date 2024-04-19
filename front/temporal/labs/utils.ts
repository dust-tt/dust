import type { LabsTranscriptsProviderType, ModelId } from "@dust-tt/types";

export function makeRetrieveTranscriptWorkflowId({
  providerId,
  userId,
}: {
  providerId: LabsTranscriptsProviderType;
  userId: ModelId;
}): string {
  return `labs-transcripts-retrieve-${userId}-${providerId}`;
}

export function makeProcessTranscriptWorkflowId({
  fileId,
  userId,
}: {
  fileId: string;
  userId: ModelId;
}): string {
  return `labs-transcripts-process-${userId}-${fileId}`;
}
