export function makeConsumptionWorkflowId({
  workspaceId,
  runKey,
}: {
  workspaceId: string;
  runKey: string;
}): string {
  return `credit-consumption-${workspaceId}-${runKey}`;
}
