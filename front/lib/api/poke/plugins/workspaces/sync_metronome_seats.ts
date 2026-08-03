import { syncMetronomeSeatCountForWorkspace } from "@app/lib/api/metronome/seat_sync";
import { createPlugin } from "@app/lib/api/poke/types";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const syncMetronomeSeatsPlugin = createPlugin({
  manifest: {
    id: "sync-metronome-seats",
    name: "Sync Metronome Seat Count",
    description:
      "Reconcile this workspace's Metronome seat subscriptions to the current " +
      "membership state right now, bypassing the debounce. Use to apply a seat " +
      "change immediately or to repair a drifted seat/unassigned count.",
    resourceTypes: ["workspaces"],
    args: {},
    requiredRoles: ["billing"],
  },

  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },

  execute: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();

    // `syncMetronomeSeatCountForWorkspace` returns a domain `Result`: a
    // Metronome failure is returned as `Err`, not thrown, so we propagate it
    // straight to the operator instead of swallowing it.
    //
    // `forceFreeCreditRevokeCheck: true` here (unlike the automatic/debounced
    // sync) because an operator running this manually is asking for a
    // thorough pass, not the fast path optimized for frequent, automatic runs.
    const result = await syncMetronomeSeatCountForWorkspace({
      workspace,
      forceFreeCreditRevokeCheck: true,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }

    const outcome = result.value;
    switch (outcome.status) {
      case "synced": {
        const lines = ["Metronome seat count synced."];
        if (outcome.stagedPendingContract) {
          lines.push(
            "- A pending future contract was also staged (mid contract-switch migration)."
          );
        }
        const s = outcome.activeContractSummary;
        if (s) {
          lines.push(
            `- Active contract: ${s.seatSubscriptionCount} seat subscription(s), ` +
              `${s.distinctTimestampCount} distinct scheduled moment(s) → ` +
              `${s.reconcileSegmentCallCount} segment reconcile call(s), ` +
              `${s.transferCount} pro/max transfer(s), ` +
              `${s.freeUserCount} free-seat user(s), ` +
              `${s.didMutateSeatData ? "changes applied" : "no changes needed"}, ` +
              `${s.durationMs}ms.`
          );
        } else {
          lines.push("- No active contract to sync (pending contract only).");
        }
        lines.push(
          outcome.workspaceUserCreditStatesReconciled
            ? "- Workspace-wide credit states reconciled."
            : "- Credit-state reconcile skipped (single-user scope)."
        );
        return new Ok({
          display: "text",
          value: lines.join("\n"),
        });
      }
      case "skipped":
        return new Ok({
          display: "text",
          value: `Nothing to sync: ${outcome.reason}.`,
        });
      default:
        return assertNever(outcome);
    }
  },
});
