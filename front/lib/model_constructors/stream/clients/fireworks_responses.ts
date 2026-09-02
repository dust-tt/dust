import {
  FIREWORKS_BASE_URL,
  FIREWORKS_MODEL_PREFIX,
} from "@app/lib/model_constructors/providers/fireworks/constants";
import type { FireworksInputConfig } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { FIREWORKS_HOST } from "@app/lib/model_constructors/types/hosts";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseInputItem,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

// Fireworks exposes an OpenAI-compatible Responses API:
// https://docs.fireworks.ai/guides/response-api
export abstract class FireworksResponsesStream extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    StreamEndpoint<
      ResponseCreateParamsStreaming,
      ResponseStreamEvent,
      FireworksInputConfig
    >
  )
) {
  static readonly host = FIREWORKS_HOST;

  static readonly configSchema = fireworksConfigSchema;

  // Fireworks' Responses API is "OpenAI-compatible" but never documents the
  // roles it accepts on input: https://docs.fireworks.ai/api-reference/post-responses
  // types `input` as a string or "a list of message objects" and enumerates
  // roles only for the response `output`, and the guide linked above shows only
  // string input. OpenAI's own spec allows either role on an input message —
  // "One of `user`, `assistant`, `system`, or `developer`" (`EasyInputMessage`
  // in openai/resources/responses/responses.d.ts) — which is why the shared
  // converter defaults to `developer`. Measured live 2026-08-25, K3 answers as
  // if no system message existed under `developer` and reads the prompt under
  // `system`.
  override systemMessagesToInputItems(
    system: SystemTextMessage[]
  ): ResponseInputItem[] {
    return system.map((message) => ({
      role: "system",
      content: [
        {
          type: "input_text",
          text: message.content.value,
          ...this.promptCacheBreakpointFor(message.cache),
        },
      ],
    }));
  }

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
  ): ResponseCreateParamsStreaming {
    const request = super.buildRequestPayload(payload, config);
    const forceTool = config.forceTool;
    const forcedToolName =
      forceTool !== undefined &&
      (request.tools ?? []).some(
        (tool) => tool.type === "function" && tool.name === forceTool
      )
        ? forceTool
        : undefined;

    return {
      ...request,
      model: `${FIREWORKS_MODEL_PREFIX}${this.constructor.model}`,
      // Dust replays the complete Responses transcript, including reasoning
      // item ids and function calls, so provider-side response storage is not
      // needed.
      store: false,
      stream: true,
      // Fireworks does not accept OpenAI's named function tool-choice object.
      // Keep the complete tool list stable for prompt caching and constrain the
      // required call with the Responses API's allowed-tools choice instead.
      ...(forcedToolName !== undefined
        ? {
            tool_choice: {
              type: "allowed_tools" as const,
              mode: "required" as const,
              tools: [{ type: "function", name: forcedToolName }],
            },
          }
        : {}),
    };
  }

  async *streamRaw(
    input: ResponseCreateParamsStreaming
  ): AsyncGenerator<ResponseStreamEvent> {
    const stream = await this.client.responses.create(input);

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
