import { WithDustMoonshotAiKimiK3Config } from "@app/lib/llms/providers/fireworks/models/kimi_k3";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MoonshotAiKimiK3EuropeBlackfuelStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_eu_blackfuel";

export class DustMoonshotAiKimiK3EuropeBlackfuelStream extends WithDustMoonshotAiKimiK3Config(
  MoonshotAiKimiK3EuropeBlackfuelStream
) {
  static readonly endpointFilter = {
    featureFlags: { contains: "blackfuel_inference" as const },
  };
}

defineDustStreamEndpoint(DustMoonshotAiKimiK3EuropeBlackfuelStream);
