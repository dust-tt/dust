export function makeGenerateFrameOgImageWorkflowId({
  workspaceId,
  frameId,
}: {
  workspaceId: string;
  frameId: string;
}): string {
  return `frame-og-${workspaceId}-${frameId}`;
}
