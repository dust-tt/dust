import {
  resyncApiKeySpendLimitCountersFromEsUsage,
  resyncProgrammaticSpendLimitCounterFromEsUsage,
  resyncSpendLimitCountersFromEsUsage,
} from "@app/lib/api/credits/members_usage";
import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types/shared/result";

export const resyncSpendLimitCountersPlugin = createPlugin({
  manifest: {
    id: "resync-spend-limit-counters",
    name: "Resync Spend-Limit Counters from Usage",
    description:
      "Overwrite the Redis fixed-window spend-cap counters (each member's " +
      "per-user counter, each capped API key's per-key counter, and the " +
      "workspace programmatic counter) for the current cycle with their " +
      "Elasticsearch-derived AWU consumption. Use to backfill the counters " +
      "after enabling the cap, or to repair drift (they otherwise only accrue " +
      "from live messages). Resyncs the cycle the workspace is enforced on: " +
      "the Metronome contract billing period on credit-priced plans, the UTC " +
      "calendar month elsewhere.",
    resourceTypes: ["workspaces"],
    args: {},
    requiredRoles: ["billing"],
  },

  execute: async (auth, _resource, _args) => {
    const userResult = await resyncSpendLimitCountersFromEsUsage(auth);
    if (userResult.isErr()) {
      return new Err(new Error(userResult.error.message));
    }

    const apiKeyResult = await resyncApiKeySpendLimitCountersFromEsUsage(auth);
    if (apiKeyResult.isErr()) {
      return new Err(new Error(apiKeyResult.error.message));
    }

    const programmaticResult =
      await resyncProgrammaticSpendLimitCounterFromEsUsage(auth);
    if (programmaticResult.isErr()) {
      return new Err(new Error(programmaticResult.error.message));
    }

    return new Ok({
      display: "text",
      value:
        `Resynced spend-limit counters from usage for ` +
        `${userResult.value.updatedUserCount} user(s), ` +
        `${apiKeyResult.value.updatedKeyCount} API key(s), and the ` +
        `workspace programmatic counter ` +
        `(${programmaticResult.value.programmaticCounterSeeded ? "seeded" : "no positive cap"}).`,
    });
  },
});
