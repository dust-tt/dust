import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/usage_queue/activities";
import {
  reconcileApiKeyCreditStateSignal,
  syncMetronomeSeatCountSignal,
} from "@app/temporal/usage_queue/signals";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

const METRONOME_SEAT_COUNT_DEBOUNCE_MS = 15 * 1000;

// Debounce the per-API-key reconcile after usage is emitted: gives Metronome
// time to ingest the just-emitted events, and coalesces bursts of messages on
// the same key into a single reconcile.
const API_KEY_CREDIT_STATE_RECONCILE_DEBOUNCE_MS = 15 * 1000;

const { recordUsageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

// Retries are safe: the mutation phase (credit consumption, redis counters) is
// guarded by a per-execution idempotency marker (see trackProgrammaticCost), so
// a retry after a partial failure or a timed-out zombie attempt never consumes
// the same runs twice. Retries mostly cover transient DB pool exhaustion.
// scheduleToCloseTimeout bounds the whole retry lifetime well under the
// marker's 24h TTL, so a stale retry can never run after the marker expired.
const { trackProgrammaticUsageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  scheduleToCloseTimeout: "1 hour",
  retry: {
    initialInterval: "10s",
    backoffCoefficient: 2,
    maximumInterval: "2 minutes",
    maximumAttempts: 5,
  },
});

const { emitMetronomeUsageEventsActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "5 minutes",
  }
);

// A failing seat sync (e.g. a Metronome edit that can't converge) must not
// retry forever: without a cap it inherits Temporal's default policy (unlimited
// attempts), and since every attempt re-runs the full sync — re-issuing the
// same Metronome contract edits — an unconvergeable sync becomes a multi-day
// edit storm that saturates Metronome's rate limit (incident: ~300 edits over
// 25h on a single workspace). Bound both the attempts and the total lifetime so
// a stuck sync fails loudly instead of hammering Metronome; the next real
// membership change re-triggers a fresh run anyway.
const { syncMetronomeSeatCountActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "30s",
    backoffCoefficient: 2,
    maximumInterval: "5 minutes",
    maximumAttempts: 5,
  },
  scheduleToCloseTimeout: "1 hour",
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
  workspaceId: string
): Promise<void> {
  let pendingSync = true;

  setHandler(syncMetronomeSeatCountSignal, () => {
    pendingSync = true;
  });

  while (pendingSync) {
    await sleep(METRONOME_SEAT_COUNT_DEBOUNCE_MS);
    pendingSync = false;
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
