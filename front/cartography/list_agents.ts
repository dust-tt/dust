import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { makeScript } from "@app/scripts/helpers";

const WORKSPACE_ID = "vigqnm0JoT";

/**
 * Standalone script that lists every agent configuration for a given workspace
 * and prints them. Run with:
 *
 *   cd front && npx tsx cartography/list_agents.ts
 */
makeScript({}, async (_args, logger) => {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);
  const workspace = auth.getNonNullableWorkspace();

  const agents = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    order: [
      ["name", "ASC"],
      ["version", "DESC"],
    ],
  });

  logger.info(
    { count: agents.length, workspaceId: WORKSPACE_ID },
    "Fetched agent configurations"
  );

  for (const agent of agents) {
    logger.info(
      {
        sId: agent.sId,
        workspaceId: agent.workspaceId,
        name: agent.name,
        providerId: agent.providerId,
        modelId: agent.modelId,
        description: agent.description,
        instructions: agent.instructions,
      },
      "Agent"
    );
  }
});
