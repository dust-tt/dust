import { LangfuseClient } from "@langfuse/client";

import type { LLMTrace } from "@app/lib/api/llm/traces/types";
import logger from "@app/logger/logger";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

let langfuseClient: LangfuseClient | null = null;

function isLangfuseEnabled(): boolean {
  return (
    EnvironmentConfig.getOptionalEnvVariable(
      "LANGFUSE_ENABLED"
    )?.toLowerCase() === "true"
  );
}

function getLangfuseClient(): LangfuseClient | null {
  if (!isLangfuseEnabled()) {
    return null;
  }

  if (!langfuseClient) {
    langfuseClient = new LangfuseClient({
      publicKey: EnvironmentConfig.getEnvVariable("LANGFUSE_PUBLIC_KEY"),
      secretKey: EnvironmentConfig.getEnvVariable("LANGFUSE_SECRET_KEY"),
      baseUrl: EnvironmentConfig.getOptionalEnvVariable("LANGFUSE_BASE_URL"),
    });
  }

  return langfuseClient;
}

/**
 * Ensures a Langfuse dataset exists, creating it if necessary.
 * This is idempotent - calling it multiple times for the same dataset is safe.
 */
async function ensureLangfuseDatasetExists(
  client: LangfuseClient,
  datasetName: string
): Promise<void> {
  try {
    await client.api.datasets.get(datasetName);
  } catch {
    // Dataset doesn't exist, create it
    await client.api.datasets.create({
      name: datasetName,
      description: `Negative feedback traces for ${datasetName.replace("-feedback", "")} agent`,
    });
  }
}

/**
 * Creates a unique key for deduplication of dataset items.
 * This is used as the item ID for upsert behavior.
 */
function createUniqueItemId(feedbackId: number, runId: string): string {
  return `feedback_${feedbackId}_${runId}`;
}

interface AddTraceToDatasetParams {
  datasetName: string;
  trace: LLMTrace;
  feedbackId: number;
  runId: string;
}

/**
 * Adds a trace to a Langfuse dataset for later annotation.
 * Uses the item ID for upsert behavior to ensure idempotency.
 *
 * @param params - The parameters for adding the trace
 * @returns true if the trace was added, false if it was skipped (disabled or error)
 */
export async function addTraceToLangfuseDataset(
  params: AddTraceToDatasetParams
): Promise<boolean> {
  const { datasetName, trace, feedbackId, runId } = params;

  const client = getLangfuseClient();
  if (!client) {
    return false;
  }

  const itemId = createUniqueItemId(feedbackId, runId);

  try {
    // Ensure dataset exists
    await ensureLangfuseDatasetExists(client, datasetName);

    // Create dataset item with trace data
    // Using the id field enables upsert behavior for idempotency
    await client.api.datasetItems.create({
      datasetName,
      id: itemId,
      input: trace.input,
      expectedOutput: trace.output,
      metadata: {
        feedbackId,
        runId,
        traceId: trace.traceId,
        workspaceId: trace.workspaceId,
        context: trace.context,
        modelId: trace.metadata.modelId,
        durationMs: trace.metadata.durationMs,
        hasError: !!trace.error,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info(
      {
        datasetName,
        feedbackId,
        runId,
        traceId: trace.traceId,
        workspaceId: trace.workspaceId,
        itemId,
      },
      "[Langfuse] Added trace to dataset"
    );

    return true;
  } catch (error) {
    // Log error but don't throw - Langfuse failures should not block feedback submission
    logger.error(
      {
        datasetName,
        feedbackId,
        runId,
        itemId,
        error,
      },
      "[Langfuse] Failed to add trace to dataset"
    );
    return false;
  }
}

/**
 * Placeholder for flush operation.
 * The LangfuseClient from @langfuse/client handles batching internally,
 * but this function is provided for API consistency if needed in the future.
 */
export async function flushLangfuse(): Promise<void> {
  // LangfuseClient handles batching internally
  // This function is provided for API consistency
}
