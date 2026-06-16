import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { dispatchProgrammaticCapReset } from "@app/lib/api/metronome/credit_state_dispatcher";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  clearMetronomeProgrammaticCapAlerts,
  getMetronomeProgrammaticCap,
  upsertMetronomeProgrammaticCapAlerts,
} from "@app/lib/metronome/alerts/programmatic_cap";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const ProgrammaticMonthlyCapSchema = z
  .object({
    enabled: z.boolean(),
    monthlyCapAwu: z.number().min(1).max(10_000_000).optional(),
  })
  .refine(
    (data) =>
      !data.enabled ||
      (data.monthlyCapAwu !== undefined && data.monthlyCapAwu >= 1),
    { message: "monthlyCapAwu must be >= 1 when enabled" }
  );

export const manageProgrammaticMonthlyCapPlugin = createPlugin({
  manifest: {
    id: "manage-programmatic-monthly-cap",
    name: "Manage Programmatic Monthly Cap",
    description:
      "Set or remove the monthly spending cap for programmatic (API) usage.",
    resourceTypes: ["workspaces"],
    args: {
      enabled: {
        type: "boolean",
        label: "Enable monthly cap",
        description: "Toggle the programmatic monthly cap on or off.",
        async: true,
        asyncDescription: true,
      },
      monthlyCapAwu: {
        type: "number",
        label: "Monthly cap (AWU credits)",
        description: "Monthly spending cap in AWU credits.",
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

  populateAsyncArgs: async (_auth, workspace) => {
    if (!workspace) {
      return new Ok({
        enabled: false,
        enabledDescription: "No workspace found.",
        monthlyCapAwu: 0,
      });
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource?.metronomeCustomerId) {
      return new Ok({
        enabled: false,
        enabledDescription: "Workspace is not provisioned in Metronome.",
        monthlyCapAwu: 0,
      });
    }

    const capResult = await getMetronomeProgrammaticCap({
      metronomeCustomerId: workspaceResource.metronomeCustomerId,
      workspaceId: workspace.sId,
    });
    if (capResult.isErr()) {
      return new Err(capResult.error);
    }

    const capCredits = capResult.value;
    const currentState = workspaceResource.programmaticCreditState;

    if (capCredits === null) {
      return new Ok({
        enabled: false,
        enabledDescription: `No cap set. State: ${currentState}.`,
        monthlyCapAwu: 0,
      });
    }

    return new Ok({
      enabled: true,
      enabledDescription: `Current cap: ${capCredits} AWU. State: ${currentState}.`,
      monthlyCapAwu: capCredits,
    });
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
    const { enabled, monthlyCapAwu } = parsed.data;

    // Read previous cap for audit metadata (best-effort).
    const previousResult = await getMetronomeProgrammaticCap({
      metronomeCustomerId,
      workspaceId: workspace.sId,
    });
    const previousCapCredits = previousResult.isOk()
      ? previousResult.value
      : null;

    if (enabled && monthlyCapAwu) {
      const result = await upsertMetronomeProgrammaticCapAlerts({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        monthlyCapCredits: monthlyCapAwu,
      });
      if (result.isErr()) {
        return new Err(result.error);
      }

      // Reset the state machine — thresholds may have changed.
      await dispatchProgrammaticCapReset({ workspace: workspaceResource });

      void emitAuditLogEvent({
        auth,
        action: "workspace.programmatic_usage_limit_updated",
        targets: [buildAuditLogTarget("workspace", workspace)],
        metadata: {
          previous_monthly_cap_credits:
            previousCapCredits !== null ? String(previousCapCredits) : "unset",
          new_monthly_cap_credits: String(monthlyCapAwu),
        },
      });

      return new Ok({
        display: "text",
        value: `Programmatic monthly cap set to ${monthlyCapAwu} AWU for workspace "${workspace.name}".`,
      });
    }

    // Disable: clear alerts and reset state.
    const clearResult = await clearMetronomeProgrammaticCapAlerts({
      metronomeCustomerId,
      workspaceId: workspace.sId,
    });
    if (clearResult.isErr()) {
      return new Err(clearResult.error);
    }
    await dispatchProgrammaticCapReset({ workspace: workspaceResource });

    void emitAuditLogEvent({
      auth,
      action: "workspace.programmatic_usage_limit_updated",
      targets: [buildAuditLogTarget("workspace", workspace)],
      metadata: {
        previous_monthly_cap_credits:
          previousCapCredits !== null ? String(previousCapCredits) : "unset",
        new_monthly_cap_credits: "unset",
      },
    });

    return new Ok({
      display: "text",
      value: `Programmatic monthly cap removed for workspace "${workspace.name}".`,
    });
  },
});
