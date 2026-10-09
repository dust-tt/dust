import AnthropicClient from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStartEvent,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { anthropicConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import type { AnthropicRequestPayload } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import { WithAnthropicAIInputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import {
  MID_CONVERSATION_OUTPUT_CONFIG_BETA_HEADER,
  requiresMidConversationOutputConfigBeta,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import { WithAnthropicAIOutputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output";
import {
  messageStartToResponseIdEvent as baseMessageStartToResponseIdEvent,
  rawOutputToEvents,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import { ANTHROPIC_HOST } from "@app/lib/model_constructors/types/hosts";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { ANTHROPIC_LAB } from "@app/lib/model_constructors/types/labs";
import type {
  ModelResponseEvent,
  ResponseIdEvent,
} from "@app/lib/model_constructors/types/output/events";
import type { CacheMissReason } from "@app/lib/model_constructors/utils/cache_miss_reason";
import type { InputTransformation } from "@app/lib/model_constructors/utils/input_transformation";

// Opts into prompt-cache diagnostics (Claude API only, not Vertex/agent).
// https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics
const CACHE_DIAGNOSTICS_BETA_HEADER = "cache-diagnosis-2026-04-07";

// Reports, in `input_transformations`, the thinking blocks the preserved-thinking
// checks dropped or flagged.
// https://platform.claude.com/docs/en/build-with-claude/preserved-thinking
export const THINKING_BINDING_CONTROLS_BETA_HEADER =
  "thinking-binding-controls-2026-08-01";

// The request we build for the stream: the base non-beta params plus the beta
// Messages API extras we attach (cache-diagnostics beta header + `diagnostics`
// opt-in). Kept on the built payload rather than added in `streamRaw` so the
// request we construct reflects exactly what we send (and what the debug dump
// records). Non-beta params are assignable to the beta stream params.
type AnthropicStreamRequest = AnthropicRequestPayload &
  Pick<BetaMessageStreamParams, "betas" | "diagnostics">;

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

function toInputTransformations(
  message: BetaMessage
): InputTransformation[] | undefined {
  const transformations = message.input_transformations;
  return transformations?.length ? transformations : undefined;
}

export abstract class AnthropicStream extends WithAnthropicAIInputConverter(
  WithAnthropicAIOutputConverter(
    StreamEndpoint<
      AnthropicStreamRequest,
      BetaRawMessageStreamEvent,
      AnthropicInputConfig
    >
  )
) {
  static readonly lab = ANTHROPIC_LAB;
  static readonly host = ANTHROPIC_HOST;

  static readonly configSchema = anthropicConfigSchema;

  // Betas sent on every request. Endpoints override this to opt out of, or add to, the defaults.
  protected readonly betas: readonly string[] = [
    THINKING_BINDING_CONTROLS_BETA_HEADER,
  ];

  private readonly client: AnthropicClient;

  // Cache-diagnostics state, threaded across a stream: recorded in
  // `buildRequestPayload`, captured off `message_start` in `streamRaw`, attached
  // to the `response_id` event. Reset at the start of each stream.
  private previousMessageId: string | null | undefined;
  private lastCacheMissReason: CacheMissReason | undefined;
  private lastInputTransformations: InputTransformation[] | undefined;

  constructor({ ANTHROPIC_API_KEY }: Credentials) {
    super();
    this.client = new AnthropicClient({
      apiKey: ANTHROPIC_API_KEY,
      // The agent loop owns retries so every attempt has a distinct, observable Dust trace.
      // Hidden SDK retries can populate the prompt cache on an unobserved attempt, then report
      // only the cache-hit usage of the successful retry.
      maxRetries: 0,
    });
  }

  /**
   * @cc [owner:pmilliotte,label:product] thinking-binding-observe-only
   * The request MUST NOT set `thinking.block_binding`. Without it, accounts created before
   * 2026-08-31 only report prefix-check failures in `input_transformations`; setting it turns
   * every failure into a 400 or a dropped thinking block.
   */
  async buildRequestPayload(
    payload: Payload,
    config: AnthropicInputConfig
  ): Promise<AnthropicStreamRequest> {
    this.previousMessageId = config.previousMessageId;
    const request = await super.buildRequestPayload(payload, config);
    const betas = [
      ...(this.cacheDiagnosticsEnabled ? [CACHE_DIAGNOSTICS_BETA_HEADER] : []),
      ...this.betas,
      ...(requiresMidConversationOutputConfigBeta(request.messages)
        ? [MID_CONVERSATION_OUTPUT_CONFIG_BETA_HEADER]
        : []),
    ];
    return {
      ...request,
      // Top-level automatic caching: auto-places the last cache breakpoint at
      // the tail of the request so the growing conversation prefix is reused.
      cache_control: { type: "ephemeral" },
      // Beta headers and the cache-diagnostics `diagnostics` body are attached
      // here, not in `streamRaw`, so the built payload reflects exactly what we
      // send.
      ...(betas.length > 0 ? { betas } : {}),
      ...(this.cacheDiagnosticsEnabled
        ? { diagnostics: { previous_message_id: this.previousMessageId } }
        : {}),
    };
  }

  // Cache diagnostics opt-in is tri-state: `undefined` = off; `null`/string =
  // on (Anthropic direct only).
  private get cacheDiagnosticsEnabled(): boolean {
    return this.previousMessageId !== undefined;
  }

  async *streamRaw(
    input: AnthropicStreamRequest
  ): AsyncGenerator<BetaRawMessageStreamEvent> {
    this.lastCacheMissReason = undefined;
    this.lastInputTransformations = undefined;

    const stream = this.client.beta.messages.stream(input);

    for await (const event of stream) {
      if (event.type === "message_start") {
        this.lastCacheMissReason = toCacheMissReason(event.message);
        this.lastInputTransformations = toInputTransformations(event.message);
      }
      // The SDK reuses and mutates event objects, so deep-copy each one.
      yield structuredClone(event);
    }
  }

  // Attach the captured cache-miss reason and input transformations (if any)
  // to the response id event's metadata bag, alongside other provider-specific
  // event metadata.
  messageStartToResponseIdEvent = (
    metadata: EndpointMetadata,
    event: BetaRawMessageStartEvent
  ): ResponseIdEvent => {
    const base = baseMessageStartToResponseIdEvent(metadata, event);
    if (!this.lastCacheMissReason && !this.lastInputTransformations) {
      return base;
    }
    return {
      ...base,
      metadata: {
        ...base.metadata,
        content: {
          ...base.metadata.content,
          ...(this.lastCacheMissReason && {
            cacheMissReason: this.lastCacheMissReason,
          }),
          ...(this.lastInputTransformations && {
            inputTransformations: this.lastInputTransformations,
          }),
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
