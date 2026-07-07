import {
  getProgrammaticUsageLimit,
  syncProgrammaticUsageLimit,
} from "@app/lib/api/credits/programmatic_usage_limit";
import { dispatchProgrammaticCapReset } from "@app/lib/api/metronome/credit_state_dispatcher";
import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const ProgrammaticMonthlyCapSchema = z.object({
  monthlyCapAwu: z.number().int().min(0).max(10_000_000),
});

export const manageProgrammaticMonthlyCapPlugin = createPlugin({
  manifest: {
    id: "manage-programmatic-monthly-cap",
    name: "Manage Programmatic Monthly Cap",
    description:
      "Set the monthly spending cap for programmatic (API) usage. Set to 0 " +
      "to block all programmatic access.",
    resourceTypes: ["workspaces"],
    args: {
      monthlyCapAwu: {
        type: "number",
        label: "Monthly cap (AWU credits)",
        description:
          "Monthly spending cap in AWU credits. Set to 0 to block all " +
          "programmatic access.",
        async: true,
      },
    },
    requiredRoles: ["billing"],
  },

  // Programmatic cap alerts are AWU-credit based: only meaningful on
  // credit-priced (new-pricing) plans. Legacy programmatic usage is billed in
  // USD via Stripe PAYG and must never create Metronome alerts.
  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },

  populateAsyncArgs: async (auth, workspace) => {
    if (!workspace) {
      return new Ok({ monthlyCapAwu: 0 });
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource?.metronomeCustomerId) {
      return new Ok({ monthlyCapAwu: 0 });
    }

    const capResult = await getProgrammaticUsageLimit(auth);
    if (capResult.isErr()) {
      return new Err(capResult.error);
    }

    return new Ok({ monthlyCapAwu: capResult.value });
  },

  execute: async (auth, workspace, rawArgs) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const plan = auth.plan();
    if (!plan || !isCreditPricedPlan(plan)) {
      return new Err(
        new Error(
          "Programmatic monthly cap only applies to credit-priced plans. " +
            "Legacy programmatic usage is billed in USD via Stripe PAYG."
        )
      );
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    const metronomeCustomerId = workspaceResource.metronomeCustomerId;
    if (!metronomeCustomerId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" is not provisioned in Metronome.`
        )
      );
    }

    const parsed = ProgrammaticMonthlyCapSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return new Err(new Error(parsed.error.message));
    }
    const { monthlyCapAwu } = parsed.data;

    // `syncProgrammaticUsageLimit` persists the cap (DB source of truth),
    // derives the Metronome alerts, and emits the audit event with the
    // operator as actor. A cap of 0 blocks all programmatic access.
    const syncResult = await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits: monthlyCapAwu,
    });
    if (syncResult.isErr()) {
      return new Err(syncResult.error);
    }

    // Reset the state machine — thresholds may have changed.
    await dispatchProgrammaticCapReset({ workspace: workspaceResource });

    return new Ok({
      display: "text",
      value:
        monthlyCapAwu > 0
          ? `Programmatic monthly cap set to ${monthlyCapAwu} AWU for workspace "${workspace.name}".`
          : `Programmatic access blocked (cap set to 0) for workspace "${workspace.name}".`,
    });
  },
});
