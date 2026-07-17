import { runActivationForWorkspace } from "@app/lib/api/activation/orchestrator";

/**
 * Runs the activation orchestration for a workspace: skips already-activated pod
 * members and re-fires the activation trigger
 * for every pod that still has an eligible member, nudging them back into the
 * pod's activation conversation.
 */
export async function runActivationForWorkspaceActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const result = await runActivationForWorkspace({
    workspaceId,
    dryRun: false,
  });
  if (result.isErr()) {
    throw result.error;
  }
}
