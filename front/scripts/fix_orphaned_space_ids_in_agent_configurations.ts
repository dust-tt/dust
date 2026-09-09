import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Optionally repair a single workspace.",
    },
  },
  async ({ execute, workspaceId }, logger) => {
    let configurationCount = 0;
    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const result = await AgentResource.repairOrphanedSpaceRequirements(
          auth,
          {
            dryRun: !execute,
          }
        );
        configurationCount += result.configurationCount;
        if (result.configurationCount > 0) {
          logger.info(
            { workspaceId: workspace.sId, ...result, dryRun: !execute },
            execute
              ? "Repaired orphaned agent space requirements"
              : "Dry run: found orphaned agent space requirements"
          );
        }
      },
      { wId: workspaceId }
    );
    logger.info(
      { configurationCount, dryRun: !execute },
      "Agent space repair completed"
    );
  }
);
