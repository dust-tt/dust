import type { MistralInputConfig } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { mistralConfigSchema } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { WithMistralAIInputConverter } from "@app/lib/model_constructors/sdk/mistralai/converters/input";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/mistralai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { MISTRAL_HOST } from "@app/lib/model_constructors/types/hosts";
import { MISTRAL_LAB } from "@app/lib/model_constructors/types/labs";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { Mistral } from "@mistralai/mistralai";
import type {
  ChatCompletionStreamRequest,
  CompletionEvent,
} from "@mistralai/mistralai/models/components";

export abstract class MistralStream extends WithMistralAIInputConverter(
  StreamEndpoint<
    ChatCompletionStreamRequest,
    CompletionEvent,
    MistralInputConfig
  >
) {
  static readonly lab = MISTRAL_LAB;
  static readonly host = MISTRAL_HOST;

  static readonly configSchema = mistralConfigSchema;

  private readonly client: Mistral;

  constructor({ MISTRAL_API_KEY }: Credentials) {
    super();
    this.client = new Mistral({ apiKey: MISTRAL_API_KEY });
  }

  async *streamRaw(
    input: ChatCompletionStreamRequest
  ): AsyncGenerator<CompletionEvent> {
    const stream = await this.client.chat.stream(input);
    for await (const event of stream) {
      yield event;
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<CompletionEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata());
  }
}
