import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceSId: {
      alias: "w",
      type: "string",
      description: "Workspace sID",
      demandOption: true,
    },
  },
  async ({ execute, workspaceSId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceSId);
    if (!workspace) {
      logger.error({ workspaceSId }, "Workspace not found");
      return;
    }

    logger.info({ workspaceSId, workspace: workspace.name }, "Found workspace");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const provisionedGroups = await GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: ["provisioned"],
    });

    logger.info(
      {
        workspaceSId,
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
  }
);
