import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { makeScript } from "@app/scripts/helpers";
import OpenAI from "openai";

const WORKSPACE_ID = "vigqnm0JoT";

// Using the smaller/cheaper OpenAI embedder for now. text-embedding-3-small
// natively outputs 1536 dimensions.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Standalone script that lists every agent configuration for a given workspace
 * and computes an embedding for each one using the OpenAI API. Run with:
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
    return;
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: credentials.OPENAI_BASE_URL || undefined,
  });

  for (const agent of agents) {
    // Build the text representation of the agent to embed.
    const input = [
      `Name: ${agent.name}`,
      `Description: ${agent.description}`,
      `Instructions: ${agent.instructions ?? ""}`,
    ].join("\n");

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
});
