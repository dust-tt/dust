import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { launchMetronomeSeatCountSyncWorkflow } from "@app/temporal/usage_queue/client";
import {
  BILLABLE_SEAT_TYPES,
  isBillableSeatType,
  isMembershipSeatType,
} from "@app/types/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const SeatLimitArgsSchema = z.object({
  minSeats: z
    .number()
    .int("Min seats must be an integer")
    .min(0, "Min seats must be at least 0"),
  // -1 means "unlimited" (stored as null). Any value >= 0 is a hard cap.
  maxSeats: z
    .number()
    .int("Max seats must be an integer")
    .min(-1, "Use -1 for unlimited, or a value >= 0 for a cap"),
});

export const manageSeatLimitsPlugin = createPlugin({
  manifest: {
    id: "manage-seat-limits",
    name: "Manage Seat Limits",
    description:
      "Configure the per-seat-type minimum and maximum seat counts for this " +
      "workspace. The minimum is the billing floor sent to Metronome even " +
      "when fewer members hold that seat (the shortfall is billed as " +
      "unassigned seats). The maximum caps how many members can be assigned " +
      "the seat type — once reached, new members fall through to the next " +
      "tier or to no seat ('none'). Disabling removes both bounds for the " +
      "selected seat type.",
    resourceTypes: ["workspaces"],
    args: {
      seatType: {
        type: "enum",
        label: "Seat type",
        description: "The seat type to configure.",
        values: mapToEnumValues(BILLABLE_SEAT_TYPES, (seatType) => ({
          label: seatType,
          value: seatType,
        })),
        multiple: false,
      },
      enabled: {
        type: "boolean",
        variant: "toggle",
        label: "Enable limit",
        description:
          "When off, removes any configured min/max for the selected seat " +
          "type (uncapped, no floor).",
      },
      minSeats: {
        type: "number",
        variant: "text",
        label: "Min seats",
        description: "Billing floor — minimum seats billed for this type.",
        dependsOn: { field: "enabled", value: true },
      },
      maxSeats: {
        type: "number",
        variant: "text",
        label: "Max seats",
        description:
          "Hard cap on members assigned this seat type. Use -1 for unlimited.",
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
    if (!isBillableSeatType(seatType)) {
      return new Err(
        new Error("The 'none' seat type cannot have a configured limit.")
      );
    }

    let message: string;
    if (!args.enabled) {
      // Disable: drop any configured limit for this seat type.
      const removed = await WorkspaceSeatLimitResource.remove({
        workspace,
        seatType,
      });
      message = removed
        ? `Removed seat limit for '${seatType}' — now uncapped with no floor.`
        : `No seat limit was configured for '${seatType}'.`;
    } else {
      const parseResult = SeatLimitArgsSchema.safeParse(args);
      if (!parseResult.success) {
        return new Err(
          new Error(
            `Invalid arguments: ${parseResult.error.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join(", ")}`
          )
        );
      }

      const { minSeats } = parseResult.data;
      const maxSeats =
        parseResult.data.maxSeats < 0 ? null : parseResult.data.maxSeats;

      if (maxSeats !== null && maxSeats < minSeats) {
        return new Err(
          new Error(
            `Max seats (${maxSeats}) must be greater than or equal to min seats (${minSeats}).`
          )
        );
      }

      await WorkspaceSeatLimitResource.upsert({
        workspace,
        seatType,
        minSeats,
        maxSeats,
      });

      message =
        `Seat limit for '${seatType}' saved: min ${minSeats}, ` +
        `max ${maxSeats === null ? "unlimited" : maxSeats}.`;
    }

    // Re-sync seats to Metronome so the new floor/cap is reflected immediately
    // (clamps QUANTITY_ONLY quantity and reconciles unassigned seats).
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
