import { computeAgentCartographyCoordinates } from "@app/lib/api/assistant/cartography";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";

const WORKSPACE_ID = "vigqnm0JoT";

/**
 * Standalone script that computes the 2D cartography projection for every agent
 * configuration in a given workspace and prints it to the console. The actual
 * embedding + PCA logic lives in `lib/api/assistant/cartography.ts` and is
 * shared with the live API endpoint; this script only drives it offline and
 * logs the result. Run with:
 *
 *   cd front && npx tsx cartography/list_agents.ts
 */
makeScript({}, async (_args, logger) => {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);

  const result = await computeAgentCartographyCoordinates(auth);
  if (result.isErr()) {
    logger.error(
      { workspaceId: WORKSPACE_ID, err: result.error },
      "Failed to compute agent cartography."
    );
    return;
  }

  const coordinatesByAgentId = result.value;

  // Fetch the agents again to enrich the coordinates with name/description.
  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
  });
  const agentById = new Map(agents.map((agent) => [agent.sId, agent]));

  const lines = Object.entries(coordinatesByAgentId).map(([sId, [x, y]]) => {
    const agent = agentById.get(sId);
    const name = agent?.name ?? "(unknown)";
    const description = agent?.description ?? "";

    return [
      `• ${name}  [${sId}]`,
      `    coords: (${x.toFixed(4)}, ${y.toFixed(4)})`,
      `    ${description}`,
    ].join("\n");
  });

  logger.info(
    { count: lines.length, workspaceId: WORKSPACE_ID },
    `Agent 2D projection\n\n${lines.join("\n\n")}\n`
  );
});
