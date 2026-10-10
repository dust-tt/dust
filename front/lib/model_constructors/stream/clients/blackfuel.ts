import type { BlackfuelInputConfig } from "@app/lib/model_constructors/providers/blackfuel/inputConfig";
import { blackfuelConfigSchema } from "@app/lib/model_constructors/providers/blackfuel/inputConfig";
import { WithOpenAICompletionsInputConverter } from "@app/lib/model_constructors/sdk/openai_completions/converters/input";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_completions/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { BLACKFUEL_HOST } from "@app/lib/model_constructors/types/hosts";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

// https://docs.blackfuel.ai/docs/api-reference/chat-completions (2026-10-05).
const BLACKFUEL_BASE_URL = "https://api.blackfuel.ai/v1";

export abstract class BlackfuelStream extends WithOpenAICompletionsInputConverter(
  StreamEndpoint<
    ChatCompletionCreateParamsStreaming,
    ChatCompletionChunk,
    BlackfuelInputConfig
  >
) {
  static readonly host = BLACKFUEL_HOST;

  static readonly configSchema = blackfuelConfigSchema;

  private readonly client: OpenAI;

  constructor({ BLACKFUEL_API_KEY }: Credentials) {
    super();
    this.client = new OpenAI({
      apiKey: BLACKFUEL_API_KEY,
      baseURL: BLACKFUEL_BASE_URL,
      // The agent loop owns retries so every attempt gets its own Dust trace.
      maxRetries: 0,
    });
  }

  // Blackfuel rejects the `developer` role (400, verified live 2026-10-05).
  override systemMessageToMessage = (
    message: SystemTextMessage
  ): ChatCompletionMessageParam => ({
    role: "system",
    content: message.content.value,
  });

  // Blackfuel asks not to send prior reasoning back:
  // https://docs.blackfuel.ai/docs/guides/reasoning (2026-10-05).
  override assistantReasoningMessageToMessage = () => null;

  override buildRequestPayload(
    payload: Payload,
    config: BlackfuelInputConfig
  ): ChatCompletionCreateParamsStreaming {
    const { tool_choice, tools, ...rest } = super.buildRequestPayload(
      payload,
      config
    );

    return {
      ...rest,
      // Blackfuel rejects `tool_choice` without `tools` (400, verified live
      // 2026-10-05).
      ...(tools ? { tools, tool_choice } : {}),
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
    yield* rawOutputToEvents(stream, this.metadata(), "Blackfuel");
  }
}
