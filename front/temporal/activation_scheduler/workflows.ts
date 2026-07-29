import type * as activities from "@app/temporal/activation_scheduler/activities";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import { runActivationSignal } from "./signals";

const {
  enumerateEligiblePodsForNudgeActivity,
  reGateAndNudgePodActivity,
  ensureActivationWorkspaceSchedulesActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

/**
 * Workspace-level workflow: one per workspace, triggered by the workspace's
 * Temporal Schedule at the start of the regional workday, and restartable
 * on demand via `signalWithStart` against the same deterministic workflow id
 * (see client.ts) so poke/admin-forced cycles go through this same code path.
 *
 * Enumerates and gates every Activation Pod once, then visits each eligible
 * pod at its deterministic slot within the regional workday window,
 * re-gating right before sending since state (opt-out, credit, frequency cap)
 * can go stale between the morning enumeration and the pod's slot later in
 * the day.
 */
export async function activationWorkspaceWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  setHandler(runActivationSignal, () => {
    // Empty handler: signalWithStart only needs this to (re)start the
    // workflow when it isn't already running for this workspace.
  });

  const pods = await enumerateEligiblePodsForNudgeActivity({ workspaceId });

  for (const pod of pods) {
    const sleepMs = pod.slotAtMs - Date.now();
    if (sleepMs > 0) {
      await sleep(sleepMs);
    }

    await reGateAndNudgePodActivity({
      workspaceId,
      podId: pod.podId,
      targetUserId: pod.targetUserId,
    });
  }
}

/**
 * Cron workflow that ensures every workspace with a live Activation Pod has a
 * running schedule, and stops schedules for workspaces whose pods have all
 * gone terminal (archived).
 */
export async function ensureActivationWorkspaceSchedulesWorkflow(): Promise<void> {
  await ensureActivationWorkspaceSchedulesActivity();
}
