import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import OpenAI from "openai";

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
): Promise<void> {
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
      embeddingPreview: embedding.slice(0, 8),
      promptTokens: response.usage?.prompt_tokens,
    },
    "Embedded agent"
  );
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

  for (const agent of agents) {
    await embedAgent(openai, agent, logger);
  }
});
