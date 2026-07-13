import AnthropicClient from "@anthropic-ai/sdk";
import type {
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  type AnthropicInputConfig,
  anthropicConfigSchema,
} from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { WithAnthropicAIInputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import { WithAnthropicAIOutputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { ANTHROPIC_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";

export abstract class AnthropicStream extends WithAnthropicAIInputConverter(
  WithAnthropicAIOutputConverter(
    StreamEndpoint<
      MessageCreateParamsNonStreaming,
      BetaRawMessageStreamEvent,
      AnthropicInputConfig
    >
  )
) {
  static readonly providerId = ANTHROPIC_PROVIDER_ID;
  static readonly api = ANTHROPIC_API;

  static readonly configSchema = anthropicConfigSchema;

  private readonly client: AnthropicClient;

  constructor({ ANTHROPIC_API_KEY }: Credentials) {
    super();
    this.client = new AnthropicClient({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async *streamRaw(
    input: MessageCreateParamsNonStreaming
  ): AsyncGenerator<BetaRawMessageStreamEvent> {
    // `buildRequestPayload` is shared with batch and omits `stream`; the beta
    // `.stream()` opts in. Non-beta payloads are assignable to the beta params.
    const streamingInput: BetaMessageStreamParams = {
      ...input,
      cache_control: { type: "ephemeral" },
    };
    const stream = this.client.beta.messages.stream(streamingInput);

    // The SDK reuses and mutates event objects, so deep-copy each one.
    for await (const event of stream) {
      yield structuredClone(event);
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<BetaRawMessageStreamEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
