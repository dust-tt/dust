import type {
  BatchRequest,
  BatchStatus,
} from "@app/lib/model_constructors/batch/endpoint";
import { BatchEndpoint } from "@app/lib/model_constructors/batch/endpoint";
import type { GoogleAiStudioInputConfig } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { WithGoogleGenAIInputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/input";
import { WithGoogleGenAIOutputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/output";
import { responseToEvents } from "@app/lib/model_constructors/sdk/google_genai/converters/output/utils";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { GOOGLE_AI_STUDIO_HOST } from "@app/lib/model_constructors/types/hosts";
import { GOOGLE_LAB } from "@app/lib/model_constructors/types/labs";
import type { NonDeltaResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { buildHttpStatusErrorEvent } from "@app/lib/model_constructors/utils/classify_http_status";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  GenerateContentParameters,
  InlinedRequest,
  InlinedResponse,
} from "@google/genai";
import { GoogleGenAI, JobState } from "@google/genai";

// Custom-id round-trips through each request's `metadata`, so results can be
// correlated back even though the batch API also preserves request order.
const CUSTOM_ID_METADATA_KEY = "custom_id";

// How many request payloads to build concurrently (each may fetch image parts).
const BUILD_PAYLOAD_CONCURRENCY = 8;

// Job states where results are available.
const READY_JOB_STATES: ReadonlySet<JobState> = new Set([
  JobState.JOB_STATE_SUCCEEDED,
  JobState.JOB_STATE_PARTIALLY_SUCCEEDED,
]);

// Job states that are permanently terminal but produce no results.
const ABORTED_JOB_STATES: ReadonlySet<JobState> = new Set([
  JobState.JOB_STATE_FAILED,
  JobState.JOB_STATE_CANCELLED,
  JobState.JOB_STATE_EXPIRED,
]);

/**
 * The batch sibling of `GoogleAiStudioStream`: same input/output converters (so
 * batch requests and event conversion match streaming), but it talks to the
 * Gemini Batches API with inlined requests and defines `sendBatch` instead of
 * `streamRaw`.
 */
export abstract class GoogleAiStudioBatch extends WithGoogleGenAIInputConverter(
  WithGoogleGenAIOutputConverter(
    BatchEndpoint<
      GenerateContentParameters,
      InlinedResponse,
      GoogleAiStudioInputConfig
    >
  )
) {
  static readonly lab = GOOGLE_LAB;
  static readonly host = GOOGLE_AI_STUDIO_HOST;

  private readonly client: GoogleGenAI;

  constructor({ GOOGLE_AI_STUDIO_API_KEY }: Credentials) {
    super();
    this.client = new GoogleGenAI({ apiKey: GOOGLE_AI_STUDIO_API_KEY });
  }

  rawBatchOutputToEvents(result: InlinedResponse): NonDeltaResponseEvent[] {
    if (result.error) {
      return [
        buildHttpStatusErrorEvent({
          metadata: this.metadata(),
          status: result.error.code,
          provider: "Google",
          detail:
            result.error.message ?? "The batch request failed without details.",
          originalError: result.error,
        }),
      ];
    }
    if (!result.response) {
      return [
        buildErrorEvent({
          errorSource: "unknown",
          metadata: this.metadata(),
          type: "unknown_error",
          message:
            "The batch request returned neither a response nor an error.",
        }),
      ];
    }
    return responseToEvents(result.response, this.metadata(), this);
  }

  async sendBatch(
    requests: Map<string, BatchRequest<GoogleAiStudioInputConfig>>
  ): Promise<string> {
    const entries = Array.from(requests.entries());
    const inlinedRequests: InlinedRequest[] = await concurrentExecutor(
      entries,
      async ([customId, { payload, config }]) => {
        const { contents, config: requestConfig } =
          await this.buildRequestPayload(payload, config);
        return {
          model: this.constructor.model,
          contents,
          config: requestConfig,
          metadata: { [CUSTOM_ID_METADATA_KEY]: customId },
        };
      },
      { concurrency: BUILD_PAYLOAD_CONCURRENCY }
    );

    const batch = await this.client.batches.create({
      model: this.constructor.model,
      src: inlinedRequests,
    });

    if (!batch.name) {
      throw new Error("Gemini batch creation did not return a job name.");
    }
    return batch.name;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.client.batches.get({ name: batchId });
    if (batch.state && READY_JOB_STATES.has(batch.state)) {
      return "ready";
    }
    if (batch.state && ABORTED_JOB_STATES.has(batch.state)) {
      return "aborted";
    }
    return "computing";
  }

  async getBatchResult(
    batchId: string
  ): Promise<Map<string, NonDeltaResponseEvent[]>> {
    const batch = await this.client.batches.get({ name: batchId });
    const inlinedResponses = batch.dest?.inlinedResponses ?? [];

    const batchResult = new Map<string, NonDeltaResponseEvent[]>();
    for (const response of inlinedResponses) {
      const customId = response.metadata?.[CUSTOM_ID_METADATA_KEY];
      if (!customId) {
        throw new Error(
          "Gemini batch response is missing its custom_id metadata."
        );
      }
      batchResult.set(customId, this.rawBatchOutputToEvents(response));
    }
    return batchResult;
  }

  async deleteBatch(batchId: string): Promise<boolean> {
    await this.client.batches.delete({ name: batchId });
    return true;
  }
}
