export function makeSandboxFunctionToolWorkflowId({
  workspaceId,
  actionModelId,
}: {
  workspaceId: string;
  actionModelId: number;
}) {
  return `sandbox-function-tool-workflow-${workspaceId}-${actionModelId}`;
}

export function makeSandboxFunctionInvocationWorkflowId({
  workspaceId,
  invocationId,
}: {
  workspaceId: string;
  invocationId: string;
}) {
  return `sandbox-function-invocation-workflow-${workspaceId}-${invocationId}`;
}
