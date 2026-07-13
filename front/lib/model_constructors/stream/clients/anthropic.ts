import AnthropicClient from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStartEvent,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  type AnthropicInputConfig,
  anthropicConfigSchema,
} from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { WithAnthropicAIInputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import { WithAnthropicAIOutputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output";
import {
  messageStartToResponseIdEvent as baseMessageStartToResponseIdEvent,
  rawOutputToEvents,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type {
  ModelResponseEvent,
  ResponseIdEvent,
} from "@app/lib/model_constructors/types/output/events";
import { ANTHROPIC_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import type { CacheMissReason } from "@app/lib/model_constructors/utils/cache_miss_reason";

// Opts into prompt-cache diagnostics (Claude API only, not Vertex/agent).
// https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics
const CACHE_DIAGNOSTICS_BETA_HEADER = "cache-diagnosis-2026-04-07";

// Extract the cache-miss reason from a message_start (null when nothing to
// compare or the background comparison is still pending).
function toCacheMissReason(message: BetaMessage): CacheMissReason | undefined {
  const reason = message.diagnostics?.cache_miss_reason;
  if (!reason) {
    return undefined;
  }
  return {
    type: reason.type,
    // Only the `*_changed` reasons carry the lost-cache magnitude.
    cacheMissedInputTokens:
      "cache_missed_input_tokens" in reason
        ? reason.cache_missed_input_tokens
        : undefined,
  };
}

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

  // Cache-diagnostics state, threaded across a stream: recorded in
  // `buildRequestPayload`, captured off `message_start` in `streamRaw`, attached
  // to the `response_id` event. Reset at the start of each stream.
  private previousMessageId: string | null | undefined;
  private lastCacheMissReason: CacheMissReason | undefined;

  constructor({ ANTHROPIC_API_KEY }: Credentials) {
    super();
    this.client = new AnthropicClient({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async buildRequestPayload(
    payload: Payload,
    config: AnthropicInputConfig
  ): Promise<MessageCreateParamsNonStreaming> {
    // `diagnostics` and the beta header live on the beta Messages API, so they
    // are attached in `streamRaw` from this opt-in rather than in the payload.
    this.previousMessageId = config.previousMessageId;
    return super.buildRequestPayload(payload, config);
  }

  // Cache diagnostics opt-in is tri-state: `undefined` = off; `null`/string =
  // on (Anthropic direct only).
  private get cacheDiagnosticsEnabled(): boolean {
    return this.previousMessageId !== undefined;
  }

  async *streamRaw(
    input: MessageCreateParamsNonStreaming
  ): AsyncGenerator<BetaRawMessageStreamEvent> {
    this.lastCacheMissReason = undefined;

    // `buildRequestPayload` is shared with batch and omits `stream`; the beta
    // `.stream()` opts in. Non-beta payloads are assignable to the beta params.
    const streamingInput: BetaMessageStreamParams = {
      ...input,
      cache_control: { type: "ephemeral" },
      ...(this.cacheDiagnosticsEnabled
        ? {
            betas: [CACHE_DIAGNOSTICS_BETA_HEADER],
            diagnostics: { previous_message_id: this.previousMessageId },
          }
        : {}),
    };
    const stream = this.client.beta.messages.stream(streamingInput);

    for await (const event of stream) {
      if (event.type === "message_start") {
        this.lastCacheMissReason = toCacheMissReason(event.message);
      }
      // The SDK reuses and mutates event objects, so deep-copy each one.
      yield structuredClone(event);
    }
  }

  // Attach the captured cache-miss reason (if any) to the response id event's
  // metadata bag, alongside other provider-specific event metadata.
  messageStartToResponseIdEvent = (
    metadata: EndpointMetadata,
    event: BetaRawMessageStartEvent
  ): ResponseIdEvent => {
    const base = baseMessageStartToResponseIdEvent(metadata, event);
    if (!this.lastCacheMissReason) {
      return base;
    }
    return {
      ...base,
      metadata: {
        ...base.metadata,
        content: {
          ...base.metadata.content,
          cacheMissReason: this.lastCacheMissReason,
        },
      },
    };
  };

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<BetaRawMessageStreamEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
