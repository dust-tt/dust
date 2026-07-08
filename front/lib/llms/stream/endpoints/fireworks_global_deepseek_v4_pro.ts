import { WithDustFireworksDeepSeekV4ProConfig } from "@app/lib/llms/providers/fireworks/models/deepseek_v4_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksGlobalDeepSeekV4ProStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_deepseek_v4_pro";

export class DustFireworksGlobalDeepSeekV4ProStream extends WithDustFireworksDeepSeekV4ProConfig(
  FireworksGlobalDeepSeekV4ProStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksGlobalDeepSeekV4ProStream);
