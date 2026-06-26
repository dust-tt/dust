import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { createPlugin } from "@app/lib/api/poke/types";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  isMembershipSeatType,
  isPaidSeatType,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";

export const batchUpdateSeatsPlugin = createPlugin({
  manifest: {
    id: "batch-update-seats",
    name: "Batch Update Seats",
    description:
      "Set the seat type for a batch of users identified by email. " +
      "For each email we look up the user and their active membership in " +
      "this workspace; members get their seat updated, the rest are reported.",
    resourceTypes: ["workspaces"],
    args: {
      seatType: {
        type: "enum",
        label: "Seat type",
        description: "The seat type to assign to every listed member.",
        values: mapToEnumValues(MEMBERSHIP_SEAT_TYPES, (seatType) => ({
          label: seatType,
          value: seatType,
        })),
        multiple: false,
      },
      emails: {
        type: "text",
        label: "Emails",
        description: "One email per line.",
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const seatType = args.seatType[0];
    if (!seatType || !isMembershipSeatType(seatType)) {
      return new Err(new Error("Please select a seat type."));
    }

    // One email per line; trim, lowercase and dedupe.
    const emails = Array.from(
      new Set(
        args.emails
          .split("\n")
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0)
      )
    );
    if (emails.length === 0) {
      return new Err(new Error("At least one email is required."));
    }

    // Guard against assigning a paid seat type the contract does not sell.
    // The contract is the same for every email, so check entitlement once.
    // `none`/`free` are not contract seat subscriptions and are gated by
    // `updateMembershipSeatAndTrack` separately.
    if (isPaidSeatType(seatType)) {
      const contract = await getActiveContract(workspace.sId);
      if (contract) {
        const productSeatTypes = await getProductSeatTypes();
        const entitledSeatTypes = getSeatSubscriptionsFromContract(
          contract,
          productSeatTypes
        );
        // Only enforce when the contract actually sells seats; contracts with
        // no seat subscription fall through to the existing DB-only behavior.
        if (entitledSeatTypes.size > 0 && !entitledSeatTypes.has(seatType)) {
          return new Err(
            new Error(
              `Seat type '${seatType}' is not available on this workspace's ` +
                `contract. Available seat types: ` +
                `${[...entitledSeatTypes.keys()].join(", ")}.`
            )
          );
        }
      }
    }

    const users = await UserResource.fetchByEmails(emails);
    const usersByEmail = new Map(
      users.map((user) => [user.email.toLowerCase(), user])
    );

    const author = auth.user()?.toJSON() ?? "no-author";

    const results = await concurrentExecutor(
      emails,
      async (email) => {
        const user = usersByEmail.get(email);
        if (!user) {
          return { email, status: "user_not_found" as const };
        }

        const res = await updateMembershipSeatAndTrack({
          user,
          workspace,
          newSeatType: seatType,
          author,
        });
        if (res.isErr()) {
          return { email, status: "failed" as const, error: res.error.type };
        }

        const { previousSeatType, newSeatType, scheduledSeatChangeAt } =
          res.value;
        if (previousSeatType === newSeatType && !scheduledSeatChangeAt) {
          return { email, status: "unchanged" as const, seatType: newSeatType };
        }

        return {
          email,
          status: "updated" as const,
          previousSeatType,
          newSeatType,
          scheduledSeatChangeAt: scheduledSeatChangeAt?.toISOString() ?? null,
        };
      },
      { concurrency: 10 }
    );

    return new Ok({
      display: "json",
      value: { results },
    });
  },
});
