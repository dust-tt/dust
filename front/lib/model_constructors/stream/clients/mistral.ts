import type { MistralInputConfig } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { mistralConfigSchema } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { WithMistralAIInputConverter } from "@app/lib/model_constructors/sdk/mistralai/converters/input";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/mistralai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { MISTRAL_HOST } from "@app/lib/model_constructors/types/hosts";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { EUROPE } from "@app/lib/model_constructors/types/regions";
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
  // No `lab`: Mistral also hosts third-party models, so each endpoint sets it.
  static readonly host = MISTRAL_HOST;

  static readonly configSchema = mistralConfigSchema;

  private readonly client: Mistral;

  constructor({ MISTRAL_API_KEY }: Credentials) {
    super();
    this.client = new Mistral({
      apiKey: MISTRAL_API_KEY,
      // `api.mistral.ai` commits to no inference location; EU endpoints pin it to the EU
      // host. Needs SDK >= 2.5.0: before that `ServerList.eu` pointed at the global host.
      // https://docs.mistral.ai/inference/regional-inference (verified 2026-09-22)
      server: this.constructor.region === EUROPE ? "eu" : "global",
      // Keep the SDK's current single-attempt default explicit: the agent loop
      // owns retries so every attempt gets its own Dust trace.
      retryConfig: { strategy: "none" },
    });
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
