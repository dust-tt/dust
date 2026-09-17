import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_mini_global_openai_responses";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import {
  GPT_5_4_MINI,
  SIMULATED_FAILURE_MODEL,
} from "@app/lib/model_constructors/types/models";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import type { ResponseCreateParams } from "openai/resources/responses/responses";

type DelegateConfig = Parameters<
  InstanceType<
    typeof OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream
  >["buildRequestPayload"]
>[1];

// A router-native model with its own identity that deliberately sends healthy
// requests to GPT-5.4 Mini. Synthetic failure behavior is added in the Dust
// endpoint wrapper, not in this provider-agnostic constructor.
export class OpenAISimulatedFailureModelGlobalOpenAIResponsesStream extends OpenAIResponsesStream {
  static readonly model = SIMULATED_FAILURE_MODEL;
  static readonly configSchema =
    OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.configSchema;
  static readonly contextSize =
    OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.contextSize;
  static readonly maxOutputTokens =
    OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.maxOutputTokens;
  static readonly tokenPricing =
    OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.tokenPricing;
  static readonly supportsFlexProcessing =
    OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.supportsFlexProcessing;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;

  // Mini rejects explicit breakpoints; they start at GPT-5.6.
  promptCacheBreakpointFor = () => ({});

  override buildRequestPayload(
    payload: Payload,
    config: DelegateConfig
  ): ResponseCreateParams {
    return {
      ...super.buildRequestPayload(payload, config),
      model: GPT_5_4_MINI,
    };
  }
}

OpenAISimulatedFailureModelGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
