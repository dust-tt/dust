import { WithDustFireworksKimiK2Dot6Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksGlobalKimiK2Dot6Stream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_kimi_k2_dot_six";

export class DustFireworksGlobalKimiK2Dot6Stream extends WithDustFireworksKimiK2Dot6Config(
  FireworksGlobalKimiK2Dot6Stream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksGlobalKimiK2Dot6Stream);
