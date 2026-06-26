import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { isFakeWorkOSOrganizationId } from "@app/scripts/workspace_helpers";

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string",
      describe: "Workspace sID",
      demandOption: true,
    },
    addFakeWorkOSOrganizationId: {
      type: "boolean",
      describe:
        "Also clear the fake workOSOrganizationId if it was set by the seed script",
      default: false,
    },
  },
  async ({ execute, workspaceId, addFakeWorkOSOrganizationId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    logger.info({ workspaceId, workspace: workspace.name }, "Found workspace");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const provisionedGroups = await GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: ["provisioned"],
    });

    logger.info(
      {
        workspaceId,
        provisionedGroupCount: provisionedGroups.length,
        groupNames: provisionedGroups.map((g) => g.name),
      },
      provisionedGroups.length === 0
        ? "No provisioned groups found"
        : "Provisioned groups to delete"
    );

    for (const group of provisionedGroups) {
      logger.info(
        { groupId: group.sId, groupName: group.name },
        execute
          ? "Deleting group (and memberships, keys, links)"
          : "Would delete group (and memberships, keys, links)"
      );

      if (execute) {
        const res = await group.delete(auth);
        if (res.isErr()) {
          logger.error(
            { groupId: group.sId, error: res.error },
            "Failed to delete group"
          );
        } else {
          logger.info(
            { groupId: group.sId, name: group.name, kind: group.kind },
            "Group deleted"
          );
        }
      } else {
        logger.info(
          { groupId: group.sId, name: group.name, kind: group.kind },
          "Dry run -- not deleting group "
        );
      }
    }

    if (addFakeWorkOSOrganizationId) {
      if (
        isFakeWorkOSOrganizationId(
          workspace.workOSOrganizationId,
          workspace.sId
        )
      ) {
        logger.info(
          { workOSOrganizationId: workspace.workOSOrganizationId },
          execute
            ? "Clearing fake WorkOS organization ID"
            : "Would clear fake WorkOS organization ID"
        );

        if (execute) {
          const updateRes = await WorkspaceResource.updateWorkOSOrganizationId(
            workspace.id,
            null
          );
          if (updateRes.isErr()) {
            logger.error(
              { error: updateRes.error },
              "Failed to clear fake WorkOS organization ID"
            );
          } else {
            logger.info({}, "Cleared fake WorkOS organization ID");
          }
        }
      } else if (workspace.workOSOrganizationId) {
        logger.warn(
          { workOSOrganizationId: workspace.workOSOrganizationId },
          "Workspace WorkOS organization ID is not a fake one, not clearing"
        );
      } else {
        logger.info({}, "No WorkOS organization ID to clear");
      }
    }
  }
);
