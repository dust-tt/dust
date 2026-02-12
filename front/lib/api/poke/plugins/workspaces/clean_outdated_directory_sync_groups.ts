import { createPlugin } from "@app/lib/api/poke/types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types/shared/result";

export const cleanOutdatedDirectorySyncGroupsPlugin = createPlugin({
  manifest: {
    id: "clean-outdated-directory-sync-groups",
    name: "Clean Outdated Directory Sync Groups",
    description:
      "Delete specified groups that were created from directory sync.",
    resourceTypes: ["workspaces"],
    warning:
      "This action will permanently delete groups and remove all their memberships and space associations. " +
      "Make sure the groups are truly outdated before proceeding and run without 'execute' to verify.",
    args: {
      groupNames: {
        type: "text",
        label: "Group Names",
        description:
          "Comma-separated list of group names to delete. Only provisioned groups will be deleted.",
      },
      execute: {
        type: "boolean",
        label: "Execute",
        description:
          "If disabled, will only show what groups would be deleted without actually deleting them",
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("No workspace specified"));
    }

    const { groupNames, execute } = args;

    if (!groupNames || groupNames.trim() === "") {
      return new Err(
        new Error(
          "Group names must be specified. Provide a comma-separated list of group names."
        )
      );
    }

    const specifiedNames = groupNames
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (specifiedNames.length === 0) {
      return new Err(new Error("No valid group names provided after parsing."));
    }

    const provisionedGroups = await GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: ["provisioned"],
    });
    if (provisionedGroups.length === 0) {
      return new Ok({
        display: "text",
        value: "No provisioned groups found in this workspace.",
      });
    }
    // Map to avoid an n^2 complexity.
    const groupMapByName = new Map(
      provisionedGroups.map((group) => [group.name, group])
    );

    const groupsToDelete: GroupResource[] = [];
    const groupsNotFound: string[] = [];

    for (const groupName of specifiedNames) {
      const group = groupMapByName.get(groupName);
      if (group) {
        groupsToDelete.push(group);
      } else {
        groupsNotFound.push(groupName);
      }
    }

    if (groupsToDelete.length === 0) {
      return new Err(
        new Error(
          "None of the specified group names were found as provisioned groups in this " +
            `workspace. Not found: ${groupsNotFound.join(", ")}`
        )
      );
    }

    const groupSummary = await concurrentExecutor(
      groupsToDelete,
      async (group) => {
        const memberCount = await group.getMemberCount(auth);
        return {
          name: group.name,
          sId: group.sId,
          workOSGroupId: group.workOSGroupId,
          memberCount,
        };
      },
      { concurrency: 5 }
    );

    if (!execute) {
      return new Ok({
        display: "json",
        value: {
          mode: "dry_run",
          message: `Found ${groupsToDelete.length} group${groupsToDelete.length > 1 ? "s" : ""} that would be deleted`,
          groups: groupSummary,
          notFound: groupsNotFound,
          note: "No groups were actually deleted. Tick 'execute' to perform the deletion.",
        },
      });
    }

    // Actually delete the groups.
    const deletionResults = [];
    for (const group of groupsToDelete) {
      const deleteResult = await group.delete(auth);
      if (deleteResult.isErr()) {
        deletionResults.push({
          name: group.name,
          sId: group.sId,
          success: false,
          error: deleteResult.error.message,
        });
      } else {
        deletionResults.push({
          name: group.name,
          sId: group.sId,
          success: true,
        });
      }
    }

    const successCount = deletionResults.filter((r) => r.success).length;
    const failureCount = deletionResults.filter((r) => !r.success).length;

    return new Ok({
      display: "json",
      value: {
        mode: "execution",
        message: `Cleanup completed: ${successCount} groups deleted, ${failureCount} failures`,
        summary: {
          total: groupsToDelete.length,
          successful: successCount,
          failed: failureCount,
        },
        results: deletionResults,
        groupsProcessed: groupSummary,
        notFound: groupsNotFound,
      },
    });
  },
});
