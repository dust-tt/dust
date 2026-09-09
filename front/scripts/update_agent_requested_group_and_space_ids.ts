import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "The workspace ID (sId) to update agents for",
    },
    onlyActive: {
      type: "boolean",
      default: true,
      description: "Only update active agents (default: true)",
    },
    agentIds: {
      type: "array",
      default: [],
      description:
        "Optional agent IDs. If empty, rebuild all agents in the workspace.",
    },
  },
  async ({ workspaceId, execute, onlyActive, agentIds }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId,
          {
            dangerouslyRequestAllGroups: true,
          }
        );
        const result = await AgentResource.rebuildSpaceRequirements(auth, {
          onlyActive,
          agentIds: agentIds.map(String),
          dryRun: !execute,
        });
        logger.info(
          { workspaceId: workspace.sId, ...result, dryRun: !execute },
          execute
            ? "Rebuilt agent space requirements"
            : "Dry run: agent space requirements"
        );
      },
      { wId: workspaceId, concurrency: 3 }
    );
  }
);
