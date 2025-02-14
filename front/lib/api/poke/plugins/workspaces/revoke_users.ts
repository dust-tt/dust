import { concurrentExecutor, Err, Ok } from "@dust-tt/types";
import assert from "assert";

import { createPlugin } from "@app/lib/api/poke/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";

export const revokeUsersPlugin = createPlugin(
  {
    id: "revoke-users",
    name: "Revoke Users",
    description: "Revoke users from the workspace.",
    resourceTypes: ["workspaces"],
    args: {
      userIds: {
        type: "text",
        label: "User IDs",
        description:
          "Comma separated list of user IDs to revoke from the workspace",
      },
    },
  },
  async (auth, workspaceId, args) => {
    assert(workspaceId, "workspaceId is required");

    const userIds = args.userIds.trim();
    if (!userIds) {
      return new Err(new Error("userIds is required"));
    }

    const userIdsArray = userIds.split(",");

    const users = await UserResource.fetchByIds(userIdsArray);
    if (users.length !== userIdsArray.length) {
      const missingUserIds = userIdsArray.filter(
        (id) => !users.some((user) => user.sId === id)
      );

      return new Err(
        new Error(
          `Could not find users: ${missingUserIds.join(", ")}. Please verify the IDs.`
        )
      );
    }

    const revokedResults = await concurrentExecutor(
      users,
      async (user) => {
        const res = await MembershipResource.revokeMembership({
          user,
          workspace: auth.getNonNullableWorkspace(),
        });
        return {
          userId: user.sId,
          result: res,
        };
      },
      { concurrency: 10 }
    );

    const failedUsers = revokedResults
      .filter((r) => r.result.isErr() && r.result.error.type === "not_found")
      .map((r) => r.userId);
    if (failedUsers.length > 0) {
      return new Err(
        new Error(
          `Failed to revoke the following users as they are not members of the ` +
            `workspace: ${failedUsers.join(", ")}`
        )
      );
    }

    return new Ok({
      display: "text",
      value: `Revoked ${userIdsArray.length} users from workspace ${workspaceId}.`,
    });
  }
);
