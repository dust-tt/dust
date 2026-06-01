import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { launchMetronomeSeatCountSyncWorkflow } from "@app/temporal/usage_queue/client";
import {
  isMembershipSeatType,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const SeatLimitArgsSchema = z.object({
  minSeats: z
    .number()
    .int("Min seats must be an integer")
    .min(0, "Min seats must be at least 0"),
});

export const manageSeatLimitsPlugin = createPlugin({
  manifest: {
    id: "manage-seat-limits",
    name: "Manage Seat Limits",
    description:
      "Configure the per-seat-type minimum seat count for this workspace. " +
      "The minimum is the billing floor sent to Metronome even when fewer " +
      "members hold that seat (the shortfall is billed as unassigned seats). " +
      "Disabling removes the floor for the selected seat type.",
    resourceTypes: ["workspaces"],
    args: {
      seatType: {
        type: "enum",
        label: "Seat type",
        description: "The seat type to configure.",
        values: mapToEnumValues(MEMBERSHIP_SEAT_TYPES, (seatType) => ({
          label: seatType,
          value: seatType,
        })),
        multiple: false,
      },
      enabled: {
        type: "boolean",
        variant: "toggle",
        label: "Enable floor",
        description:
          "When off, removes any configured minimum for the selected seat type.",
      },
      minSeats: {
        type: "number",
        variant: "text",
        label: "Min seats",
        description: "Billing floor — minimum seats billed for this type.",
        dependsOn: { field: "enabled", value: true },
      },
    },
  },

  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },

  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const seatType = args.seatType[0];
    if (!seatType || !isMembershipSeatType(seatType)) {
      return new Err(new Error("Please select a seat type."));
    }

    let message: string;
    if (!args.enabled) {
      // Disable: drop any configured floor for this seat type.
      const removed = await WorkspaceSeatLimitResource.remove({
        workspace,
        seatType,
      });
      message = removed
        ? `Removed seat floor for '${seatType}'.`
        : `No seat floor was configured for '${seatType}'.`;
    } else {
      const parseResult = SeatLimitArgsSchema.safeParse(args);
      if (!parseResult.success) {
        return new Err(new Error(fromError(parseResult.error).toString()));
      }

      const { minSeats } = parseResult.data;
      await WorkspaceSeatLimitResource.upsert({
        workspace,
        seatType,
        minSeats,
      });
      message = `Seat floor for '${seatType}' saved: min ${minSeats}.`;
    }

    // Re-sync seats to Metronome so the new floor is reflected immediately.
    const syncResult = await launchMetronomeSeatCountSyncWorkflow({
      workspaceId: workspace.sId,
    });
    if (syncResult.isErr()) {
      return new Err(
        new Error(
          `${message} However, the Metronome seat sync failed to launch: ` +
            `${syncResult.error.message}. Re-run once the issue is resolved.`
        )
      );
    }

    return new Ok({
      display: "text",
      value: `${message} Metronome seat sync launched.`,
    });
  },
});
