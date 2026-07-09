import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator } from "@app/lib/auth";
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

  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "admin_internal",
    variant: "full",
  });

  logger.info(
    { count: agents.length, workspaceId: WORKSPACE_ID },
    "Fetched agent configurations"
  );

  for (const agent of agents) {
    logger.info(
      {
        sId: agent.sId,
        name: agent.name,
        providerId: agent.model.providerId,
        modelId: agent.model.modelId,
        description: agent.description,
        instructions: agent.instructions,
      },
      "Agent"
    );
  }
});
