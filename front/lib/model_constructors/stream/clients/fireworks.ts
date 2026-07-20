import {
  type FireworksInputConfig,
  fireworksConfigSchema,
} from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithOpenAICompletionsInputConverter } from "@app/lib/model_constructors/sdk/openai_completions/converters/input";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_completions/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { FIREWORKS_API } from "@app/lib/model_constructors/types/provider_apis";
import { FIREWORKS_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";

export abstract class FireworksStream extends WithOpenAICompletionsInputConverter(
  StreamEndpoint<
    ChatCompletionCreateParamsStreaming,
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

  // Fireworks always streams, so opt into `stream`/`stream_options` here rather
  // than in `streamRaw`, keeping the request payload self-contained.
  override buildRequestPayload(
    payload: Payload,
    config: FireworksInputConfig
  ): ChatCompletionCreateParamsStreaming {
    return {
      ...super.buildRequestPayload(payload, config),
      stream: true,
      stream_options: { include_usage: true },
    };
  }

  async *streamRaw(
    input: ChatCompletionCreateParamsStreaming
  ): AsyncGenerator<ChatCompletionChunk> {
    const stream = await this.client.chat.completions.create(input);

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
