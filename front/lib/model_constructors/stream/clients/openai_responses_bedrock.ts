import { OPENAI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/openai/reasoning_efforts";
import { openAIReasoningSummaryForModel } from "@app/lib/model_constructors/providers/openai/reasoning_summary";
import { WithOpenAIResponsesInputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/input";
import { WithOpenAIResponsesOutputConverter } from "@app/lib/model_constructors/sdk/openai_responses/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { BEDROCK_HOST } from "@app/lib/model_constructors/types/hosts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { OPENAI_LAB } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import logger from "@app/logger/logger";
import OpenAI from "openai";
import type {
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { z } from "zod";

// Bedrock serves OpenAI models through the OpenAI Responses API at
// `/openai/v1`, so this reuses the OpenAI Responses converters and SDK and
// only swaps the base URL, credential and model id.
//
// `bedrock-runtime` (not `bedrock-mantle`) is the endpoint that offers global
// cross-Region inference for these models: on `bedrock-mantle` the geo and
// global inference ids are "Not supported" and only in-Region us-east-1 /
// us-east-2 are served. AWS also recommends `bedrock-runtime` for new
// applications.
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html
// (verified 2026-09-10)
const BEDROCK_RUNTIME_OPENAI_BASE_URL =
  "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1";

// Same shape as the direct OpenAI Responses client's schema. Kept separate
// rather than shared because this host does not sit under that client (see
// `OpenAIResponsesBedrockStream`); per-model schemas narrow it anyway.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(OPENAI_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
});

type OpenAIInputConfig = z.infer<typeof configSchema>;

// Deliberately not a subclass of `OpenAIResponsesStream`: that client pins
// `static host` to the literal `openai-responses`, which every endpoint id is
// built from, and it carries the flex-processing fallback that Bedrock has no
// use for (Standard is the only service tier these models are served on).
export abstract class OpenAIResponsesBedrockStream extends WithOpenAIResponsesInputConverter(
  WithOpenAIResponsesOutputConverter(
    StreamEndpoint<ResponseCreateParams, ResponseStreamEvent>
  )
) {
  static readonly lab = OPENAI_LAB;
  static readonly host = BEDROCK_HOST;

  static readonly configSchema: z.ZodType<OpenAIInputConfig> = configSchema;

  private readonly client: OpenAI;

  constructor({ AWS_BEARER_TOKEN_BEDROCK }: Credentials) {
    super();
    this.client = new OpenAI({
      // Bedrock's OpenAI-compatible surface authenticates with a bearer token
      // in the same header the OpenAI SDK uses for its own key.
      apiKey: AWS_BEARER_TOKEN_BEDROCK,
      baseURL: BEDROCK_RUNTIME_OPENAI_BASE_URL,
      // The agent loop owns retries so every attempt gets its own Dust trace.
      maxRetries: 0,
    });
  }

  protected override reasoningSummaryForModel(
    model: Model,
    conciseReasoningSummary: boolean
  ) {
    return openAIReasoningSummaryForModel(model, conciseReasoningSummary);
  }

  // The base URL is regional, but the model id is what selects routing: the
  // `global.openai.` prefix names the global cross-Region inference profile,
  // which routes worldwide and is priced below in-Region inference.
  modelToHostModel = (modelId: Model): string => `global.openai.${modelId}`;

  async *streamRaw(
    input: ResponseCreateParams
  ): AsyncGenerator<ResponseStreamEvent> {
    // ponytail: loud temporary marker while we validate the Bedrock path.
    logger.info(
      { model: input.model, baseUrl: BEDROCK_RUNTIME_OPENAI_BASE_URL },
      "🟢🟢🟢 Calling the AWS Bedrock (bedrock-runtime) Responses API 🟢🟢🟢"
    );

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
