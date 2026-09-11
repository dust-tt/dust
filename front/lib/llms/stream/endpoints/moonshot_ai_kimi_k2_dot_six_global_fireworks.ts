import { WithDustMoonshotAiKimiK2Dot6Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MoonshotAiKimiK2Dot6GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k2_dot_six_global_fireworks";

export class DustMoonshotAiKimiK2Dot6GlobalFireworksStream extends WithDustMoonshotAiKimiK2Dot6Config(
  MoonshotAiKimiK2Dot6GlobalFireworksStream
) {
  // Mirrors `availableIfOneOf` on FIREWORKS_KIMI_K2P6_MODEL_CONFIG: the legacy
  // config gates the model picker, this gates the router.
  static readonly endpointFilter = {
    featureFlags: { contains: "fireworks_new_model_feature" as const },
  };
}

defineDustStreamEndpoint(DustMoonshotAiKimiK2Dot6GlobalFireworksStream);
