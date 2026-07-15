import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { launchMetronomeSeatCountSyncWorkflow } from "@app/temporal/usage_queue/client";
import {
  isMembershipSeatType,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import { mapToEnumValues } from "@app/types/poke/plugins";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// Poke date args arrive as strings (empty when unset). Parse to a Date or
// null, surfacing a readable error for an unparseable value.
function parseOptionalDate(
  value: unknown,
  label: string
): Result<Date | null, Error> {
  if (typeof value !== "string" || value.trim() === "") {
    return new Ok(null);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return new Err(new Error(`Invalid ${label}.`));
  }
  return new Ok(date);
}

function toDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const SeatLimitArgsSchema = z.object({
  minSeats: z
    .number()
    .int("Min seats must be an integer")
    .min(0, "Min seats must be at least 0"),
  maxSeats: z.preprocess(
    (v) => (v === 0 ? undefined : v),
    z
      .number()
      .int("Max seats must be an integer")
      .min(1, "Max seats must be at least 1")
      .optional()
  ),
});

export const manageSeatLimitsPlugin = createPlugin({
  manifest: {
    id: "manage-seat-limits",
    name: "Manage Seat Limits",
    description:
      "Configure the per-seat-type minimum and maximum seat counts for this workspace. " +
      "The minimum is the billing floor sent to Metronome even when fewer " +
      "members hold that seat (the shortfall is billed as unassigned seats). " +
      "The maximum is a hard cap — assignments into an at-cap tier are rejected. " +
      "Disabling removes the floor and cap for the selected seat type.",
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
        label: "Enable limits",
        description:
          "When off, removes any configured minimum and maximum for the selected seat type.",
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
          "Hard cap — maximum seats assignable for this type. Leave blank for no cap.",
        dependsOn: { field: "enabled", value: true },
      },
      startDate: {
        type: "date",
        label: "Start date (optional)",
        description:
          "When these limits take effect. Leave blank to apply immediately. " +
          "A future date schedules the change (it is programmed into Metronome " +
          "ahead of time and supersedes any later scheduled change).",
        dependsOn: { field: "enabled", value: true },
      },
      endDate: {
        type: "date",
        label: "End date (optional)",
        description:
          "When these limits stop applying (no floor/cap afterwards). Leave " +
          "blank for open-ended.",
        dependsOn: { field: "enabled", value: true },
      },
    },
    requiredRoles: ["billing"],
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
      // Disable: drop any configured floor/cap for this seat type.
      const removed = await WorkspaceSeatLimitResource.remove({
        workspace,
        seatType,
      });
      message = removed
        ? `Removed seat limits for '${seatType}'.`
        : `No seat limits were configured for '${seatType}'.`;
    } else {
      const parseResult = SeatLimitArgsSchema.safeParse(args);
      if (!parseResult.success) {
        return new Err(new Error(fromError(parseResult.error).toString()));
      }

      const { minSeats, maxSeats } = parseResult.data;

      const startAtResult = parseOptionalDate(args.startDate, "start date");
      if (startAtResult.isErr()) {
        return new Err(startAtResult.error);
      }
      const endAtResult = parseOptionalDate(args.endDate, "end date");
      if (endAtResult.isErr()) {
        return new Err(endAtResult.error);
      }
      const startAt = startAtResult.value;
      const endAt = endAtResult.value;

      // No dates: keep the simple "apply now" upsert (in place, leaving any
      // pending scheduled change untouched). Any date given routes through the
      // windowed scheduling primitive.
      const saveResult =
        startAt === null && endAt === null
          ? await WorkspaceSeatLimitResource.upsert({
              workspace,
              seatType,
              minSeats,
              maxSeats: maxSeats ?? null,
            })
          : await WorkspaceSeatLimitResource.setScheduledLimit({
              workspace,
              seatType,
              minSeats,
              maxSeats: maxSeats ?? null,
              startAt: startAt ?? new Date(),
              endAt,
            });
      if (saveResult.isErr()) {
        return new Err(saveResult.error);
      }
      const maxDesc = maxSeats !== undefined ? `, max ${maxSeats}` : ", no cap";
      const windowDesc =
        startAt || endAt
          ? ` (effective ${startAt ? toDateLabel(startAt) : "now"}${
              endAt ? ` until ${toDateLabel(endAt)}` : ""
            })`
          : "";
      message = `Seat limits for '${seatType}' saved: min ${minSeats}${maxDesc}${windowDesc}.`;
    }

    // Re-sync seats to Metronome so the new limits are reflected immediately.
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
