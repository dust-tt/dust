import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { writeFile } from "fs/promises";
import { PCA } from "ml-pca";
import OpenAI from "openai";
import path from "path";

const WORKSPACE_ID = "vigqnm0JoT";

// Using the smaller/cheaper OpenAI embedder for now. text-embedding-3-small
// natively outputs 1536 dimensions.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

async function fetchActiveAgents(auth: Authenticator) {
  const workspace = auth.getNonNullableWorkspace();

  return AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    order: [
      ["name", "ASC"],
      ["version", "DESC"],
    ],
  });
}

async function makeOpenAIClient(
  auth: Authenticator,
  logger: Logger
): Promise<OpenAI | null> {
  // Reuse the workspace LLM credentials resolution used across search/upsert.
  // We only need the OpenAI key here, so skip the embedding-key requirement
  // (which is BYOK-specific) and fall back to OPENAI_API_KEY.
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const apiKey =
    credentials.OPENAI_EMBEDDING_API_KEY ?? credentials.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error(
      "No OpenAI API key available for this workspace; cannot embed agents."
    );
    return null;
  }

  return new OpenAI({
    apiKey,
    baseURL: credentials.OPENAI_BASE_URL || undefined,
  });
}

function buildAgentEmbeddingInput(agent: AgentConfigurationModel): string {
  return [
    `Name: ${agent.name}`,
    `Description: ${agent.description}`,
    `Instructions: ${agent.instructions ?? ""}`,
  ].join("\n");
}

async function embedAgent(
  openai: OpenAI,
  agent: AgentConfigurationModel,
  logger: Logger
): Promise<number[]> {
  const input = buildAgentEmbeddingInput(agent);

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input,
  });

  const embedding = response.data[0]?.embedding ?? [];

  logger.info(
    {
      sId: agent.sId,
      workspaceId: agent.workspaceId,
      name: agent.name,
      model: EMBEDDING_MODEL,
      embeddingDimensions: embedding.length,
      promptTokens: response.usage?.prompt_tokens,
    },
    "Embedded agent"
  );

  return embedding;
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
 * Standalone script that lists every agent configuration for a given workspace
 * and computes an embedding for each one using the OpenAI API. Run with:
 *
 *   cd front && npx tsx cartography/list_agents.ts
 */
makeScript({}, async (_args, logger) => {
  const auth = await Authenticator.internalAdminForWorkspace(WORKSPACE_ID);

  const agents = await fetchActiveAgents(auth);

  logger.info(
    { count: agents.length, workspaceId: WORKSPACE_ID },
    "Fetched agent configurations"
  );

  const openai = await makeOpenAIClient(auth, logger);
  if (!openai) {
    return;
  }

  const embeddedAgents: { sId: string; embedding: number[] }[] = [];
  for (const agent of agents) {
    const embedding = await embedAgent(openai, agent, logger);
    if (embedding.length > 0) {
      embeddedAgents.push({ sId: agent.sId, embedding });
    }
  }

  if (embeddedAgents.length < 2) {
    logger.error(
      { count: embeddedAgents.length },
      "Need at least 2 embedded agents to run PCA."
    );
    return;
  }

  // Project the high-dimensional embeddings down to 2 dimensions via PCA.
  const pca = new PCA(embeddedAgents.map((a) => a.embedding));
  const scores = pca
    .predict(
      embeddedAgents.map((a) => a.embedding),
      { nComponents: 2 }
    )
    .to2DArray();

  const normalized = normalizeTo01(scores);

  const coordinatesByAgentId: Record<string, [number, number]> = {};
  embeddedAgents.forEach((agent, i) => {
    coordinatesByAgentId[agent.sId] = normalized[i];
  });

  const outputPath = path.join(__dirname, "agents.json");
  await writeFile(outputPath, JSON.stringify(coordinatesByAgentId, null, 2));

  logger.info(
    { count: embeddedAgents.length, outputPath },
    "Wrote agent 2D projection"
  );
});
