import type { FireworksInputConfig } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithThinkingMachinesInklingConfig } from "@app/lib/model_constructors/providers/fireworks/models/inkling";
import { FireworksResponsesStream } from "@app/lib/model_constructors/stream/clients/fireworks_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { THINKING_MACHINES_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";

export class ThinkingMachinesInklingGlobalFireworksStream extends WithThinkingMachinesInklingConfig(
  FireworksResponsesStream
) {
  override buildRequestPayload(
    payload: Payload,
    config: FireworksInputConfig
  ): ResponseCreateParamsStreaming {
    const request = super.buildRequestPayload(payload, config);

    if (this.constructor.maxOutputTokens < this.constructor.contextSize) {
      return request;
    }

    const { max_output_tokens: _maxOutputTokens, ...requestWithoutLimit } =
      request;

    // Verified live 2026-08-31: sending Inkling's 1M completion limit exceeds
    // its shared prompt-plus-completion budget. Omitting the field lets the
    // deployment choose a valid limit, matching the Chat Completions behavior.
    // Dust's derived endpoint has a lower product cap and keeps sending it.
    return requestWithoutLimit;
  }

  // Verified 2026-08-14: https://fireworks.ai/models/fireworks/inkling
  static readonly tokenPricing = {
    cacheHit: 0.17,
    standardInput: 1.0,
    standardOutput: 4.05,
  };

  static readonly lab = THINKING_MACHINES_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}

ThinkingMachinesInklingGlobalFireworksStream satisfies StreamEndpointConstructor;
