import {
  BatchEndpoint,
  type BatchRequest,
  type BatchStatus,
} from "@app/lib/model_constructors/batch/endpoint";
import {
  type MistralInputConfig,
  mistralConfigSchema,
} from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { WithMistralAIInputConverter } from "@app/lib/model_constructors/sdk/mistralai/converters/input";
import { responseToEvents } from "@app/lib/model_constructors/sdk/mistralai/converters/output/utils";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { NonDeltaResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { MISTRAL_API } from "@app/lib/model_constructors/types/provider_apis";
import { MISTRAL_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Mistral } from "@mistralai/mistralai";
import {
  ApiEndpoint,
  BatchJobStatus,
  type ChatCompletionResponse,
  type ChatCompletionStreamRequest,
  ChatCompletionStreamRequest$outboundSchema,
  chatCompletionResponseFromJSON,
} from "@mistralai/mistralai/models/components";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// A batch job references at most its input + output files.
const FILE_DELETE_CONCURRENCY = 2;

// One line of the JSONL output file the Batch API produces.
const mistralBatchOutputLineSchema = z.object({
  custom_id: z.string(),
  response: z
    .object({ status_code: z.number(), body: z.unknown() })
    .nullable()
    .optional(),
  error: z
    .object({ code: z.string().optional(), message: z.string() })
    .nullable()
    .optional(),
});

/**
 * The batch sibling of `MistralStream`: same input converter, but it talks to
 * the Mistral Batch API. The SDK accepts inlined requests (it uploads the input
 * file internally) and exposes the results as a downloadable JSONL file.
 */
export abstract class MistralBatch extends WithMistralAIInputConverter(
  BatchEndpoint<
    ChatCompletionStreamRequest,
    ChatCompletionResponse,
    MistralInputConfig
  >
) {
  static readonly providerId = MISTRAL_PROVIDER_ID;
  static readonly api = MISTRAL_API;

  static readonly configSchema = mistralConfigSchema;

  private readonly client: Mistral;

  constructor({ MISTRAL_API_KEY }: Credentials) {
    super();
    this.client = new Mistral({ apiKey: MISTRAL_API_KEY });
  }

  rawBatchOutputToEvents(
    result: ChatCompletionResponse
  ): NonDeltaResponseEvent[] {
    return responseToEvents(result, this.metadata());
  }

  async sendBatch(
    requests: Map<string, BatchRequest<MistralInputConfig>>
  ): Promise<string> {
    const batchRequests = Array.from(requests.entries()).map(
      ([customId, { payload, config }]) => ({
        customId,
        // The batch `body` is a passthrough record sent verbatim, so serialize
        // the request to its wire (snake_case) shape — the SDK only does that
        // for the streaming/non-batch paths. `stream` is forced off.
        body: ChatCompletionStreamRequest$outboundSchema.parse({
          ...this.buildRequestPayload(payload, config),
          stream: false,
        }),
      })
    );

    const job = await this.client.batch.jobs.create({
      model: this.constructor.modelId,
      endpoint: ApiEndpoint.RootV1ChatCompletions,
      requests: batchRequests,
    });
    return job.id;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const job = await this.client.batch.jobs.get({ jobId: batchId });
    switch (job.status) {
      case BatchJobStatus.Success:
        return "ready";
      case BatchJobStatus.Failed:
      case BatchJobStatus.TimeoutExceeded:
      case BatchJobStatus.Cancelled:
        return "aborted";
      case BatchJobStatus.Queued:
      case BatchJobStatus.Running:
      case BatchJobStatus.CancellationRequested:
        return "computing";
      // `status` is an open enum; treat any unknown future value as in progress.
      default:
        return "computing";
    }
  }

  async getBatchResult(
    batchId: string
  ): Promise<Map<string, NonDeltaResponseEvent[]>> {
    const job = await this.client.batch.jobs.get({ jobId: batchId });
    if (!job.outputFile) {
      throw new Error(`Mistral batch ${batchId} has no output file.`);
    }

    const stream = await this.client.files.download({ fileId: job.outputFile });
    const text = await new Response(stream).text();

    const batchResult = new Map<string, NonDeltaResponseEvent[]>();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = mistralBatchOutputLineSchema.safeParse(
        JSON.parse(trimmed)
      );
      if (!parsed.success) {
        throw new Error(
          `Failed to parse Mistral batch output line: ${fromError(parsed.error)}`
        );
      }

      const { custom_id, response, error } = parsed.data;
      if (error || !response) {
        batchResult.set(custom_id, [
          buildErrorEvent({
            metadata: this.metadata(),
            type: "server_error",
            message:
              error?.message ?? `No response for custom_id ${custom_id}.`,
          }),
        ]);
        continue;
      }

      const parsedResponse = chatCompletionResponseFromJSON(
        JSON.stringify(response.body)
      );
      if (!parsedResponse.ok) {
        throw new Error(
          `Failed to parse Mistral batch response for custom_id ${custom_id}: ${parsedResponse.error.message}`
        );
      }
      batchResult.set(
        custom_id,
        this.rawBatchOutputToEvents(parsedResponse.value)
      );
    }
    return batchResult;
  }

  async deleteBatch(batchId: string): Promise<boolean> {
    const job = await this.client.batch.jobs.get({ jobId: batchId });
    const fileIds = [job.inputFiles, job.outputFile]
      .flat()
      .filter((id): id is string => !!id);
    const results = await concurrentExecutor(
      fileIds,
      (fileId) => this.client.files.delete({ fileId }),
      { concurrency: FILE_DELETE_CONCURRENCY }
    );
    return results.every((result) => result.deleted);
  }
}
