export function makeBulkSpendLimitWorkflowId({
  workspaceId,
  token,
}: {
  workspaceId: string;
  token: string;
}): string {
  return `bulk-spend-limit-${workspaceId}-${token}`;
}
