import { dispatchProgrammaticCapReset } from "@app/lib/api/metronome/credit_state_dispatcher";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  clearMetronomeProgrammaticCapAlerts,
  getMetronomeProgrammaticCap,
  upsertMetronomeProgrammaticCapAlerts,
} from "@app/lib/metronome/alerts/programmatic_cap";
import {
  METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD,
  MICRO_USD_PER_DOLLAR,
} from "@app/lib/metronome/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

function creditsToDollars(credits: number): number {
  return (
    (credits * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD) /
    MICRO_USD_PER_DOLLAR
  );
}

function dollarsToCredits(dollars: number): number {
  return (
    (dollars * MICRO_USD_PER_DOLLAR) /
    METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD
  );
}

const ProgrammaticMonthlyCapSchema = z
  .object({
    enabled: z.boolean(),
    monthlyCapDollars: z.number().min(1).max(100_000).optional(),
  })
  .refine(
    (data) =>
      !data.enabled ||
      (data.monthlyCapDollars !== undefined && data.monthlyCapDollars >= 1),
    { message: "monthlyCapDollars must be >= $1 when enabled" }
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
      monthlyCapDollars: {
        type: "number",
        label: "Monthly cap ($)",
        description: "Monthly spending cap in dollars (1-100,000).",
        async: true,
      },
    },
  },

  populateAsyncArgs: async (_auth, workspace) => {
    if (!workspace) {
      return new Ok({
        enabled: false,
        enabledDescription: "No workspace found.",
        monthlyCapDollars: 0,
      });
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource?.metronomeCustomerId) {
      return new Ok({
        enabled: false,
        enabledDescription: "Workspace is not provisioned in Metronome.",
        monthlyCapDollars: 0,
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
        monthlyCapDollars: 0,
      });
    }

    const capDollars = creditsToDollars(capCredits);
    return new Ok({
      enabled: true,
      enabledDescription: `Current cap: $${capDollars} (${capCredits} credits). State: ${currentState}.`,
      monthlyCapDollars: capDollars,
    });
  },

  execute: async (_auth, workspace, rawArgs) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
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
    const { enabled, monthlyCapDollars } = parsed.data;

    if (enabled && monthlyCapDollars) {
      const monthlyCapCredits = dollarsToCredits(monthlyCapDollars);

      const result = await upsertMetronomeProgrammaticCapAlerts({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        monthlyCapCredits,
      });
      if (result.isErr()) {
        return new Err(result.error);
      }

      // Reset the state machine — thresholds may have changed.
      await dispatchProgrammaticCapReset({ workspace: workspaceResource });

      return new Ok({
        display: "text",
        value: `Programmatic monthly cap set to $${monthlyCapDollars} for workspace "${workspace.name}".`,
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

    return new Ok({
      display: "text",
      value: `Programmatic monthly cap removed for workspace "${workspace.name}".`,
    });
  },
});
