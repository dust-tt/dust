import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "The workspace sId",
      demandOption: true,
    },
    userId: {
      type: "number",
      description:
        "The numeric user ID (authorId) whose agent versions to delete",
      demandOption: true,
    },
  },
  async ({ workspaceId, userId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const { configurationCount, agentIds } =
      await AgentResource.deleteConfigurationsByAuthor(auth, {
        authorModelId: userId,
        dryRun: !execute,
      });

    logger.info(
      {
        workspaceId,
        userId,
        configurationCount,
        agentIds,
        dryRun: !execute,
      },
      execute
        ? "Deleted agent configuration versions authored by the user"
        : "Dry run: agent configuration versions selected for deletion"
    );
  }
);
