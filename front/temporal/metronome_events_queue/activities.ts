import { processMetronomeWebhook } from "@app/lib/api/metronome/process_webhook";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

/**
 * Temporal wrapper around `processMetronomeWebhook`. The handler has already
 * verified the workspace exists, but we re-fetch it here by sId so the
 * activity owns its workspace handle (Temporal args must be serializable, and
 * the workspace may have been mutated between handler and activity). Throws
 * on Result.Err so Temporal's retry policy can drive convergence — transient
 * failures (Metronome timeouts, DB hiccups, downstream API errors) retry
 * automatically with exponential backoff; permanent failures eventually mark
 * the workflow failed and let the next Metronome redelivery start a fresh one.
 */
export async function processMetronomeWebhookActivity({
  event,
  workspaceId,
}: {
  event: MetronomeWebhookEvent;
  workspaceId: string;
}): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(
      `[Metronome Events] Workspace ${workspaceId} not found at activity start`
    );
  }
  const result = await processMetronomeWebhook({ event, workspace });
  if (result.isErr()) {
    throw result.error;
  }
}
