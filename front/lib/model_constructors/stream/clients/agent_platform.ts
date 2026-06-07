import type {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { WithAnthropicInputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/input";
import { WithAnthropicOutputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/providers/anthropic/converters/output/utils";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { LargeLanguageModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { AGENT_PLATFORM_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";

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

const REGION_MAPPING: Record<Region, string | null> = {
  europe: "europe-west1",
  global: null,
  us: null,
};

// The Anthropic-on-native-Messages streaming client: provider/api identity, the
// broad provider-default `configSchema` (narrowed per model), the SDK wiring,
// and `streamRaw`. The shared input/output converter mixins are applied here so
// the batch client reuses the exact same payload/event conversion.
export abstract class AgentPlatformStream extends WithAnthropicInputConverter(
  WithAnthropicOutputConverter(
    StreamEndpoint<MessageCreateParamsNonStreaming, RawMessageStreamEvent>
  )
) {
  static readonly providerId = ANTHROPIC_PROVIDER_ID;
  static readonly api = AGENT_PLATFORM_API;

  static readonly configSchema: z.ZodType<z.infer<typeof configSchema>> =
    configSchema;

  static readonly byok = true;

  private readonly client: AnthropicVertex;

  constructor(credentials: Credentials) {
    super(credentials);
    this.client = new AnthropicVertex({
      region: REGION_MAPPING[this.constructor.region],
      projectId: credentials.AGENT_PLATFORM_PROJECT_ID,
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
