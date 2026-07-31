import { resyncSpendLimitCountersFromEsUsage } from "@app/lib/api/credits/members_usage";
import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types/shared/result";

export const resyncSpendLimitCountersPlugin = createPlugin({
  manifest: {
    id: "resync-spend-limit-counters",
    name: "Resync Spend-Limit Counters from Usage",
    description:
      "Overwrite each member's Redis fixed-window per-user spend-cap counter " +
      "for the current cycle with their Elasticsearch-derived AWU consumption. " +
      "Use to backfill the counter after enabling the cap, or to repair drift " +
      "(the counter otherwise only accrues from live messages). Resyncs the " +
      "cycle the workspace is enforced on: the Metronome contract billing " +
      "period on credit-priced plans, the UTC calendar month elsewhere.",
    resourceTypes: ["workspaces"],
    args: {},
    requiredRoles: ["billing"],
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
