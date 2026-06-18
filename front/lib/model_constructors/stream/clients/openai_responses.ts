import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/providers/openai/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/providers/openai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/providers/openai/converters/output/utils";
import { OPENAI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/openai/reasoning_efforts";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { OPENAI_RESPONSES_API } from "@app/lib/model_constructors/types/provider_apis";
import { OPENAI_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { z } from "zod";

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(OPENAI_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
});

type OpenAIInputConfig = z.infer<typeof configSchema>;

export abstract class OpenAIResponsesStream extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    StreamEndpoint<ResponseCreateParamsNonStreaming, ResponseStreamEvent>
  )
) {
  static readonly providerId = OPENAI_PROVIDER_ID;
  static readonly api = OPENAI_RESPONSES_API;

  static readonly configSchema: z.ZodType<OpenAIInputConfig> = configSchema;

  private readonly client: OpenAI;

  constructor({ OPENAI_API_KEY, OPENAI_BASE_URL }: Credentials) {
    super();
    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
    });
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
