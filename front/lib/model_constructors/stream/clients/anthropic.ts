import AnthropicClient from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { WithAnthropicInputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/input";
import { WithAnthropicOutputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/providers/anthropic/converters/output/utils";
import {
  type AnthropicInputConfig,
  anthropicConfigSchema,
} from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { ANTHROPIC_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";

export abstract class AnthropicStream extends WithAnthropicInputConverter(
  WithAnthropicOutputConverter(
    StreamEndpoint<
      MessageCreateParamsNonStreaming,
      RawMessageStreamEvent,
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
  ): AsyncGenerator<RawMessageStreamEvent> {
    // `buildRequestPayload` is shared with batch and omits `stream`; opt in here.
    const streamingInput: MessageCreateParamsStreaming = {
      ...input,
      stream: true,
      cache_control: { type: "ephemeral" },
    };
    const stream = this.client.messages.stream(streamingInput);

    // The SDK reuses and mutates event objects, so deep-copy each one.
    for await (const event of stream) {
      yield structuredClone(event);
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<RawMessageStreamEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
