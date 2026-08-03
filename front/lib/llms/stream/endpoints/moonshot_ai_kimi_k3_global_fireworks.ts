import { WithDustMoonshotAiKimiK3Config } from "@app/lib/llms/providers/fireworks/models/kimi_k3";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";

export class DustMoonshotAiKimiK3GlobalFireworksStream extends WithDustMoonshotAiKimiK3Config(
  MoonshotAiKimiK3GlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMoonshotAiKimiK3GlobalFireworksStream);
