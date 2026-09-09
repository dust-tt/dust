import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript(
  {
    concurrency: {
      type: "number",
      description: "The number of workspaces to process concurrently.",
      default: 8,
    },
    workspaceId: {
      type: "string",
      description: "A single workspace id.",
    },
  },
  async ({ workspaceId, execute, concurrency }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const result = await AgentResource.deleteUnusedDraftConfigurations(
          auth,
          {
            dryRun: !execute,
          }
        );
        logger.info(
          { workspaceId: workspace.sId, ...result, dryRun: !execute },
          execute
            ? "Deleted unused draft agent configurations"
            : "Dry run: selected unused draft agent configurations"
        );
      },
      { wId: workspaceId, concurrency }
    );
  }
);
