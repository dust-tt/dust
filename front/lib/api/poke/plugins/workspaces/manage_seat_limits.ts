import { createPlugin } from "@app/lib/api/poke/types";
import { MEMBERSHIP_SEAT_TYPES } from "@app/types/memberships";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err } from "@app/types/shared/result";

// Seat limits are now edited exclusively through the seat-limit schedule
// dialog, which writes directly via `setSeatLimitScheduleForSeatType`
// (lib/api/poke/seat_limits_schedule.ts). This is a no-op plugin, used the
// same way as the ones in `upgrade_downgrade.ts`: it exists only so that
// endpoint can save a plugin record in the database for the change it makes.
export const manageSeatLimitsPlugin = createPlugin({
  manifest: {
    id: "manage-seat-limits",
    name: "Manage Seat Limits",
    description:
      "Audit-log record of a seat-limit schedule change applied through the " +
      "seat-limit schedule dialog.",
    resourceTypes: ["workspaces"],
    isHidden: true,
    args: {
      seatType: {
        type: "enum",
        label: "Seat type",
        description: "The seat type that was configured.",
        values: mapToEnumValues(MEMBERSHIP_SEAT_TYPES, (seatType) => ({
          label: seatType,
          value: seatType,
        })),
        multiple: false,
      },
      phasesJson: {
        type: "text",
        label: "Phases",
        description:
          "JSON-serialized list of the { minSeats, maxSeats, startAt } " +
          "phases that were submitted for this seat type.",
      },
    },
    requiredRoles: ["billing"],
  },
  execute: async () => {
    return new Err(new Error("NO_OP"));
  },
});
