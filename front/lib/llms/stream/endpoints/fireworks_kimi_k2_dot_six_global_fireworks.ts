import { WithDustFireworksKimiK2Dot6Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksKimiK2Dot6GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_kimi_k2_dot_six_global_fireworks";

export class DustFireworksKimiK2Dot6GlobalFireworksStream extends WithDustFireworksKimiK2Dot6Config(
  FireworksKimiK2Dot6GlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksKimiK2Dot6GlobalFireworksStream);
