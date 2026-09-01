import { createPlugin } from "@app/lib/api/poke/types";
import { launchMetronomeSeatCountSyncWorkflow } from "@app/temporal/usage_queue/client";
import { makeMetronomeSeatCountSyncWorkflowId } from "@app/temporal/usage_queue/helpers";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";

export const syncMetronomeSeatsPlugin = createPlugin({
  manifest: {
    id: "sync-metronome-seats",
    name: "Sync Metronome Seat Count",
    description:
      "Schedule a reconcile of this workspace's Metronome seat subscriptions to " +
      "the current membership state. Runs through the debounced Temporal workflow " +
      "(the single serialized reconcile path per workspace, ~15 s) so it can never " +
      "run in parallel with an automatic sync. Use to repair a drifted " +
      "seat/unassigned count.",
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

    // Route through the debounced workflow rather than reconciling inline: the
    // full workspace reconcile must run only on the single serialized per-
    // workspace path. Two full reconciles in parallel stack open-ended
    // unassigned-seat edits (the seat-sync rate-limit incident).
    const result = await launchMetronomeSeatCountSyncWorkflow({
      workspaceId: workspace.sId,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }

    const workflowId = makeMetronomeSeatCountSyncWorkflowId({
      workspaceId: workspace.sId,
    });
    return new Ok({
      display: "text",
      value:
        "Metronome seat count sync scheduled — it will run through the debounced " +
        `workflow within ~15 seconds.\n\nWorkflow id: ${workflowId}\n\n` +
        "Check the [SeatSync]/[Metronome] logs (or the Temporal UI for that " +
        "workflow id) for the outcome.",
    });
  },
});
