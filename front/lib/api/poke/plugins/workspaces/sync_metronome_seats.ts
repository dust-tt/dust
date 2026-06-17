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
    const result = await syncMetronomeSeatCountForWorkspace({ workspace });
    if (result.isErr()) {
      return new Err(result.error);
    }

    const outcome = result.value;
    switch (outcome.status) {
      case "synced":
        return new Ok({
          display: "text",
          value: "Metronome seat count synced.",
        });
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
