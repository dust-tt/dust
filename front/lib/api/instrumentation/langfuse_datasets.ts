import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { LangfuseClient } from "@langfuse/client";

let langfuseClient: LangfuseClient | null = null;

function getLangfuseClient(): LangfuseClient | null {
  if (!config.isLangfuseEnabled()) {
    return null;
  }

  langfuseClient ??= new LangfuseClient(config.getLangfuseClientConfig());

  return langfuseClient;
}

function hasProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function isLangfuseNotFoundError(error: unknown): error is { statusCode: 404 } {
  return hasProperty(error, "statusCode") && error.statusCode === 404;
}

/**
 * Ensures a Langfuse dataset exists, creating it if necessary.
 */
async function ensureLangfuseDatasetExists(
  client: LangfuseClient,
  datasetName: string
): Promise<Result<undefined, Error>> {
  try {
    await client.api.datasets.get(datasetName);
    return new Ok(undefined);
  } catch (error) {
    if (!isLangfuseNotFoundError(error)) {
      return new Err(normalizeError(error));
    }
  }

  try {
    // Dataset doesn't exist, create it
    await client.api.datasets.create({
      name: datasetName,
      description: `Negative feedback traces for ${datasetName.replace("-feedback", "")} agent`,
    });
    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

interface AddTraceToDatasetParams {
  datasetName: string;
  dustTraceId: string;
  feedbackId: number;
  workspaceId: string;
  feedbackContent: string | null;
  thumbDirection: "up" | "down";
}

type LangfuseTraceSummary = {
  id: string;
  input: unknown;
  output: unknown;
};

/**
 * Fetches a trace from Langfuse by searching for its dustTraceId in metadata.
 *
 * Since traces are stored in Langfuse with our dustTraceId in their metadata,
 * we can find them by filtering on the metadata.dustTraceId field.
 */
async function fetchTraceByDustTraceId(
  client: LangfuseClient,
  dustTraceId: string
): Promise<Result<LangfuseTraceSummary | null, Error>> {
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

  let traces: Awaited<ReturnType<typeof client.api.trace.list>>;
  try {
    traces = await client.api.trace.list({
      filter,
      limit: 1,
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }

  const trace = traces.data?.[0];
  if (!trace) {
    return new Ok(null);
  }

  return new Ok({
    id: trace.id,
    input: trace.input,
    output: trace.output,
  });
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
  const {
    datasetName,
    dustTraceId,
    feedbackId,
    workspaceId,
    feedbackContent,
    thumbDirection,
  } = params;

  const client = getLangfuseClient();
  if (!client) {
    return false;
  }

  const itemId = `feedback_${feedbackId}_${dustTraceId}`;

  // Ensure dataset exists
  const datasetResult = await ensureLangfuseDatasetExists(client, datasetName);
  if (datasetResult.isErr()) {
    logger.error(
      {
        datasetName,
        feedbackId,
        dustTraceId,
        workspaceId,
        error: datasetResult.error,
      },
      "[Langfuse] Failed to ensure dataset exists"
    );
    return false;
  }

  // Fetch the trace from Langfuse by searching for dustTraceId in metadata
  const traceResult = await fetchTraceByDustTraceId(client, dustTraceId);
  if (traceResult.isErr()) {
    logger.error(
      {
        datasetName,
        feedbackId,
        dustTraceId,
        workspaceId,
        error: traceResult.error,
      },
      "[Langfuse] Failed to fetch trace by dustTraceId"
    );
    return false;
  }
  const trace = traceResult.value;

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

  try {
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
        feedbackContent,
        thumbDirection,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Log error but don't throw - Langfuse failures should not block feedback submission
    logger.error(
      {
        datasetName,
        feedbackId,
        dustTraceId,
        itemId,
        error: normalizeError(error),
      },
      "[Langfuse] Failed to add trace to dataset"
    );
    return false;
  }

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
}
