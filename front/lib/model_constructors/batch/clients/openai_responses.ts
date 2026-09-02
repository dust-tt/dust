import type {
  BatchRequest,
  BatchStatus,
} from "@app/lib/model_constructors/batch/endpoint";
import { BatchEndpoint } from "@app/lib/model_constructors/batch/endpoint";
import { openAIReasoningSummaryForModel } from "@app/lib/model_constructors/providers/openai/reasoning_summary";
import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { responseToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { OPENAI_RESPONSES_HOST } from "@app/lib/model_constructors/types/hosts";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { OPENAI_LAB } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { NonDeltaResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { buildHttpStatusErrorEvent } from "@app/lib/model_constructors/utils/classify_http_status";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
// Do not remove: front-api routes call into this client for the similar skill
// and similar agent discovery features. Without an explicit version front-api can silently
// resolve a stale, incompatible `openai` version through node_modules hoisting.
import { OpenAI, toFile } from "openai";
import type {
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// The Responses endpoint and completion window for batch jobs.
const BATCH_ENDPOINT_URL = "/v1/responses";
const BATCH_COMPLETION_WINDOW = "24h";

// One line of the JSONL output file the Batch API produces.
const openAIBatchOutputLineSchema = z.object({
  custom_id: z.string(),
  response: z.object({ status_code: z.number(), body: z.unknown() }).nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

function isOpenAIResponse(value: unknown): value is OpenAIResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "output" in value &&
    Array.isArray(value.output)
  );
}

/**
 * The batch sibling of `OpenAIResponsesStream`: same input/output converters,
 * but it talks to the OpenAI Batch API. Unlike Anthropic/Gemini (inlined
 * requests), OpenAI batches are file-based: upload a JSONL of requests, create
 * the job, then download a JSONL of responses.
 */
export abstract class OpenAIResponsesBatch extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    BatchEndpoint<ResponseCreateParamsNonStreaming, OpenAIResponse>
  )
) {
  static readonly lab = OPENAI_LAB;
  static readonly host = OPENAI_RESPONSES_HOST;

  protected abstract readonly baseUrl: string;

  private readonly apiKey: string | undefined;
  private _client: OpenAI | undefined;

  constructor({ OPENAI_API_KEY }: Credentials) {
    super();
    this.apiKey = OPENAI_API_KEY;
  }

  protected override reasoningSummaryForModel(
    model: Model,
    conciseReasoningSummary: boolean
  ) {
    return openAIReasoningSummaryForModel(model, conciseReasoningSummary);
  }

  // Lazy: `baseUrl` is an abstract field, only set after subclass initializers run.
  private get client(): OpenAI {
    this._client ??= new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
    return this._client;
  }

  rawBatchOutputToEvents(result: OpenAIResponse): NonDeltaResponseEvent[] {
    return responseToEvents(result, this.metadata(), this);
  }

  async sendBatch(
    requests: Map<string, BatchRequest<InputConfig>>
  ): Promise<string> {
    const lines = Array.from(requests.entries()).map(
      ([customId, { payload, config }]) => {
        // `buildRequestPayload` omits `stream`; force it off for the batch body.
        const body: ResponseCreateParamsNonStreaming = {
          ...this.buildRequestPayload(payload, config),
          stream: false,
        };
        return JSON.stringify({
          custom_id: customId,
          method: "POST",
          url: BATCH_ENDPOINT_URL,
          body,
        });
      }
    );

    const file = await toFile(Buffer.from(lines.join("\n")), "batch.jsonl", {
      type: "application/jsonl",
    });
    const uploadedFile = await this.client.files.create(
      { file, purpose: "batch" },
      // Clear the default JSON Content-Type so the SDK sends multipart/form-data.
      { headers: { "Content-Type": null } }
    );

    const batch = await this.client.batches.create({
      input_file_id: uploadedFile.id,
      endpoint: BATCH_ENDPOINT_URL,
      completion_window: BATCH_COMPLETION_WINDOW,
    });
    return batch.id;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.client.batches.retrieve(batchId);
    switch (batch.status) {
      case "completed":
        return "ready";
      case "validating":
      case "in_progress":
      case "finalizing":
      case "cancelling":
        return "computing";
      case "failed":
      case "expired":
      case "cancelled":
        return "aborted";
      // `status` comes from the OpenAI API; tolerate unknown future values
      // instead of crashing — treat them as still in progress.
      default:
        assertNeverAndIgnore(batch.status);
        return "computing";
    }
  }

  async getBatchResult(
    batchId: string
  ): Promise<Map<string, NonDeltaResponseEvent[]>> {
    const batch = await this.client.batches.retrieve(batchId);
    if (!batch.output_file_id) {
      throw new Error(`OpenAI batch ${batchId} has no output file.`);
    }

    const fileContent = await this.client.files.content(batch.output_file_id);
    const text = await fileContent.text();

    const batchResult = new Map<string, NonDeltaResponseEvent[]>();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = openAIBatchOutputLineSchema.safeParse(JSON.parse(trimmed));
      if (!parsed.success) {
        throw new Error(
          `Failed to parse OpenAI batch output line: ${fromError(parsed.error)}`
        );
      }

      const { custom_id, response, error } = parsed.data;
      if (error || !response) {
        batchResult.set(custom_id, [
          buildHttpStatusErrorEvent({
            metadata: this.metadata(),
            status: response?.status_code,
            provider: "OpenAI",
            detail: error?.message ?? `No response for custom_id ${custom_id}.`,
            originalError: error,
          }),
        ]);
        continue;
      }
      if (!isOpenAIResponse(response.body)) {
        throw new Error(`Unexpected response body for custom_id ${custom_id}.`);
      }
      batchResult.set(custom_id, this.rawBatchOutputToEvents(response.body));
    }
    return batchResult;
  }

  async deleteBatch(batchId: string): Promise<boolean> {
    const batch = await this.client.batches.retrieve(batchId);
    const fileIds = [batch.input_file_id, batch.output_file_id].filter(
      (id): id is string => !!id
    );
    // At most 2 files (input + output).
    const results = await Promise.all(
      fileIds.map((fileId) => this.client.files.delete(fileId))
    );
    return results.every((result) => result.deleted);
  }
}
