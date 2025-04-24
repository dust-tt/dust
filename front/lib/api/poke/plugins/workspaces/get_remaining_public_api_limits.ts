import assert from "assert";

import { createPlugin } from "@app/lib/api/poke/types";
import {
  getRemainingCredits,
  resetCredits,
} from "@app/lib/api/public_api_limits";
import { getWorkspacePublicAPILimits } from "@app/lib/api/workspace";
import { Ok } from "@app/types";

export const getRemainingPublicAPILimitsPlugin = createPlugin({
  manifest: {
    id: "get-remaining-public-api-limits",
    name: "Get Remaining Public API Limits",
    description: "Get the remaining public API limits for a workspace.",
    resourceTypes: ["workspaces"],
    args: {
      reset: {
        type: "boolean",
        label: "Reset",
        description: "Reset the remaining public API limits.",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    // Only applicable if the workspace has public API limits enabled.
    const limits = getWorkspacePublicAPILimits(resource);
    if (!limits?.enabled) {
      return false;
    }

    return true;
  },

  execute: async (auth, _, args) => {
    const { reset } = args;

    const limits = getWorkspacePublicAPILimits(auth.getNonNullableWorkspace());
    assert(limits && limits.enabled, "Limits should be enabled");

    const remainingCredits =
      (await getRemainingCredits(auth.getNonNullableWorkspace())) ??
      limits.monthlyLimit;

    if (reset) {
      await resetCredits(auth.getNonNullableWorkspace());
    }

    return new Ok({
      display: "json",
      value: {
        remainingCredits,
        remainingCreditsPercentage:
          (remainingCredits / limits.monthlyLimit) * 100,
        reset: reset ? "reset" : undefined,
      },
    });
  },
});
