import OpenAI from "openai";

import { makeScript } from "@app/scripts/helpers";
import { dustManagedCredentials } from "@app/types";

interface ToolInfo {
  sId: string | null;
  name: string | null;
  type: string | null;
  internalMCPServerId: string | null;
  remoteMCPServerUrl: string | null;
  remoteMCPServerName: string | null;
  remoteMCPServerDescription: string | null;
  timeFrame: unknown | null;
  additionalConfiguration: unknown | null;
  descriptionOverride: string | null;
}

interface ParsedAgent {
  workspaceName: string;
  agentSid: string;
  agentName: string;
  description: string | null;
  instructions: string | null;
  instructionsLength: number | null;
  tools: ToolInfo[];
  tableIds: string[];
  childAgents: string[];
}

interface AgentWithEmbedding {
  agentSid: string;
  agentName: string;
  workspaceName: string;
  instructionsPreview: string;
  embedding: number[];
}

const MAX_PROMPT_LENGTH = 5000;
const DEFAULT_MODEL = "text-embedding-3-large";

makeScript(
  {
    input: {
      type: "string",
      demandOption: true,
      description: "Input JSON file path (parsed agents)",
    },
    output: {
      type: "string",
      demandOption: true,
      description: "Output file path for embeddings",
    },
    model: {
      type: "string",
      default: DEFAULT_MODEL,
      description: "OpenAI embedding model to use",
    },
    batchSize: {
      type: "number",
      default: 100,
      description: "Batch size for embedding requests (max 2048 for OpenAI)",
    },
    dimensions: {
      type: "number",
      default: 1536,
      description: "Embedding dimensions (for text-embedding-3-* models)",
    },
    limit: {
      type: "number",
      default: 0,
      description: "Limit number of agents to process (0 = no limit)",
    },
  },
  async ({ input, output, model, batchSize, dimensions, limit }, logger) => {
    const fs = await import("fs/promises");

    const { OPENAI_API_KEY, OPENAI_BASE_URL } = dustManagedCredentials();
    if (!OPENAI_API_KEY) {
      throw new Error(
        "DUST_MANAGED_OPENAI_API_KEY environment variable is required"
      );
    }

    const client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    });

    logger.info({ model, dimensions }, "Using OpenAI embedding model");

    const jsonContent = await fs.readFile(input, "utf-8");
    const agents = JSON.parse(jsonContent) as ParsedAgent[];

    logger.info({ agentCount: agents.length }, "Loaded agents");

    // Filter agents with non-empty instructions
    const agentsWithInstructions = agents.filter(
      (agent) => agent.instructions && agent.instructions.trim().length > 0
    );

    // Apply limit if specified
    const agentsToProcess =
      limit > 0
        ? agentsWithInstructions.slice(0, limit)
        : agentsWithInstructions;

    logger.info(
      {
        agentsWithInstructions: agentsWithInstructions.length,
        agentsToProcess: agentsToProcess.length,
        limit: limit > 0 ? limit : "none",
      },
      "Agents to process"
    );

    const results: AgentWithEmbedding[] = [];
    let processed = 0;

    // Process in batches
    for (let i = 0; i < agentsToProcess.length; i += batchSize) {
      const batch = agentsToProcess.slice(i, i + batchSize);

      const texts = batch.map((agent) =>
        (agent.instructions ?? "").slice(0, MAX_PROMPT_LENGTH)
      );

      // Call OpenAI embeddings API
      const response = await client.embeddings.create({
        model,
        input: texts,
        dimensions,
      });

      // Extract embeddings from response
      for (let j = 0; j < batch.length; j++) {
        const agent = batch[j];
        const embedding = response.data[j].embedding;

        results.push({
          agentSid: agent.agentSid,
          agentName: agent.agentName,
          workspaceName: agent.workspaceName,
          instructionsPreview: texts[j].slice(0, 200),
          embedding,
        });
      }

      processed += batch.length;
      logger.info(
        {
          processed,
          total: agentsToProcess.length,
          percentage: Math.round((processed / agentsToProcess.length) * 100),
        },
        "Progress"
      );
    }

    // Save results
    await fs.writeFile(output, JSON.stringify(results, null, 2), "utf-8");

    logger.info(
      {
        totalAgents: agents.length,
        agentsWithInstructions: agentsWithInstructions.length,
        embeddingsComputed: results.length,
        embeddingDimension: results[0]?.embedding.length ?? 0,
        outputPath: output,
      },
      "Embedding computation completed"
    );
  }
);
