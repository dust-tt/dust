import {
  type FireworksInputConfig,
  fireworksConfigSchema,
} from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithOpenAICompletionsInputConverter } from "@app/lib/model_constructors/sdk/openai_completions/converters/input";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_completions/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { FIREWORKS_API } from "@app/lib/model_constructors/types/provider_apis";
import { FIREWORKS_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";

export abstract class FireworksStream extends WithOpenAICompletionsInputConverter(
  StreamEndpoint<
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionChunk,
    FireworksInputConfig
  >
) {
  static readonly providerId = FIREWORKS_PROVIDER_ID;
  static readonly api = FIREWORKS_API;

  static readonly configSchema = fireworksConfigSchema;

  private readonly client: OpenAI;

  constructor({ FIREWORKS_API_KEY }: Credentials) {
    super();
    this.client = new OpenAI({
      apiKey: FIREWORKS_API_KEY,
      baseURL: FIREWORKS_BASE_URL,
    });
  }

  async *streamRaw(
    input: ChatCompletionCreateParamsNonStreaming
  ): AsyncGenerator<ChatCompletionChunk> {
    // `buildRequestPayload` is shared with batch and omits `stream`; opt in here.
    const streamingInput: ChatCompletionCreateParamsStreaming = {
      ...input,
      stream: true,
      stream_options: { include_usage: true },
    };
    const stream = await this.client.chat.completions.create(streamingInput);

    for await (const event of stream) {
      yield event;
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<ChatCompletionChunk>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata());
  }
}
