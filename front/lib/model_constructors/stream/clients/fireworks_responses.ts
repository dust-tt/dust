import {
  type FireworksInputConfig,
  fireworksConfigSchema,
} from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import {
  FIREWORKS_BASE_URL,
  FIREWORKS_MODEL_PREFIX,
} from "@app/lib/model_constructors/stream/clients/fireworks";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { FIREWORKS_HOST } from "@app/lib/model_constructors/types/hosts";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

// Fireworks exposes an OpenAI-compatible Responses API:
// https://docs.fireworks.ai/guides/response-api
export abstract class FireworksResponsesStream extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    StreamEndpoint<
      ResponseCreateParamsNonStreaming,
      ResponseStreamEvent,
      FireworksInputConfig
    >
  )
) {
  static readonly host = FIREWORKS_HOST;

  static readonly configSchema = fireworksConfigSchema;

  private readonly client: OpenAI;

  constructor({ FIREWORKS_API_KEY }: Credentials) {
    super();
    this.client = new OpenAI({
      apiKey: FIREWORKS_API_KEY,
      baseURL: FIREWORKS_BASE_URL,
    });
  }

  override buildRequestPayload(
    payload: Payload,
    config: FireworksInputConfig
  ): ResponseCreateParamsNonStreaming {
    // Fireworks implements Responses function tools, but not OpenAI's hosted
    // tool search/deferred-loading extension.
    const request = super.buildRequestPayload(payload, {
      ...config,
      toolSearchEnabled: false,
    });
    const forceTool = config.forceTool;
    const forcedTools =
      forceTool === undefined
        ? []
        : (request.tools ?? []).filter(
            (tool) => tool.type === "function" && tool.name === forceTool
          );

    return {
      ...request,
      model: `${FIREWORKS_MODEL_PREFIX}${this.constructor.model}`,
      // Dust replays the complete Responses transcript, including reasoning
      // item ids and function calls, so provider-side response storage is not
      // needed.
      store: false,
      // Fireworks does not accept OpenAI's named function tool-choice object.
      // Restricting the request to that function and requiring a tool call has
      // the same forced-tool semantics.
      ...(forcedTools.length > 0
        ? {
            tools: forcedTools,
            tool_choice: "required" as const,
          }
        : {}),
    };
  }

  async *streamRaw(
    input: ResponseCreateParamsNonStreaming
  ): AsyncGenerator<ResponseStreamEvent> {
    const streamingInput: ResponseCreateParamsStreaming = {
      ...input,
      stream: true,
    };
    const stream = await this.client.responses.create(streamingInput);

    for await (const event of stream) {
      yield event;
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<ResponseStreamEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
