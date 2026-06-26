import { handleFreeCreditSegmentGrant } from "@app/lib/api/metronome/process_webhook";
import { createPlugin } from "@app/lib/api/poke/types";
import { getMetronomeCredit } from "@app/lib/metronome/client";
import { isMetronomeFreeCredit } from "@app/lib/metronome/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const TriggerFreeGrantArgsSchema = z.object({
  metronomeCreditId: z.string().min(1, "Metronome credit ID is required"),
});

export const triggerFreeCreditSegmentGrantPlugin = createPlugin({
  manifest: {
    id: "trigger-free-credit-segment-grant",
    name: "Trigger Free Monthly Credit Grant",
    description:
      "Manually simulate a credit.segment.start event for a specific Metronome free credit. " +
      "Use when the webhook was not received and the DB credit is missing. " +
      "Finds the currently active segment on the credit, recalculates the amount, " +
      "updates Metronome, and creates the matching DB credit. Idempotent.",
    resourceTypes: ["workspaces"],
    args: {
      metronomeCreditId: {
        type: "string",
        variant: "text",
        label: "Metronome Credit ID",
        description:
          "The Metronome credit ID of the free monthly credit to grant.",
      },
    },
    requiredRoles: ["billing"],
  },
  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && !isCreditPricedPlan(plan);
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const parseResult = TriggerFreeGrantArgsSchema.safeParse(args);
    if (!parseResult.success) {
      return new Err(new Error(fromError(parseResult.error).toString()));
    }
    const { metronomeCreditId } = parseResult.data;

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    const { metronomeCustomerId } = workspaceResource;
    if (!metronomeCustomerId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" is not provisioned in Metronome.`
        )
      );
    }

    // Fetch the specific credit from Metronome.
    const creditResult = await getMetronomeCredit({
      metronomeCustomerId,
      creditId: metronomeCreditId,
    });
    if (creditResult.isErr()) {
      return new Err(creditResult.error);
    }
    const credit = creditResult.value;
    if (!credit) {
      return new Err(
        new Error(`Credit "${metronomeCreditId}" not found in Metronome.`)
      );
    }

    if (!isMetronomeFreeCredit(credit)) {
      return new Err(
        new Error(
          `Credit "${metronomeCreditId}" is not a managed free monthly credit.`
        )
      );
    }

    const contractId = credit.contract?.id;
    if (!contractId) {
      return new Err(
        new Error(
          `Credit "${metronomeCreditId}" is not attached to a contract.`
        )
      );
    }

    // Find the segment that covers the current moment.
    const now = new Date();
    const activeSegment = credit.access_schedule?.schedule_items.find(
      (s) => new Date(s.starting_at) <= now && new Date(s.ending_before) > now
    );
    if (!activeSegment) {
      return new Err(
        new Error(
          `No active segment found on credit "${metronomeCreditId}" for the current period.`
        )
      );
    }

    const grantResult = await handleFreeCreditSegmentGrant({
      workspace: workspaceResource,
      metronomeCustomerId,
      contractId,
      creditId: metronomeCreditId,
      segmentId: activeSegment.id,
    });
    if (grantResult.isErr()) {
      return new Err(grantResult.error);
    }

    return new Ok({
      display: "text",
      value: [
        "Free credit grant triggered successfully.",
        `Credit: ${metronomeCreditId}`,
        `Contract: ${contractId}`,
        `Segment: ${activeSegment.id}`,
        `Period: ${new Date(activeSegment.starting_at).toISOString()} → ${new Date(activeSegment.ending_before).toISOString()}`,
      ].join("\n"),
    });
  },
});
