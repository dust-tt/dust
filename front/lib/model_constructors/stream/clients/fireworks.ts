import {
  type FireworksInputConfig,
  fireworksConfigSchema,
} from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithOpenAICompletionsInputConverter } from "@app/lib/model_constructors/sdk/openai_completions/converters/input";
import { toolCallResultMessageToMessage } from "@app/lib/model_constructors/sdk/openai_completions/converters/input/utils";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_completions/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { FIREWORKS_HOST } from "@app/lib/model_constructors/types/hosts";
import type {
  BaseToolCallResultMessage,
  Payload,
} from "@app/lib/model_constructors/types/input/messages";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";

// Fireworks model ids are stored bare (e.g. `glm-5p2`) but legacy `ModelIdType`
// and the Fireworks API both use the full account-scoped path.
export const FIREWORKS_MODEL_PREFIX = "accounts/fireworks/models/";

type FireworksToolMessageParam = ChatCompletionToolMessageParam & {
  name: string;
};

function toolCallResultMessageToFireworksMessage(
  message: BaseToolCallResultMessage
): FireworksToolMessageParam {
  return {
    ...toolCallResultMessageToMessage(message),
    // Preserve the name for Fireworks models that require it to resolve parallel results.
    name: message.content.toolName,
  };
}

export abstract class FireworksStream extends WithOpenAICompletionsInputConverter(
  StreamEndpoint<
    ChatCompletionCreateParamsStreaming,
    ChatCompletionChunk,
    FireworksInputConfig
  >
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

  override toolCallResultMessageToMessage =
    toolCallResultMessageToFireworksMessage;

  // Model ids are stored bare (e.g. `glm-5p2`); Fireworks' API expects the full
  // account-scoped model path.
  modelToHostModel = (modelId: Model): string =>
    `${FIREWORKS_MODEL_PREFIX}${modelId}`;

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
