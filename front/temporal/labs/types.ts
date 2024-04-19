import type { LabsTranscriptsProviderType, ModelId } from "@dust-tt/types";

export function makeRetrieveTranscriptWorkflowId({
  providerId,
  workspaceId,
  userId,
}: {
  providerId: LabsTranscriptsProviderType;
  workspaceId: ModelId;
  userId: ModelId;
}): string {
  return `labs-transcripts-retrieve-u${userId}-w${workspaceId}-${providerId}`;
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
