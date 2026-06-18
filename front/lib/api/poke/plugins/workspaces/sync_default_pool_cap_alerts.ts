import { createPlugin } from "@app/lib/api/poke/types";
import { syncDefaultPoolCapAlertsForWorkspace } from "@app/lib/api/workspace/default_user_spend_limit";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";

export const syncDefaultPoolCapAlertsPlugin = createPlugin({
  manifest: {
    id: "sync-default-pool-cap-alerts",
    name: "Sync Default Pool Cap Alerts",
    description:
      "Create or update Metronome per-seat-type cap and warning alerts from " +
      "the workspace's current default pool credit limit (0 when not configured). " +
      "Use after contract changes or to repair missing alerts.",
    resourceTypes: ["workspaces"],
    args: {},
    requiredRoles: ["billing"],
  },

  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },

  execute: async (auth, _resource, _args) => {
    const workspace = auth.getNonNullableWorkspace();
    const result = await syncDefaultPoolCapAlertsForWorkspace(workspace);
    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }
    return new Ok({
      display: "text",
      value: "Default pool cap alerts synced.",
    });
  },
});
