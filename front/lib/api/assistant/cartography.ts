import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type {
  AgentCartographyCoordinates,
  AgentDuplicatePair,
} from "@app/types/api/assistant/cartography";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { PCA } from "ml-pca";
import OpenAI from "openai";

// Using the smaller/cheaper OpenAI embedder. text-embedding-3-small natively
// outputs 1536 dimensions.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;

// PCA needs at least 2 samples to project onto 2 components.
const MIN_AGENTS_FOR_PROJECTION = 2;

// Two agents whose embeddings have a cosine similarity at or above this
// threshold are flagged as probable duplicates. Tuned on our reference
// workspace so that only genuinely overlapping agents (e.g. two agents both
// reviewing/scoring pull requests) are surfaced.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.65;

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
 * Cosine similarity between two equal-length embedding vectors, in [-1, 1]
 * (in practice [0, 1] for OpenAI embeddings). Returns 0 if either vector is
 * degenerate (zero norm).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Detects probable duplicate agents by scanning every pair of agents for a
 * cosine similarity (on their high-dimensional embeddings, before PCA) at or
 * above `DUPLICATE_SIMILARITY_THRESHOLD`. The returned pairs are sorted by
 * descending similarity (most probable duplicate first).
 *
 * We compare the raw embeddings rather than the 2D PCA coordinates because the
 * projection is lossy: two agents can land close on the 2D map without being
 * genuine duplicates, and vice versa.
 *
 * Global (Dust-provided) agents are excluded: the model agents (GPT, Claude,
 * …) all share near-identical descriptions and would otherwise dominate the
 * results with false positives. We only look for duplicates among the
 * workspace's own agents.
 */
function detectDuplicatePairs(
  agents: AgentConfigurationType[],
  embeddings: number[][]
): AgentDuplicatePair[] {
  const candidates = agents
    .map((agent, i) => ({ agent, embedding: embeddings[i] }))
    .filter(({ agent }) => agent.scope !== "global");

  const duplicates: AgentDuplicatePair[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const similarity = cosineSimilarity(
        candidates[i].embedding,
        candidates[j].embedding
      );
      if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
        duplicates.push({
          agentIds: [candidates[i].agent.sId, candidates[j].agent.sId],
          similarity,
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

export type AgentCartographyResult = {
  coordinates: AgentCartographyCoordinates;
  duplicates: AgentDuplicatePair[];
};

/**
 * Computes a 2D cartography of the workspace's agents on the fly: embeds each
 * active agent (name + description + instructions) with OpenAI, projects the
 * high-dimensional embeddings down to 2D via PCA, and normalizes the result to
 * the unit square. Also flags probable duplicate agents from their embedding
 * cosine similarity. Returns a `{ coordinates, duplicates }` object.
 *
 * The embeddings are computed in a single batched OpenAI call (one request for
 * all agents) to avoid an N+1 pattern.
 */
export async function computeAgentCartographyCoordinates(
  auth: Authenticator,
  { includeBuiltin = true }: { includeBuiltin?: boolean } = {}
): Promise<Result<AgentCartographyResult, Error>> {
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
    return new Ok({ coordinates: {}, duplicates: [] });
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

  const duplicates = detectDuplicatePairs(agents, embeddings);

  return new Ok({ coordinates, duplicates });
}
