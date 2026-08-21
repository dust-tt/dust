import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/usage_queue/activities";
import {
  reconcileApiKeyCreditStateSignal,
  syncMetronomeSeatCountSignal,
} from "@app/temporal/usage_queue/signals";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  condition,
  patched,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

const METRONOME_SEAT_COUNT_DEBOUNCE_MS = 15 * 1000;

// Debounce the per-API-key reconcile after usage is emitted: gives Metronome
// time to ingest the just-emitted events, and coalesces bursts of messages on
// the same key into a single reconcile.
const API_KEY_CREDIT_STATE_RECONCILE_DEBOUNCE_MS = 15 * 1000;

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

const { syncMetronomeSeatCountActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
});

const { reconcileApiKeyCreditStateActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

export async function updateWorkspaceUsageWorkflow(workspaceId: string) {
  // Sleep for one hour before computing usage.
  await sleep(60 * 60 * 1000);

  await recordUsageActivity(workspaceId);
}

export async function syncMetronomeSeatCountWorkflow(
  workspaceId: string,
  { immediate = false }: { immediate?: boolean } = {}
): Promise<void> {
  let pendingSync = true;
  // Skips the debounce for the next run. Set at start (fresh workflow) or by an
  // immediate signal — e.g. a just-provisioned workspace that needs its seat
  // assigned now rather than after the debounce window.
  let runImmediately = immediate;

  setHandler(syncMetronomeSeatCountSignal, (signalArgs) => {
    pendingSync = true;
    if (signalArgs?.immediate) {
      runImmediately = true;
    }
  });

  while (pendingSync) {
    pendingSync = false;
    // patched: workflows started before this change replay the plain `sleep` so
    // they stay deterministic; new ones use an interruptible `condition` so an
    // `immediate` signal can skip the debounce window. Safe to remove the patch
    // (→ `deprecatePatch` → delete) a few days after deploy — these workflows
    // are short-lived, so no pre-change instance survives that long.
    if (patched("seat-count-immediate-debounce")) {
      if (!runImmediately) {
        // Debounce, but wake early if an immediate sync is requested mid-wait
        // (coalesces bursts; an immediate trigger interrupts the window).
        await condition(() => runImmediately, METRONOME_SEAT_COUNT_DEBOUNCE_MS);
      }
      runImmediately = false;
    } else {
      await sleep(METRONOME_SEAT_COUNT_DEBOUNCE_MS);
    }
    await syncMetronomeSeatCountActivity(workspaceId);
  }
}

export async function reconcileApiKeyCreditStateWorkflow(
  workspaceId: string,
  keyId: number
): Promise<void> {
  let pendingReconcile = true;

  setHandler(reconcileApiKeyCreditStateSignal, () => {
    pendingReconcile = true;
  });

  while (pendingReconcile) {
    await sleep(API_KEY_CREDIT_STATE_RECONCILE_DEBOUNCE_MS);
    pendingReconcile = false;
    await reconcileApiKeyCreditStateActivity(workspaceId, keyId);
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
