export function makeBulkSeatChangeWorkflowId({
  workspaceId,
  token,
}: {
  workspaceId: string;
  token: string;
}): string {
  return `bulk-seat-change-${workspaceId}-${token}`;
}
