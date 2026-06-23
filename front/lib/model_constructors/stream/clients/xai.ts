import { XAI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/xai/reasoning_efforts";
import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { XAI_API } from "@app/lib/model_constructors/types/provider_apis";
import { XAI_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { z } from "zod";

// xAI is OpenAI-Responses-compatible and reachable at this fixed base URL.
const XAI_BASE_URL = "https://api.x.ai/v1";

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(XAI_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
});

type XaiInputConfig = z.infer<typeof configSchema>;

export abstract class XaiStream extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    StreamEndpoint<ResponseCreateParamsNonStreaming, ResponseStreamEvent>
  )
) {
  static readonly providerId = XAI_PROVIDER_ID;
  static readonly api = XAI_API;

  static readonly configSchema: z.ZodType<XaiInputConfig> = configSchema;

  private readonly client: OpenAI;

  constructor({ XAI_API_KEY }: Credentials) {
    super();
    this.client = new OpenAI({
      apiKey: XAI_API_KEY,
      baseURL: XAI_BASE_URL,
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
