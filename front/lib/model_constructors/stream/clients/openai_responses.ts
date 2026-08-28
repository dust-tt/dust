import { OPENAI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/openai/reasoning_efforts";
import { openAIReasoningSummaryForModel } from "@app/lib/model_constructors/providers/openai/reasoning_summary";
import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { OPENAI_RESPONSES_HOST } from "@app/lib/model_constructors/types/hosts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { OPENAI_LAB } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
// Do not remove: front-api routes call into this client for the similar skill
// and similar agent discovery features. Without an explicit version front-api can silently
// resolve a stale, incompatible `openai` version through node_modules hoisting.
import OpenAI, { APIConnectionTimeoutError } from "openai";
import type {
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { z } from "zod";

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(OPENAI_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
});

type OpenAIInputConfig = z.infer<typeof configSchema>;

const FLEX_REQUEST_OPTIONS = { maxRetries: 0, timeout: 30_000 };

export abstract class OpenAIResponsesStream extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    StreamEndpoint<ResponseCreateParams, ResponseStreamEvent>
  )
) {
  static readonly lab = OPENAI_LAB;
  static readonly host = OPENAI_RESPONSES_HOST;

  static readonly configSchema: z.ZodType<OpenAIInputConfig> = configSchema;

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

  override buildRequestPayload(
    payload: Payload,
    config: OpenAIInputConfig
  ): ResponseCreateParams {
    const request = super.buildRequestPayload(payload, config);

    return config.serviceTier === "flex" &&
      this.constructor.supportsFlexProcessing
      ? { ...request, service_tier: "flex" }
      : request;
  }

  async *streamRaw(
    input: ResponseCreateParams
  ): AsyncGenerator<ResponseStreamEvent> {
    // `buildRequestPayload` is shared with batch and omits `stream`; opt in here.
    const streamingInput: ResponseCreateParamsStreaming = {
      ...input,
      stream: true,
    };

    if (streamingInput.service_tier !== "flex") {
      yield* this.streamFromOpenAI(streamingInput);
      return;
    }

    // Flex is best-effort: it can be refused outright or answer too late. Until
    // it has produced an event we can still replay the request on standard
    // processing; once it has, a failure is the caller's to retry as usual.
    let started = false;
    try {
      for await (const event of this.streamFromOpenAI(
        streamingInput,
        FLEX_REQUEST_OPTIONS
      )) {
        started = true;
        yield event;
      }
      return;
    } catch (err) {
      if (started) {
        throw err;
      }
      this.logFlexFallback(err);
    }

    yield* this.streamFromOpenAI({ ...streamingInput, service_tier: "auto" });
  }

  // Protected so tests can stand in for the OpenAI call.
  protected async *streamFromOpenAI(
    input: ResponseCreateParamsStreaming,
    options?: { maxRetries: number; timeout: number }
  ): AsyncGenerator<ResponseStreamEvent> {
    const stream = await this.client.responses.create(input, options);

    for await (const event of stream) {
      yield event;
    }
  }

  private logFlexFallback(err: unknown): void {
    const reason =
      err instanceof APIConnectionTimeoutError ? "timeout" : "error";
    const { model, host, region } = this.metadata();
    // `host` is reserved by the Datadog agent (it overrides the metric's
    // hostname), so the endpoint host ships under its own tag name.
    const tags = [
      `model_id:${model}`,
      `endpoint_host:${host}`,
      `region:${region}`,
      `reason:${reason}`,
    ];

    logger.warn(
      { err: normalizeError(err), tags },
      "OpenAI flex processing unavailable, replaying on standard processing"
    );
    statsDMetrics.increment("llm_flex_fallback.count", 1, tags);
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<ResponseStreamEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
