import AnthropicClient from "@anthropic-ai/sdk";
import type { MessageBatchResult } from "@anthropic-ai/sdk/resources/messages/batches";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  BatchEndpoint,
  type BatchRequest,
  type BatchStatus,
} from "@app/lib/model_constructors/batch/endpoint";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { WithAnthropicAIInputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import { WithAnthropicAIOutputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output";
import { batchResultToEvents } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { NonDeltaResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { ANTHROPIC_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";

/**
 * The batch sibling of `AnthropicStream`: same input/output converters (so batch
 * requests and event conversion are identical to streaming), but it talks to
 * the Messages Batches API and defines `sendBatch` instead of `streamRaw`.
 *
 * `buildRequestPayload` (from the input converter) already omits `stream`, so
 * the per-request payload drops straight into a batch request.
 */
export abstract class AnthropicBatch extends WithAnthropicAIInputConverter(
  WithAnthropicAIOutputConverter(
    BatchEndpoint<
      MessageCreateParamsNonStreaming,
      MessageBatchResult,
      AnthropicInputConfig
    >
  )
) {
  static readonly providerId = ANTHROPIC_PROVIDER_ID;
  static readonly api = ANTHROPIC_API;

  private readonly client: AnthropicClient;

  constructor({ ANTHROPIC_API_KEY }: Credentials) {
    super();
    this.client = new AnthropicClient({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  rawBatchOutputToEvents(result: MessageBatchResult): NonDeltaResponseEvent[] {
    return batchResultToEvents(result, this.metadata(), this);
  }

  async sendBatch(
    requests: Map<string, BatchRequest<AnthropicInputConfig>>
  ): Promise<string> {
    const batchRequests = Array.from(requests.entries()).map(
      ([customId, { payload, config }]) => ({
        custom_id: customId,
        params: this.buildRequestPayload(payload, config),
      })
    );

    const batch = await this.client.messages.batches.create({
      requests: batchRequests,
    });
    return batch.id;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    return batch.processing_status === "ended" ? "ready" : "computing";
  }

  async getBatchResult(
    batchId: string
  ): Promise<Map<string, NonDeltaResponseEvent[]>> {
    const results = await this.client.messages.batches.results(batchId);

    const batchResult = new Map<string, NonDeltaResponseEvent[]>();
    for await (const item of results) {
      batchResult.set(item.custom_id, this.rawBatchOutputToEvents(item.result));
    }
    return batchResult;
  }

  async deleteBatch(batchId: string): Promise<boolean> {
    await this.client.messages.batches.delete(batchId);
    return true;
  }
}
