import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import {
  getFakeWorkOSOrganizationId,
  isFakeWorkOSOrganizationId,
} from "@app/scripts/workspace_helpers";

/**
 * Seed fake SCIM/directory provisioned groups for local development and testing.
 *
 * Usage:
 *   npx tsx ./scripts/seed_directory_provisioned_groups.ts \
 *     --workspace-id <workspace-sId> \
 *     --count 3 \
 *     --add-fake-work-os-organization-id \
 *     --execute
 *
 * To clean up:
 *   npx tsx ./scripts/reset_directory_created_groups.ts \
 *     --workspace-id <workspace-sId> \
 *     --add-fake-work-os-organization-id \
 *     --execute
 */

function generateFakeWorkOSGroupId(index: number): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 9);
  return `directory_group_${timestamp}_${index}_${randomId}`;
}

function pickRandomUsers(users: UserResource[]): UserResource[] {
  if (users.length === 0) {
    return [];
  }

  const selected = users.filter(() => Math.random() < 0.5);
  if (selected.length === 0) {
    return [users[Math.floor(Math.random() * users.length)]];
  }

  return selected;
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string",
      describe: "Workspace sID",
      demandOption: true,
    },
    count: {
      type: "number",
      describe: "Number of fake provisioned groups to create",
      default: 3,
    },
    groupNames: {
      type: "array",
      describe:
        "Group names to create (space-separated). Overrides --count when provided.",
    },
    addFakeWorkOSOrganizationId: {
      type: "boolean",
      describe:
        "Set a fake workOSOrganizationId on the workspace if it does not have one",
      default: false,
    },
  },
  async (
    { execute, workspaceId, count, groupNames, addFakeWorkOSOrganizationId },
    logger
  ) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    logger.info({ workspaceId, workspace: workspace.name }, "Found workspace");

    if (addFakeWorkOSOrganizationId) {
      const fakeWorkOSOrganizationId = getFakeWorkOSOrganizationId(
        workspace.sId
      );

      if (workspace.workOSOrganizationId) {
        if (
          isFakeWorkOSOrganizationId(
            workspace.workOSOrganizationId,
            workspace.sId
          )
        ) {
          logger.info(
            { workOSOrganizationId: workspace.workOSOrganizationId },
            "Workspace already has fake WorkOS organization ID"
          );
        } else {
          logger.warn(
            {
              workOSOrganizationId: workspace.workOSOrganizationId,
            },
            "Workspace already has a WorkOS organization ID, not overwriting"
          );
        }
      } else if (execute) {
        const updateRes = await WorkspaceResource.updateWorkOSOrganizationId(
          workspace.id,
          fakeWorkOSOrganizationId
        );
        if (updateRes.isErr()) {
          logger.error(
            { error: updateRes.error },
            "Failed to set fake WorkOS organization ID"
          );
          return;
        }
        logger.info(
          { workOSOrganizationId: fakeWorkOSOrganizationId },
          "Set fake WorkOS organization ID on workspace"
        );
      } else {
        logger.info(
          { workOSOrganizationId: fakeWorkOSOrganizationId },
          "Would set fake WorkOS organization ID on workspace"
        );
      }
    }

    const namesToCreate =
      groupNames && groupNames.length > 0
        ? groupNames
        : Array.from(
            { length: count },
            (_, i) => `Fake Provisioned Group ${i + 1}`
          );

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace: renderLightWorkspaceType({ workspace }),
    });
    const workspaceUsers = await UserResource.fetchByModelIds(
      memberships.map((membership) => membership.userId)
    );

    if (workspaceUsers.length === 0) {
      logger.warn(
        { workspaceId },
        "No active workspace users found to assign to groups"
      );
    } else {
      logger.info(
        {
          workspaceId,
          userCount: workspaceUsers.length,
          userEmails: workspaceUsers.map((user) => user.email),
        },
        "Found workspace users for random group assignment"
      );
    }

    const groupsToCreate = namesToCreate.map((groupName) => ({
      groupName,
      users: pickRandomUsers(workspaceUsers),
    }));

    const createdGroups: {
      groupId: string;
      groupName: string;
      memberEmails: string[];
    }[] = [];

    for (const [index, { groupName, users }] of groupsToCreate.entries()) {
      const workOSGroupId = generateFakeWorkOSGroupId(index);
      const memberEmails = users.map((user) => user.email);

      logger.info(
        { groupName, workOSGroupId, memberEmails },
        execute
          ? "Creating fake provisioned group"
          : "Would create fake provisioned group"
      );

      if (execute) {
        const group = await GroupResource.makeNew({
          name: groupName,
          workOSGroupId,
          updatedAt: new Date(),
          kind: "provisioned",
          workspaceId: workspace.id,
        });

        if (users.length > 0) {
          const addMembersResult = await group.dangerouslyAddMembers(auth, {
            users: users.map((user) => user.toJSON()),
            allowProvisionedGroups: true,
          });
          if (addMembersResult.isErr()) {
            logger.error(
              {
                groupId: group.sId,
                groupName: group.name,
                error: addMembersResult.error,
              },
              "Failed to add members to fake provisioned group"
            );
          }
        }

        createdGroups.push({
          groupId: group.sId,
          groupName: group.name,
          memberEmails,
        });
        logger.info(
          {
            groupId: group.sId,
            groupName: group.name,
            workOSGroupId,
            memberEmails,
          },
          "Created fake provisioned group"
        );
      }
    }

    logger.info(
      {
        workspaceId,
        groupCount: namesToCreate.length,
        createdGroups,
      },
      execute
        ? "Finished seeding fake provisioned groups"
        : "Dry run -- no groups were created"
    );

    const resetCommand = [
      "npx tsx ./scripts/reset_directory_created_groups.ts",
      `--workspace-id ${workspaceId}`,
      ...(addFakeWorkOSOrganizationId
        ? ["--add-fake-work-os-organization-id"]
        : []),
      "--execute",
    ].join(" ");

    logger.info({}, `To clean up, run:\n  ${resetCommand}`);
  }
);
