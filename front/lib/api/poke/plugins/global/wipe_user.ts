import { createPlugin } from "@app/lib/api/poke/types";
import { deleteWorkOSUser } from "@app/lib/api/workos/user";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import {
  formatForeignKeyReferences,
  UserResource,
} from "@app/lib/resources/user_resource";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import { Err, Ok } from "@app/types/shared/result";

export const wipeUserPlugin = createPlugin({
  manifest: {
    id: "wipe-user",
    name: "Wipe User",
    description:
      "Permanently delete a user with no membership and no data left in the front database: " +
      "removes them from Customer.io, WorkOS and the front database.",
    warning:
      "Irreversible. Only front database foreign keys are checked: data in core, connectors, " +
      "Elasticsearch or storage is not.",
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
        description: "Confirm you want to permanently delete this user.",
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

    const memberships = await MembershipResource.fetchByUserIds([user.id]);
    if (memberships.length > 0) {
      return new Err(
        new Error(
          `User ${userId} still has ${memberships.length} membership(s), revoked ones included.`
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

    const references = await user.listForeignKeyReferences();
    if (references.length > 0) {
      return new Err(
        new Error(
          `User ${userId} is still referenced by: ${formatForeignKeyReferences(references)}`
        )
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

    const deleteResult = await user.hardDeleteIfUnreferenced();
    if (deleteResult.isErr()) {
      return deleteResult;
    }

    return new Ok({
      display: "text",
      value: `User ${userId} deleted from Customer.io, WorkOS and the front database.`,
    });
  },
});
