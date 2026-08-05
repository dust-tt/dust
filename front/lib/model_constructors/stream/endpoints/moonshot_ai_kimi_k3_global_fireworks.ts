import type { FireworksInputConfig } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithMoonshotAiKimiK3Config } from "@app/lib/model_constructors/providers/fireworks/models/kimi_k3";
import { FireworksResponsesStream } from "@app/lib/model_constructors/stream/clients/fireworks_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { MOONSHOT_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";

export class MoonshotAiKimiK3GlobalFireworksStream extends WithMoonshotAiKimiK3Config(
  FireworksResponsesStream
) {
  override buildRequestPayload(
    payload: Payload,
    config: FireworksInputConfig
  ): ResponseCreateParamsStreaming {
    return {
      ...super.buildRequestPayload(payload, config),
      // Fireworks accepts this typed Responses extension even though it is not
      // yet listed in the Responses API reference. Verified live 2026-07-28.
      service_tier: "priority",
    };
  }

  // https://docs.fireworks.ai/serverless/pricing
  static readonly tokenPricing = {
    cacheHit: 0.375,
    standardInput: 3.75,
    standardOutput: 18.75,
  };
  static readonly lab = MOONSHOT_AI_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
MoonshotAiKimiK3GlobalFireworksStream satisfies StreamEndpointConstructor;
