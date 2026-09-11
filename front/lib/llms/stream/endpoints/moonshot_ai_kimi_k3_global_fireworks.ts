import { WithDustMoonshotAiKimiK3Config } from "@app/lib/llms/providers/fireworks/models/kimi_k3";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";

export class DustMoonshotAiKimiK3GlobalFireworksStream extends WithDustMoonshotAiKimiK3Config(
  MoonshotAiKimiK3GlobalFireworksStream
) {
  // Mirrors `availableIfOneOf` on FIREWORKS_KIMI_K3_MODEL_CONFIG: the legacy
  // config gates the model picker, this gates the router.
  static readonly endpointFilter = {
    featureFlags: { contains: "fireworks_new_model_feature" as const },
  };
}

defineDustStreamEndpoint(DustMoonshotAiKimiK3GlobalFireworksStream);
