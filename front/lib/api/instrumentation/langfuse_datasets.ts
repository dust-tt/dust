import { LangfuseClient } from "@langfuse/client";
import { NotFoundError } from "@langfuse/core";

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

  langfuseClient ??= new LangfuseClient({
    publicKey: EnvironmentConfig.getEnvVariable("LANGFUSE_PUBLIC_KEY"),
    secretKey: EnvironmentConfig.getEnvVariable("LANGFUSE_SECRET_KEY"),
    baseUrl: EnvironmentConfig.getOptionalEnvVariable("LANGFUSE_BASE_URL"),
  });

  return langfuseClient;
}

/**
 * Ensures a Langfuse dataset exists, creating it if necessary.
 */
async function ensureLangfuseDatasetExists(
  client: LangfuseClient,
  datasetName: string
): Promise<void> {
  try {
    await client.api.datasets.get(datasetName);
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
    // Dataset doesn't exist, create it
    await client.api.datasets.create({
      name: datasetName,
      description: `Negative feedback traces for ${datasetName.replace("-feedback", "")} agent`,
    });
  }
}

interface AddTraceToDatasetParams {
  datasetName: string;
  dustTraceId: string;
  feedbackId: number;
  workspaceId: string;
}

/**
 * Fetches a trace from Langfuse by searching for its dustTraceId in metadata.
 *
 * Since traces are stored in Langfuse with our dustTraceId in their metadata,
 * we can find them by filtering on the metadata.dustTraceId field.
 */
async function fetchTraceByDustTraceId(
  client: LangfuseClient,
  dustTraceId: string
): Promise<{ id: string; input: unknown; output: unknown } | null> {
  // Use Langfuse's advanced filtering to find trace by metadata.dustTraceId
  const filter = JSON.stringify([
    {
      type: "stringObject",
      column: "metadata",
      key: "dustTraceId",
      operator: "=",
      value: dustTraceId,
    },
  ]);

  const traces = await client.api.trace.list({
    filter,
    limit: 1,
  });

  if (!traces.data || traces.data.length === 0) {
    return null;
  }

  const trace = traces.data[0];
  return {
    id: trace.id,
    input: trace.input,
    output: trace.output,
  };
}

/**
 * Adds a trace to a Langfuse dataset by fetching the trace from Langfuse
 * (searching by dustTraceId metadata) and creating a dataset item with its input/output data.
 *
 * @param params - The parameters for adding the trace
 * @returns true if the trace was added, false if it was skipped (disabled or error)
 */
export async function addTraceToLangfuseDataset(
  params: AddTraceToDatasetParams
): Promise<boolean> {
  const { datasetName, dustTraceId, feedbackId, workspaceId } = params;

  const client = getLangfuseClient();
  if (!client) {
    return false;
  }

  const itemId = `feedback_${feedbackId}_${dustTraceId}`;

  try {
    // Ensure dataset exists
    await ensureLangfuseDatasetExists(client, datasetName);

    // Fetch the trace from Langfuse by searching for dustTraceId in metadata
    const trace = await fetchTraceByDustTraceId(client, dustTraceId);

    if (!trace) {
      logger.warn(
        {
          datasetName,
          feedbackId,
          dustTraceId,
          workspaceId,
        },
        "[Langfuse] Trace not found by dustTraceId metadata"
      );
      return false;
    }

    // Create dataset item with trace data
    // sourceTraceId links to the trace in Langfuse UI for reference
    await client.api.datasetItems.create({
      datasetName,
      id: itemId,
      input: trace.input,
      expectedOutput: trace.output,
      sourceTraceId: trace.id,
      metadata: {
        feedbackId,
        dustTraceId,
        workspaceId,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info(
      {
        datasetName,
        feedbackId,
        dustTraceId,
        langfuseTraceId: trace.id,
        workspaceId,
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
        dustTraceId,
        itemId,
        error,
      },
      "[Langfuse] Failed to add trace to dataset"
    );
    return false;
  }
}
