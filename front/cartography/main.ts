import { computeGroupingScore } from "@app/cartography/scoring";
import { computeAgentCartography } from "@app/lib/api/assistant/cartography";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";

const WORKSPACE_ID = "vigqnm0JoT";
const USER_ID = "DIJEPbgQe2";

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
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    USER_ID,
    WORKSPACE_ID
  );

  const result = await computeAgentCartography(auth);
  if (result.isErr()) {
    logger.error(
      { workspaceId: WORKSPACE_ID, err: result.error },
      "Failed to compute agent cartography."
    );
    return;
  }

  const { coordinates: coordinatesByAgentId, duplicates } = result.value;

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

  console.log(`Agent 2D projection\n\n${lines.join("\n\n")}\n`);

  const score = computeGroupingScore(coordinatesByAgentId);
  const nameOf = (sId: string): string => agentById.get(sId)?.name ?? sId;

  const perAgentLines = score.perAgent
    .map(
      (p) =>
        `    ${p.group.padEnd(12)} ${nameOf(p.sId).padEnd(24)} silhouette=${p.silhouette.toFixed(4)}`
    )
    .join("\n");

  console.log(
    [
      "Grouping score (higher silhouette = better separated groups, range [-1, 1])",
      `  mean silhouette:            ${score.silhouette.toFixed(4)}`,
      `  mean intra-group distance:  ${score.intra.toFixed(4)}`,
      `  mean inter-group distance:  ${score.inter.toFixed(4)}`,
      "",
      perAgentLines,
    ].join("\n")
  );

  const duplicateLines = duplicates.length
    ? duplicates
        .map(
          ({ agentIds: [a, b], confidence }) =>
            `    ${confidence.padEnd(10)} ${nameOf(a)} ⇔ ${nameOf(b)}`
        )
        .join("\n")
    : "    (none above threshold)";

  console.log(
    [
      "",
      "Probable duplicates (confidence from embedding similarity, most probable first)",
      duplicateLines,
    ].join("\n")
  );
});
