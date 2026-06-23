import {
  type TogetheraiInputConfig,
  togetheraiNonReasoningConfigSchema,
} from "@app/lib/model_constructors/providers/togetherai/inputConfig";
import { WithOpenAICompletionsInputConverter } from "@app/lib/model_constructors/sdk/openai_completions/converters/input";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_completions/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { TOGETHERAI_API } from "@app/lib/model_constructors/types/provider_apis";
import { TOGETHERAI_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

const TOGETHERAI_BASE_URL = "https://api.together.xyz/v1";

export abstract class TogetheraiStream extends WithOpenAICompletionsInputConverter(
  StreamEndpoint<
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionChunk,
    TogetheraiInputConfig
  >
) {
  static readonly providerId = TOGETHERAI_PROVIDER_ID;
  static readonly api = TOGETHERAI_API;

  static readonly configSchema = togetheraiNonReasoningConfigSchema;

  private readonly client: OpenAI;

  constructor({ TOGETHERAI_API_KEY }: Credentials) {
    super();
    this.client = new OpenAI({
      apiKey: TOGETHERAI_API_KEY,
      baseURL: TOGETHERAI_BASE_URL,
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
