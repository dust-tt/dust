import { WithMistralInputConverter } from "@app/lib/model_constructors/providers/mistral/converters/input";
import { rawOutputToEvents } from "@app/lib/model_constructors/providers/mistral/converters/output/utils";
import {
  type MistralInputConfig,
  mistralConfigSchema,
} from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { MISTRAL_API } from "@app/lib/model_constructors/types/provider_apis";
import { MISTRAL_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import { Mistral } from "@mistralai/mistralai";
import type {
  ChatCompletionStreamRequest,
  CompletionEvent,
} from "@mistralai/mistralai/models/components";

export abstract class MistralStream extends WithMistralInputConverter(
  StreamEndpoint<
    ChatCompletionStreamRequest,
    CompletionEvent,
    MistralInputConfig
  >
) {
  static readonly providerId = MISTRAL_PROVIDER_ID;
  static readonly api = MISTRAL_API;

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
