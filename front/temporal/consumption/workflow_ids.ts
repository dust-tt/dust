export function makeConsumptionWorkflowId({
  workspaceId,
  runKey,
}: {
  workspaceId: string;
  runKey: string;
}): string {
  return `consumption-${workspaceId}-${runKey}`;
}
