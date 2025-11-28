import type {
  AutoPaginatable,
  DefaultCustomAttributes,
  DirectoryUserWithGroups,
} from "@workos-inc/node";

import { createPlugin } from "@app/lib/api/poke/types";
import { getWorkOS } from "@app/lib/api/workos/client";
import { getWorkOSOrganizationDSyncDirectories } from "@app/lib/api/workos/organization";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok, removeNulls } from "@app/types";
import { MembershipsUpdateResponse } from "@hubspot/api-client/lib/codegen/crm/lists";

export const resetProvisionedMembersNotInDirectoryPlugin = createPlugin({
  manifest: {
    id: "reset-provisioned-members-not-in-directory",
    name: "Reset Provisioned Members Not In Directory",
    description:
      "Check if workspace members marked as 'provisioned' are present in the WorkOS directory, " +
      "and reset their origin membership to 'invited' if they are not in the directory.",
    resourceTypes: ["workspaces"],
    args: {
      execute: {
        type: "boolean",
        label: "Execute",
        description:
          "If disabled, will only show what members would be reset without actually updating them",
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const { execute } = args;

    if (!workspace.workOSOrganizationId) {
      return new Err(
        new Error("No WorkOS organization associated with this workspace")
      );
    }

    // Get WorkOS directories
    const directoriesResult = await getWorkOSOrganizationDSyncDirectories({
      workspace,
    });
    if (directoriesResult.isErr()) {
      return new Err(
        new Error(
          `Failed to get directories: ${directoriesResult.error.message}`
        )
      );
    }

    const directories = directoriesResult.value;
    if (directories.length === 0) {
      return new Ok({
        display: "text",
        value: "No WorkOS directories found for this workspace.",
      });
    }

    if (directories.length > 1) {
      return new Err(
        new Error(
          "Multiple directories are not supported. This workspace has more than one directory."
        )
      );
    }

    const [directory] = directories;

    // Get all memberships with users included
    const { memberships } = await MembershipResource.getMembershipsForWorkspace(
      {
        workspace,
        includeUser: true,
      }
    );

    // Filter to only active memberships with origin "provisioned"
    const now = new Date();
    const provisionedMemberships = memberships.filter(
      (membership) =>
        membership.origin === "provisioned" &&
        membership.startAt <= now &&
        (membership.endAt === null || membership.endAt >= now)
    );

    if (provisionedMemberships.length === 0) {
      return new Ok({
        display: "text",
        value:
          "No active memberships with 'provisioned' origin found in this workspace.",
      });
    }

    // List all users in the directory
    const workOS = getWorkOS();
    const directoryUserEmails = new Set<string>();
    let after: string | undefined = undefined;

    do {
      const response: AutoPaginatable<
        DirectoryUserWithGroups<DefaultCustomAttributes>
      > = await workOS.directorySync.listUsers({
        directory: directory.id,
        ...(after && { after }),
      });
      response.data.forEach((user) => {
        if (user.email) {
          directoryUserEmails.add(user.email.toLowerCase());
        }
      });
      after = response.listMetadata?.after;
    } while (after);

    // Check which provisioned members are not in the directory
    const membersToReset: Array<{
      membership: MembershipResource;
      userEmail: string;
    }> = [];

    for (const membership of provisionedMemberships) {
      const user = membership.user;
      if (!user || !user.email) {
        continue;
      }

      const userEmail = user.email.toLowerCase();
      if (!directoryUserEmails.has(userEmail)) {
        membersToReset.push({ membership, userEmail: user.email });
      }
    }

    if (membersToReset.length === 0) {
      return new Ok({
        display: "text",
        value: `All ${provisionedMemberships.length} provisioned members are present in the directory. No changes needed.`,
      });
    }

    if (!execute) {
      return new Ok({
        display: "json",
        value: {
          mode: "dry_run",
          message: `Found ${membersToReset.length} provisioned member${membersToReset.length > 1 ? "s" : ""} not in directory that would be reset`,
          members: membersToReset.map(({ membership, userEmail }) => {
            const userAttributes = membership.user;
            const user = userAttributes
              ? new UserResource(UserModel, userAttributes)
              : null;
            return {
              email: userEmail,
              userId: user?.sId,
              membershipId: membership.id,
              role: membership.role,
            };
          }),
          note: "No memberships were actually updated. Tick 'execute' to perform the reset.",
        },
      });
    }

    // Actually reset the memberships
    const resetResults = await concurrentExecutor(
      membersToReset,
      async ({ membership, userEmail }) => {
        const userAttributes = membership.user;
        if (!userAttributes) {
          return {
            email: userEmail,
            success: false,
            error: "User not found",
          };
        }

        const user = new UserResource(UserModel, userAttributes);

        try {
          const { previousOrigin, newOrigin } = await membership.updateOrigin({
            user,
            workspace,
            newOrigin: "invited",
          });

          return {
            email: userEmail,
            userId: user.sId,
            membershipId: membership.id,
            success: true,
            previousOrigin,
            newOrigin,
          };
        } catch (error) {
          return {
            email: userEmail,
            userId: user.sId,
            membershipId: membership.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      { concurrency: 10 }
    );

    const successCount = resetResults.filter((r) => r.success).length;
    const failureCount = resetResults.filter((r) => !r.success).length;

    return new Ok({
      display: "json",
      value: {
        mode: "execution",
        message: `Reset completed: ${successCount} memberships reset, ${failureCount} failures`,
        summary: {
          total: membersToReset.length,
          successful: successCount,
          failed: failureCount,
        },
        results: resetResults,
      },
    });
  },
});
