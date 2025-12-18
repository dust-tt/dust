import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      describe: "The workspace ID to update",
      type: "string",
      demandOption: true,
    },
    enabled: {
      describe: "Enable allowContentCreationFileSharing setting",
      type: "boolean",
      demandOption: true,
    },
  },
  async ({ workspaceId, enabled, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found.");
      return;
    }

    logger.info(
      { workspaceId: workspace.sId, enabled, execute },
      "About to update workspace allowContentCreationFileSharing setting"
    );

    if (execute) {
      const newMetadata = {
        ...workspace.metadata,
        allowContentCreationFileSharing: enabled,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
    }

    logger.info(
      { workspaceId: workspace.sId, enabled },
      "Successfully updated workspace allowContentCreationFileSharing setting"
    );
  }
);
