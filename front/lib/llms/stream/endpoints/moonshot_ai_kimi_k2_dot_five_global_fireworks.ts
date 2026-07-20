import { WithDustMoonshotAiKimiK2Dot5Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MoonshotAiKimiK2Dot5GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k2_dot_five_global_fireworks";

export class DustMoonshotAiKimiK2Dot5GlobalFireworksStream extends WithDustMoonshotAiKimiK2Dot5Config(
  MoonshotAiKimiK2Dot5GlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMoonshotAiKimiK2Dot5GlobalFireworksStream);
