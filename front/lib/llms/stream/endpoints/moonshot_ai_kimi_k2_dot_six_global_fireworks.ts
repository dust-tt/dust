import { WithDustMoonshotAiKimiK2Dot6Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MoonshotAiKimiK2Dot6GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k2_dot_six_global_fireworks";

export class DustMoonshotAiKimiK2Dot6GlobalFireworksStream extends WithDustMoonshotAiKimiK2Dot6Config(
  MoonshotAiKimiK2Dot6GlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMoonshotAiKimiK2Dot6GlobalFireworksStream);
