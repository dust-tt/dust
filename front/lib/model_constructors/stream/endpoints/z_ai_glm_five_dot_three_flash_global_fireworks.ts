import { WithZAiGlm53FlashConfig } from "@app/lib/model_constructors/providers/fireworks/models/glm_five_dot_three_flash";
import type { FireworksInputConfig } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { Z_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

export class ZAiGlmFiveDotThreeFlashGlobalFireworksStream extends WithZAiGlm53FlashConfig(
  FireworksStream
) {
  override buildRequestPayload(
    payload: Payload,
    config: FireworksInputConfig
  ): ChatCompletionCreateParamsStreaming {
    const request = super.buildRequestPayload(payload, config);

    if (request.tools) {
      return request;
    }

    // Verified live 2026-08-31: this deployment rejects `tool_choice` unless
    // `tools` is also present, including the otherwise-default `auto` value.
    const { tool_choice: _toolChoice, ...requestWithoutToolChoice } = request;
    return requestWithoutToolChoice;
  }

  // Verified 2026-08-31: https://fireworks.ai/models/fireworks/glm-5p3-flash
  static readonly tokenPricing = {
    cacheHit: 0.029,
    standardInput: 0.15,
    standardOutput: 0.5,
  };

  static readonly lab = Z_AI_LAB;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

ZAiGlmFiveDotThreeFlashGlobalFireworksStream satisfies StreamEndpointConstructor;
