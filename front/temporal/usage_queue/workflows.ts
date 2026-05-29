import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/usage_queue/activities";
import { syncMetronomeSeatCountSignal } from "@app/temporal/usage_queue/signals";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

const METRONOME_SEAT_COUNT_DEBOUNCE_MS = 60 * 60 * 1000;

const { recordUsageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { trackProgrammaticUsageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

const { emitMetronomeUsageEventsActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "5 minutes",
  }
);

const { syncMauCountToMetronomeForAllWorkspacesActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minutes",
});

const { syncMetronomeSeatCountActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function updateWorkspaceUsageWorkflow(workspaceId: string) {
  // Sleep for one hour before computing usage.
  await sleep(60 * 60 * 1000);

  await recordUsageActivity(workspaceId);
}

export async function syncMetronomeSeatCountWorkflow(
  authType: AuthenticatorType
): Promise<void> {
  let pendingSync = true;

  setHandler(syncMetronomeSeatCountSignal, () => {
    pendingSync = true;
  });

  while (pendingSync) {
    await sleep(METRONOME_SEAT_COUNT_DEBOUNCE_MS);
    pendingSync = false;
    await syncMetronomeSeatCountActivity(authType);
  }
}

export async function trackProgrammaticUsageWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await trackProgrammaticUsageActivity(authType, {
    agentLoopArgs,
  });
}

export async function syncMauCountToMetronomeWorkflow(): Promise<void> {
  await syncMauCountToMetronomeForAllWorkspacesActivity();
}

export async function emitMetronomeUsageEventsWorkflow(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  await emitMetronomeUsageEventsActivity(authType, {
    agentLoopArgs,
  });
}
