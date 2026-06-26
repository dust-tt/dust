import { backfillApiKeyCreditCapsForWorkspace } from "@app/lib/api/keys/spend_limit";
import { createPlugin } from "@app/lib/api/poke/types";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";

export const syncApiKeyCapAlertsPlugin = createPlugin({
  manifest: {
    id: "sync-api-key-cap-alerts",
    name: "Sync API Key Credit Cap Alerts",
    description:
      "Backfill per-API-key credit caps: convert any legacy USD cap to credits, " +
      "(re)create the Metronome per-key cap alerts, and reconcile each key's " +
      "credit state. Use when a workspace adopts credit pricing or to repair " +
      "missing alerts.",
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
    const plan = auth.plan();
    if (!plan) {
      return new Err(new Error("Workspace has no plan."));
    }
    const metronomeContractId =
      auth.subscription()?.metronomeContractId ?? null;

    const { converted } = await backfillApiKeyCreditCapsForWorkspace(
      workspace,
      {
        metronomeContractId,
        planCode: plan.code,
      }
    );

    return new Ok({
      display: "text",
      value:
        `API key credit cap alerts synced. ` +
        `Converted ${converted} legacy USD cap(s) to credits.`,
    });
  },
});
