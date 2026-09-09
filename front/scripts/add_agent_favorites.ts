import { Authenticator } from "@app/lib/auth";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace ID",
    },
    agentConfigurationIds: {
      type: "string",
      demandOption: true,
      description:
        "Comma-separated list of agent configuration SIDs to favorite",
    },
  },
  async ({ wId, agentConfigurationIds, execute }, logger) => {
    // Find the workspace
    const workspace = await WorkspaceResource.fetchById(wId);

    if (!workspace) {
      logger.error({ wId }, "Workspace not found");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const agentIds = [
      ...new Set(agentConfigurationIds.split(",").map((id) => id.trim())),
    ];
    const result =
      await AgentUserRelationResource.addMissingFavoritesForWorkspaceMembers(
        auth,
        {
          agentIds,
          dryRun: !execute,
        }
      );
    logger.info(
      { wId, agentIds, execute, ...result },
      execute
        ? "Added missing agent favorites"
        : "Agent favorite backfill dry run"
    );
  }
);
