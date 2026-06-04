import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  hasContractSeatSubscription,
  syncSeatCount,
} from "@app/lib/metronome/seats";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Outcome of `syncMetronomeSeatCountForWorkspace`. `synced` means the
 * reconciliation ran; `skipped` means there was nothing to sync (not on
 * Metronome, no active contract, or no seat subscription) — with a
 * human-readable `reason`.
 */
export type SeatSyncOutcome =
  | { status: "synced" }
  | { status: "skipped"; reason: string };

/**
 * Resolve a workspace's active Metronome contract and reconcile its seat
 * subscriptions to the DB membership state — the same work the debounced
 * `syncMetronomeSeatCountActivity` performs, but callable directly (e.g. from
 * a poke plugin) to run the sync immediately, without the debounce.
 *
 * Lives in `lib/api/metronome` rather than `lib/metronome/seats` on purpose:
 * it depends on `SubscriptionResource`, and `subscription_resource` →
 * `metronome/contracts` → `metronome/seats` already forms a chain, so importing
 * the resource from `seats.ts` would close an import cycle. `lib/api/*` sits
 * above the resource layer, breaking it.
 *
 * Returns a domain `Result`: a Metronome failure from `syncSeatCount` is
 * propagated as `Err` rather than swallowed, so the caller can surface it.
 */
export async function syncMetronomeSeatCountForWorkspace({
  workspace,
}: {
  workspace: LightWorkspaceType;
}): Promise<Result<SeatSyncOutcome, Error>> {
  if (!workspace.metronomeCustomerId) {
    return new Ok({
      status: "skipped",
      reason: "workspace is not provisioned on Metronome",
    });
  }

  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription?.metronomeContractId) {
    return new Ok({
      status: "skipped",
      reason: "workspace has no Metronome contract on its active subscription",
    });
  }

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    return new Ok({
      status: "skipped",
      reason: "no active contract found for workspace",
    });
  }

  if (!(await hasContractSeatSubscription(contract))) {
    return new Ok({
      status: "skipped",
      reason: "active contract has no seat subscription",
    });
  }

  const result = await syncSeatCount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId: subscription.metronomeContractId,
    workspace,
    contract,
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  // Now that per-user seat credits are assigned, reconcile each seated user's
  // credit state from the live balances — this is what moves a freshly-created
  // or just-upgraded seat user into the correct seat↔pool state. Never throws;
  // a downstream reconcile issue must not fail (and retry) the seat sync.
  await reconcileWorkspaceUserCreditStates({
    workspace,
    metronomeCustomerId: workspace.metronomeCustomerId,
    metronomeContractId: subscription.metronomeContractId,
  });

  return new Ok({ status: "synced" });
}
