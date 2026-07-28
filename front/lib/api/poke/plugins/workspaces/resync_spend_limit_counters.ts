import { resyncSpendLimitCountersFromEsUsage } from "@app/lib/api/credits/members_usage";
import { createPlugin } from "@app/lib/api/poke/types";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";

export const resyncSpendLimitCountersPlugin = createPlugin({
  manifest: {
    id: "resync-spend-limit-counters",
    name: "Resync Spend-Limit Counters from Usage",
    description:
      "Overwrite each member's Redis fixed-window per-user spend-cap counter " +
      "for the current billing cycle with their Elasticsearch-derived AWU " +
      "consumption. Use to backfill the counter after enabling the cap, or to " +
      "repair drift (the counter otherwise only accrues from live messages).",
    resourceTypes: ["workspaces"],
    args: {},
    requiredRoles: ["billing"],
  },

  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },

  execute: async (auth, _resource, _args) => {
    const result = await resyncSpendLimitCountersFromEsUsage(auth);
    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }
    return new Ok({
      display: "text",
      value: `Resynced spend-limit counters for ${result.value.updatedUserCount} user(s) from usage.`,
    });
  },
});
