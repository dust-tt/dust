import {
  BatchEndpoint,
  type BatchRequest,
  type BatchStatus,
} from "@app/lib/model_constructors/batch/endpoint";
import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { responseToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { NonDeltaResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { OPENAI_RESPONSES_API } from "@app/lib/model_constructors/types/provider_apis";
import { OPENAI_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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
  static readonly providerId = OPENAI_PROVIDER_ID;
  static readonly api = OPENAI_RESPONSES_API;

  private readonly client: OpenAI;

  constructor({ OPENAI_API_KEY, OPENAI_BASE_URL }: Credentials) {
    super();
    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
    });
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
          buildErrorEvent({
            metadata: this.metadata(),
            type: "server_error",
            message:
              error?.message ?? `No response for custom_id ${custom_id}.`,
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
