import { WithDustFireworksDeepSeekV4ProConfig } from "@app/lib/llms/providers/fireworks/models/deepseek_v4_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksDeepSeekV4ProGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_deepseek_v4_pro_global_fireworks";

export class DustFireworksDeepSeekV4ProGlobalFireworksStream extends WithDustFireworksDeepSeekV4ProConfig(
  FireworksDeepSeekV4ProGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksDeepSeekV4ProGlobalFireworksStream);
