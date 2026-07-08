import { WithDustFireworksKimiK2Dot5Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksGlobalKimiK2Dot5Stream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_kimi_k2_dot_five";

export class DustFireworksGlobalKimiK2Dot5Stream extends WithDustFireworksKimiK2Dot5Config(
  FireworksGlobalKimiK2Dot5Stream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksGlobalKimiK2Dot5Stream);
