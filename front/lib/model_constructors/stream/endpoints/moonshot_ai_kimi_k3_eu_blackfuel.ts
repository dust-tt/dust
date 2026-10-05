import { WithMoonshotAiKimiK3BlackfuelConfig } from "@app/lib/model_constructors/providers/blackfuel/models/kimi_k3";
import { BlackfuelStream } from "@app/lib/model_constructors/stream/clients/blackfuel";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { MOONSHOT_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class MoonshotAiKimiK3EuropeBlackfuelStream extends WithMoonshotAiKimiK3BlackfuelConfig(
  BlackfuelStream
) {
  // `pricing` from Blackfuel's `GET /v1/models` for `moonshotai/Kimi-K3:eu`
  // (2026-10-05), matching
  // https://docs.blackfuel.ai/docs/getting-started/models-catalog#eu-hosted-models
  static readonly tokenPricing = {
    standardInput: 3,
    standardOutput: 15,
    cacheHit: 0.6,
  };

  static readonly lab = MOONSHOT_AI_LAB;

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  // The `:eu` suffix routes the request to Blackfuel's EU-hosted variant.
  modelToHostModel = (): string => "moonshotai/Kimi-K3:eu";
}

MoonshotAiKimiK3EuropeBlackfuelStream satisfies StreamEndpointConstructor;
