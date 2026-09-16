import AnthropicClient from "@anthropic-ai/sdk";
import type {
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type {
  Model as HostModel,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { anthropicConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { WithAnthropicAIInputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import { imageUrlToBase64ImageBlock } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import { WithAnthropicAIOutputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { BEDROCK_HOST } from "@app/lib/model_constructors/types/hosts";
import { ANTHROPIC_LAB } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import logger from "@app/logger/logger";

// "Claude in Amazon Bedrock" serves the native Messages API on the
// `bedrock-mantle` endpoint, so we reuse the Anthropic SDK with a Bedrock base
// URL and a bearer token instead of the AWS SDK and SigV4 signing. The SDK
// appends `/v1/messages` to the base URL.
// https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
// (verified 2026-09-10): "set base_url to
// https://bedrock-mantle.{region}.api.aws/anthropic and pass your bearer token
// as api_key. This path supports bearer-token authentication only."
//
// ponytail: single region hard-coded. `bedrock-mantle` serves Opus 5 from
// us-east-1 (plus eu-north-1, eu-west-1, ap-southeast-4, us-gov-west-1); make
// the region a per-endpoint static when we need a second one.
const BEDROCK_MANTLE_BASE_URL =
  "https://bedrock-mantle.us-east-1.api.aws/anthropic";

export abstract class BedrockStream extends WithAnthropicAIInputConverter(
  WithAnthropicAIOutputConverter(
    StreamEndpoint<
      MessageCreateParamsNonStreaming,
      BetaRawMessageStreamEvent,
      AnthropicInputConfig
    >
  )
) {
  static readonly lab = ANTHROPIC_LAB;
  static readonly host = BEDROCK_HOST;

  static readonly configSchema = anthropicConfigSchema;

  private readonly client: AnthropicClient;

  constructor({ AWS_BEARER_TOKEN_BEDROCK }: Credentials) {
    super();
    this.client = new AnthropicClient({
      apiKey: AWS_BEARER_TOKEN_BEDROCK,
      baseURL: BEDROCK_MANTLE_BASE_URL,
      // The agent loop owns retries so every attempt is observable and billed
      // from the usage reported by that exact attempt.
      maxRetries: 0,
    });
  }

  // Bedrock model ids carry an `anthropic.` provider prefix (no geo prefix on
  // `bedrock-mantle`, unlike the `bedrock-runtime` inference profiles).
  // https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
  modelToHostModel = (modelId: Model): HostModel => `anthropic.${modelId}`;

  // Bedrock does not support URL image sources, so inline images as base64.
  imageUrlToImageBlock = imageUrlToBase64ImageBlock;

  async *streamRaw(
    input: MessageCreateParamsNonStreaming
  ): AsyncGenerator<BetaRawMessageStreamEvent> {
    // ponytail: loud temporary marker while we validate the Bedrock path.
    logger.info(
      { model: input.model, baseUrl: BEDROCK_MANTLE_BASE_URL },
      "🟢🟢🟢 Calling the AWS Bedrock (bedrock-mantle) Messages API 🟢🟢🟢"
    );

    const streamingInput: BetaMessageStreamParams = { ...input };
    const stream = this.client.beta.messages.stream(streamingInput);

    // SDK mutates/reuses events; deep-copy.
    for await (const event of stream) {
      yield structuredClone(event);
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<BetaRawMessageStreamEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
