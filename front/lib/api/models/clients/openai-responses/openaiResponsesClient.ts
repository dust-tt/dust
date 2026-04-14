import { LargeLanguageModel } from "@app/lib/api/models/large-language-model";
import type { Credentials } from "@app/lib/api/models/types/credentials";
import type {
  Model,
  OPENAI_PROVIDER_ID,
} from "@app/lib/api/models/types/providers";
import OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

export type OpenAiModel = Extract<
  Model,
  { providerId: typeof OPENAI_PROVIDER_ID }
>;

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

export abstract class OpenAiResponses extends LargeLanguageModel<
  ResponseCreateParamsStreaming,
  ResponseStreamEvent
> {
  abstract model: OpenAiModel;
  client: OpenAI;

  constructor(credentials: Credentials) {
    super(credentials);
    this.client = new OpenAI({
      apiKey: credentials.OPENAI_API_KEY,
      baseURL: credentials.OPENAI_BASE_URL ?? OPENAI_API_BASE_URL,
      defaultHeaders: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      },
    });
  }

  async *streamRaw(
    input: ResponseCreateParamsStreaming
  ): AsyncGenerator<ResponseStreamEvent> {
    yield* await this.client.responses.create(input);
  }
}
