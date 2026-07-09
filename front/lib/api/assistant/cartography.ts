import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentCartographyCoordinates } from "@app/types/api/assistant/cartography";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { PCA } from "ml-pca";
import OpenAI from "openai";

// Using the smaller/cheaper OpenAI embedder. text-embedding-3-small natively
// outputs 1536 dimensions.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// PCA needs at least 2 samples to project onto 2 components.
const MIN_AGENTS_FOR_PROJECTION = 2;

function buildAgentEmbeddingInput(agent: AgentConfigurationType): string {
  return [
    `Name: ${agent.name}`,
    `Description: ${agent.description}`,
    `Instructions: ${agent.instructions ?? ""}`,
  ].join("\n");
}

/**
 * Projects the 2D PCA scores into the [0, 1] x [0, 1] unit square, scaling each
 * axis independently by its min/max. A degenerate axis (all identical values)
 * collapses to 0.5.
 */
function normalizeTo01(points: number[][]): [number, number][] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scale = (value: number, min: number, max: number): number =>
    max > min ? (value - min) / (max - min) : 0.5;

  return points.map((p) => [scale(p[0], minX, maxX), scale(p[1], minY, maxY)]);
}

/**
 * Computes a 2D cartography of the workspace's agents on the fly: embeds each
 * active agent (name + description + instructions) with OpenAI, projects the
 * high-dimensional embeddings down to 2D via PCA, and normalizes the result to
 * the unit square. Returns a `{ sId: [x, y] }` map.
 *
 * The embeddings are computed in a single batched OpenAI call (one request for
 * all agents) to avoid an N+1 pattern.
 */
export async function computeAgentCartographyCoordinates(
  auth: Authenticator,
  { includeBuiltin = true }: { includeBuiltin?: boolean } = {}
): Promise<Result<AgentCartographyCoordinates, Error>> {
  const allAgents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "full",
  });

  // "Builtin" agents are the Dust-provided global-scope agents. When
  // `includeBuiltin` is false we drop them before running the projection.
  const agents = includeBuiltin
    ? allAgents
    : allAgents.filter((agent) => agent.scope !== "global");

  if (agents.length < MIN_AGENTS_FOR_PROJECTION) {
    return new Ok({});
  }

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const apiKey =
    credentials.OPENAI_EMBEDDING_API_KEY ?? credentials.OPENAI_API_KEY;
  if (!apiKey) {
    return new Err(
      new Error("No OpenAI API key available for this workspace.")
    );
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: credentials.OPENAI_BASE_URL || undefined,
  });

  // Embed all agents in a single request. `catch` is authorized here since it
  // wraps an external library call (per [ERR1]).
  let embeddings: number[][];
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: agents.map(buildAgentEmbeddingInput),
    });

    // Reorder by `index` so embeddings line up with `agents`, regardless of the
    // order the API returns them in.
    embeddings = new Array<number[]>(agents.length);
    for (const item of response.data) {
      embeddings[item.index] = item.embedding;
    }
  } catch (err) {
    logger.error(
      { workspaceId: auth.getNonNullableWorkspace().sId, err },
      "Failed to embed agents for cartography."
    );
    return new Err(normalizeError(err));
  }

  // Project the high-dimensional embeddings down to 2 dimensions via PCA.
  const pca = new PCA(embeddings);
  const scores = pca.predict(embeddings, { nComponents: 2 }).to2DArray();
  const normalized = normalizeTo01(scores);

  const coordinates: AgentCartographyCoordinates = {};
  agents.forEach((agent, i) => {
    coordinates[agent.sId] = normalized[i];
  });

  return new Ok(coordinates);
}
