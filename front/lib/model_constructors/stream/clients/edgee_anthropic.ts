import AnthropicClient from "@anthropic-ai/sdk";
import type {
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type {
  Model as HostModel,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { anthropicConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { EDGEE_GATEWAY_BASE_URL } from "@app/lib/model_constructors/providers/edgee/base_url";
import { WithAnthropicAIInputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import { WithAnthropicAIOutputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { EDGEE_HOST } from "@app/lib/model_constructors/types/hosts";
import { ANTHROPIC_LAB } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";

// Anthropic models served through Edgee's Anthropic-compatible `/v1/messages` gateway API.
/**
 * @cc [owner:pmilliotte,label:security] edgee-calls-carry-only-the-edgee-key
 * Requests MUST authenticate with `EDGEE_API_KEY` alone. Without it the client MUST send no key,
 * never `ANTHROPIC_API_KEY` from the credentials or the SDK's environment fallback.
 */
export abstract class EdgeeAnthropicStream extends WithAnthropicAIInputConverter(
  WithAnthropicAIOutputConverter(
    StreamEndpoint<
      MessageCreateParamsNonStreaming,
      BetaRawMessageStreamEvent,
      AnthropicInputConfig
    >
  )
) {
  static readonly lab = ANTHROPIC_LAB;
  static readonly host = EDGEE_HOST;

  static readonly configSchema = anthropicConfigSchema;

  private readonly client: AnthropicClient;

  constructor({ EDGEE_API_KEY }: Credentials) {
    super();
    this.client = new AnthropicClient({
      // `null`, not `undefined`: the SDK would otherwise read ANTHROPIC_API_KEY from the env.
      apiKey: EDGEE_API_KEY ?? null,
      baseURL: EDGEE_GATEWAY_BASE_URL,
      // The agent loop owns retries so every attempt is observable and billed from the usage
      // reported by that exact attempt.
      maxRetries: 0,
    });
  }

  modelToHostModel = (modelId: Model): HostModel => `anthropic/${modelId}`;

  async *streamRaw(
    input: MessageCreateParamsNonStreaming
  ): AsyncGenerator<BetaRawMessageStreamEvent> {
    const streamingInput: BetaMessageStreamParams = { ...input };
    const stream = this.client.beta.messages.stream(streamingInput);

    // SDK mutates/reuses events; deep-copy.
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
