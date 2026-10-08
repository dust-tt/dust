import { createPlugin } from "@app/lib/api/poke/types";
import { deleteWorkOSUser } from "@app/lib/api/workos/user";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:avervaet,label:product;security] refuse-non-revoked-membership
 * The wipe MUST be refused, with no external deletion or anonymization, while the user has any
 * membership that is not revoked (active, or scheduled to start in the future). Revoked
 * memberships MUST NOT block the wipe.
 */
export const wipeUserPlugin = createPlugin({
  manifest: {
    id: "wipe-user",
    name: "Wipe User",
    description:
      "Permanently wipe a user with no active membership: removes them from Customer.io and WorkOS, " +
      "and anonymizes their row in the front database.",
    warning:
      "Irreversible. Only the user row and its metadata are anonymized: data the user created " +
      "(messages, files...) is kept and still points to the anonymized user.",
    resourceTypes: ["global"],
    args: {
      userId: {
        type: "string",
        label: "User ID",
        description: "sId of the user to wipe.",
      },
      confirmWipe: {
        type: "boolean",
        label: "Confirm wipe",
        description: "Confirm you want to permanently wipe this user.",
      },
    },
    requiredRoles: ["engineering"],
  },
  execute: async (_, __, args) => {
    const { userId, confirmWipe } = args;

    if (!confirmWipe) {
      return new Err(new Error("Wipe not confirmed."));
    }

    const user = await UserResource.fetchById(userId);
    if (!user) {
      return new Err(new Error(`User ${userId} not found.`));
    }

    // Revoked memberships are kept as history; they only point to the anonymized row.
    const memberships = await MembershipResource.fetchByUserIds([user.id]);
    const nonRevokedMemberships = memberships.filter((m) => !m.isRevoked());
    if (nonRevokedMemberships.length > 0) {
      return new Err(
        new Error(
          `User ${userId} still has ${nonRevokedMemberships.length} active or scheduled membership(s).`
        )
      );
    }

    // Customer.io deletes by email, so it would also delete another user sharing it.
    const usersWithEmail = await UserResource.listByEmail(user.email);
    if (usersWithEmail.length > 1) {
      return new Err(
        new Error(`Another user shares the email of user ${userId}.`)
      );
    }

    const customerioResult = await CustomerioServerSideTracking.deleteUser({
      email: user.email,
    });
    if (customerioResult.isErr()) {
      return customerioResult;
    }

    if (user.workOSUserId) {
      const workOSResult = await deleteWorkOSUser(user.workOSUserId);
      if (workOSResult.isErr()) {
        return workOSResult;
      }
    }

    const anonymizeResult = await user.anonymize();
    if (anonymizeResult.isErr()) {
      return anonymizeResult;
    }

    return new Ok({
      display: "text",
      value: `User ${userId} deleted from Customer.io and WorkOS, and anonymized in the front database.`,
    });
  },
});
