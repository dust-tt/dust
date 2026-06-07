import AnthropicClient from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { WithAnthropicInputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/input";
import { WithAnthropicOutputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/providers/anthropic/converters/output/utils";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { LargeLanguageModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { ANTHROPIC_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";

import { z } from "zod";

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([
        ...ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
        "none",
      ]),
    })
    .optional(),
});

// The Anthropic-on-native-Messages streaming client: provider/api identity, the
// broad provider-default `configSchema` (narrowed per model), the SDK wiring,
// and `streamRaw`. The shared input/output converter mixins are applied here so
// the batch client reuses the exact same payload/event conversion.
export abstract class AnthropicStream extends WithAnthropicInputConverter(
  WithAnthropicOutputConverter(
    StreamEndpoint<MessageCreateParamsNonStreaming, RawMessageStreamEvent>
  )
) {
  static readonly providerId = ANTHROPIC_PROVIDER_ID;
  static readonly api = ANTHROPIC_API;

  static readonly configSchema: z.ZodType<z.infer<typeof configSchema>> =
    configSchema;

  static readonly byok = true;

  private readonly client: AnthropicClient;

  constructor(credentials: Credentials) {
    super(credentials);
    this.client = new AnthropicClient({
      apiKey: credentials.ANTHROPIC_API_KEY,
    });
  }

  async *streamRaw(
    input: MessageCreateParamsNonStreaming
  ): AsyncGenerator<RawMessageStreamEvent> {
    // `buildRequestPayload` is shared with batch and so omits `stream`; opt into
    // streaming here, at the point the request is actually sent.
    const streamingInput: MessageCreateParamsStreaming = {
      ...input,
      stream: true,
    };
    const stream = this.client.messages.stream(streamingInput);

    // The Anthropic SDK reuses and mutates event objects throughout the stream,
    // so we deep-copy each event to prevent downstream consumers from seeing stale data.
    for await (const event of stream) {
      yield structuredClone(event);
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<RawMessageStreamEvent>
  ): AsyncGenerator<LargeLanguageModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
