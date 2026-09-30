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
