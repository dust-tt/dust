import { revokeAndTrackMembership } from "@app/lib/api/membership";
import { createPlugin } from "@app/lib/api/poke/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor, Err, Ok } from "@app/types";

export const revokeUsersPlugin = createPlugin({
  manifest: {
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
  execute: async (auth, workspace, args) => {
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
        const res = await revokeAndTrackMembership(
          auth.getNonNullableWorkspace(),
          user
        );
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
      value: `Revoked ${userIdsArray.length} users from workspace ${workspace?.sId}.`,
    });
  },
});
