import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { XAI_HOST } from "@app/lib/model_constructors/types/hosts";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { XAI_LAB } from "@app/lib/model_constructors/types/labs";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { z } from "zod";

// xAI exposes an OpenAI-compatible Responses API, so we reuse the OpenAI
// Responses converters and SDK client, only swapping the base URL and key.
const XAI_BASE_URL = "https://api.x.ai/v1";

export abstract class XaiStream extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    StreamEndpoint<ResponseCreateParamsNonStreaming, ResponseStreamEvent>
  )
) {
  static readonly lab = XAI_LAB;
  static readonly host = XAI_HOST;

  static readonly configSchema: z.ZodType<InputConfig> = inputConfigSchema;

  private readonly client: OpenAI;

  constructor({ XAI_API_KEY }: Credentials) {
    super();
    this.client = new OpenAI({ apiKey: XAI_API_KEY, baseURL: XAI_BASE_URL });
  }

  buildRequestPayload(
    payload: Payload,
    config: InputConfig
  ): ResponseCreateParamsNonStreaming {
    const { stream: _stream, ...request } = super.buildRequestPayload(
      payload,
      config
    );
    if (request.tools && request.tools.length > 0) {
      return request;
    }
    // Unlike OpenAI, x.ai rejects `tool_choice` when the request has no tools.
    const { tool_choice: _toolChoice, ...withoutToolChoice } = request;
    return withoutToolChoice;
  }

  async *streamRaw(
    input: ResponseCreateParamsNonStreaming
  ): AsyncGenerator<ResponseStreamEvent> {
    // `buildRequestPayload` is shared with batch and omits `stream`; opt in here.
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
