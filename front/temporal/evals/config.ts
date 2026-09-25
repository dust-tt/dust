export const QUEUE_NAME = "evals-v1";
export function evalWorkflowId(workspaceId: string, runId: string): string {
  return `eval-${workspaceId}-${runId}`;
}
